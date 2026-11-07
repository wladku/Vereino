// "Accept cash", phase 4 step 8 (payments spec API table → `payments.cash.record`; REQ-031, TEST-043; issue #114
// E07-S07; UX concept M-15, B-21): the collector selects the payer's open charges and the amount received; the
// amount pays them oldest first (a lower amount leaves the newest partially paid), one `KP/YYYY/MM/NNN` receipt number
// is issued for the whole acceptance, and the payer gets an e-mail confirmation unless the collector turns it off.
//
// Refusals: 422 `cash_charges_invalid` (a charge unknown in the club or of another payer), 409 `charge_not_payable`
// (cancelled, forfeited), 409 `charge_already_paid`, 422 `cash_exceeds_selected` (more than remains on the selection),
// 422 `payment_date_in_future`. The selected charges are row-locked in id order, so concurrent payments never over-pay
// them; the receipt numbering takes the club's advisory lock, so no number is issued twice. Like every `payments`
// write of phase 4 it needs the club administrator's grant (D-030); the coach's path is E07-S10 (#117). Money is
// never edited or deleted: the command is not undoable, and a reversing entry (`payments.payments.reverse`) corrects.
import { randomUUID } from 'node:crypto'
import { LockMode } from '@mikro-orm/core'
import type { EntityManager } from '@mikro-orm/postgresql'
import { registerCommand, type CommandHandler, type CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import type { Recipient, Scope } from '@vereino/core'
import { authorizeScoped, contactResolver, type DispatchService } from '@/modules/foundation'
import { paymentsErrors } from '../api/errors'
import { Charge, Payment } from '../data/entities'
import { lastReceiptNumber, lockReceiptNumbering } from '../data/queries'
import { cashRecordSchema } from '../data/validators'
import type { CashReceivedParams } from '../emails/templates'
import {
  allocateCash,
  cashRefusal,
  nextReceiptNumber,
  receiptPrefix,
  receiptSequence,
  selectedTotal,
  type CashCharge,
} from '../lib/cash'
import { amountDueOf, formatZloty, paidTotal, remainingOf, settledStatus } from '../lib/charge-ledger'
import { clubClock, findPersons } from '../services/directory'
import { chargeDescriptions } from '../services/ledger'
import { PAYMENT_RESOURCE_KIND } from './ledger'
import {
  PAYMENTS_WRITE_KINDS,
  clubTarget,
  emitAfterCommit,
  inWriteTransaction,
  paymentsLog,
  type PaymentsCommandResult,
} from './shared'

export type CashPaymentLine = {
  paymentId: string
  chargeId: string
  amount: number
  chargeStatus: string
  remaining: number
  chargeUpdatedAt: string
}

export type CashRecordResult = PaymentsCommandResult<Payment, null> & {
  receiptNumber: string
  payerPersonId: string
  amount: number
  paidOn: string
  payments: CashPaymentLine[]
  /** The dispatch of the confirmation e-mail, or null (turned off, or the payer has no address). */
  dispatchId: string | null
  scope: { tenantId: string; organizationId: string }
}

/** The caller's own person (the `self` grant): who collected the cash. */
function selfPersonId(scope: Scope): string | null {
  return scope.find((grant) => grant.kind === 'self')?.ids?.[0] ?? null
}

function calendarDate(value: unknown): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10)
}

type ConfirmationInput = {
  ctx: CommandRuntimeContext
  em: EntityManager
  scope: { tenantId: string; organizationId: string }
  grants: Scope
  actingRole: CashRecordResult['actingRole']
  payerPersonId: string
  collectorPersonId: string | null
  params: Omit<CashReceivedParams, 'collectorName' | 'lines'>
  lines: { paymentId: string; chargeId: string; amount: number; remaining: number }[]
}

/** Enqueues the payer's confirmation in the write transaction; null when the payer has no e-mail address. */
async function enqueueConfirmation(input: ConfirmationInput): Promise<string | null> {
  const { ctx, em, scope } = input
  const resolverCtx = { container: ctx.container, ...scope, scope: input.grants, em }
  const contacts = await contactResolver(ctx.container).contacts([input.payerPersonId], resolverCtx)
  const contact = contacts.find((row) => row.personId === input.payerPersonId)
  if (!contact?.email) return null
  const [descriptions, collectors] = await Promise.all([
    chargeDescriptions(
      ctx.container,
      scope,
      input.lines.map((line) => line.chargeId),
    ),
    findPersons(ctx.container, scope, input.collectorPersonId ? [input.collectorPersonId] : [], em),
  ])
  const collector = input.collectorPersonId ? collectors.get(input.collectorPersonId) : undefined
  const recipient: Recipient = {
    personId: contact.personId,
    userId: contact.userId,
    email: contact.email,
    locale: contact.locale,
    reasons: ['direct'],
    channels: ['email'],
  }
  const params: CashReceivedParams = {
    ...input.params,
    collectorName: collector ? `${collector.firstName} ${collector.lastName}` : null,
    lines: input.lines.map((line) => ({
      description: descriptions.get(line.chargeId) ?? '',
      amount: line.amount,
      remaining: line.remaining,
    })),
  }
  const { dispatchId } = await ctx.container.resolve<DispatchService>('foundationDispatch').enqueue(
    em,
    {
      template: 'payments.cash_received',
      params,
      recipients: [recipient],
      // The source is the receipt's first payment (a uuid); the receipt number keys the idempotency.
      source: { module: 'payments', type: 'payments:payment', id: input.lines[0]?.paymentId ?? input.payerPersonId },
      idempotencyKey: `payments:cash:${input.params.receiptNumber}`,
      actor: { userId: ctx.auth?.sub ?? null, actingRole: input.actingRole },
    },
    { ...scope, scope: input.grants, em },
  )
  return dispatchId
}

const recordCashCommand: CommandHandler<Record<string, unknown>, CashRecordResult> = {
  id: 'payments.cash.record',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const receiptId = randomUUID()
    const result = await inWriteTransaction(ctx, 'payments.cash.record', async (em) => {
      const authorized = await authorizeScoped(
        {
          input: cashRecordSchema,
          resourceKind: PAYMENT_RESOURCE_KIND,
          allowedKinds: PAYMENTS_WRITE_KINDS,
          resolveTarget: (_parsed, _entity, scope) => clubTarget({ id: receiptId, ...scope }),
        },
        rawInput,
        ctx,
        em,
      )
      const { parsed, tenantId, organizationId } = authorized
      const scope = { tenantId, organizationId }
      // Row locks in id order, so two acceptances that share charges never deadlock.
      const charges = await em.find(
        Charge,
        { id: { $in: parsed.chargeIds }, ...scope, deletedAt: null },
        { lockMode: LockMode.PESSIMISTIC_WRITE, orderBy: { id: 'asc' } },
      )
      if (
        charges.length !== parsed.chargeIds.length ||
        charges.some((charge) => charge.payerPersonId !== parsed.payerPersonId)
      ) {
        await paymentsErrors.throw('cash_charges_invalid')
      }
      // An online overpayment "to refund" (#110, Q-049) is not a payment of the charge, as in `ledgerOf`.
      const ledger = await em.find(Payment, {
        chargeId: { $in: parsed.chargeIds },
        ...scope,
        isOverpayment: false,
        deletedAt: null,
      })
      const paidByCharge = new Map(
        charges.map((charge) => [charge.id, paidTotal(ledger.filter((row) => row.chargeId === charge.id))]),
      )
      const selection: CashCharge[] = charges.map((charge) => ({
        id: charge.id,
        status: charge.status,
        dueDate: calendarDate(charge.dueDate),
        createdAt: charge.createdAt.toISOString(),
        remaining:
          charge.status === 'cancelled' ? 0 : remainingOf(amountDueOf(charge), paidByCharge.get(charge.id) ?? 0),
      }))
      const { today } = await clubClock(ctx.container, scope)
      const refusal = cashRefusal({ charges: selection, amount: parsed.amount, paidOn: parsed.paidOn, today })
      if (refusal === 'cash_exceeds_selected') {
        const selected = selectedTotal(selection)
        await paymentsErrors.throw(refusal, { selected: formatZloty(selected), selectedAmount: selected })
      } else if (refusal) {
        await paymentsErrors.throw(refusal)
      }

      await lockReceiptNumbering(em, organizationId)
      const last = await lastReceiptNumber(em, scope, receiptPrefix(parsed.paidOn))
      const receiptNumber = nextReceiptNumber(parsed.paidOn, (last && receiptSequence(last)) || 0)

      const collectorPersonId = selfPersonId(authorized.scope)
      const now = new Date()
      const byId = new Map(charges.map((charge) => [charge.id, charge]))
      const lines: CashPaymentLine[] = []
      const created: Payment[] = []
      for (const allocation of allocateCash(selection, parsed.amount)) {
        const charge = byId.get(allocation.chargeId) as Charge
        const payment = em.create(Payment, {
          id: randomUUID(),
          ...scope,
          chargeId: charge.id,
          amount: allocation.amount,
          method: 'cash',
          paidOn: parsed.paidOn,
          reference: null,
          recordedByPersonId: collectorPersonId,
          recordedByUserId: ctx.auth?.sub ?? null,
          collectedByPersonId: collectorPersonId,
          receiptNumber,
          createdAt: now,
          updatedAt: now,
        })
        em.persist(payment)
        created.push(payment)
        const amountDue = amountDueOf(charge)
        const paid = (paidByCharge.get(charge.id) ?? 0) + allocation.amount
        charge.status = settledStatus(charge.status, amountDue, paid)
        charge.updatedAt = now
        lines.push({
          paymentId: payment.id,
          chargeId: charge.id,
          amount: allocation.amount,
          chargeStatus: charge.status,
          remaining: remainingOf(amountDue, paid),
          chargeUpdatedAt: now.toISOString(),
        })
      }
      await em.flush()

      const dispatchId = parsed.notify
        ? await enqueueConfirmation({
            ctx,
            em,
            scope,
            grants: authorized.scope,
            actingRole: authorized.actingRole,
            payerPersonId: parsed.payerPersonId,
            collectorPersonId,
            params: { receiptNumber, amount: parsed.amount, paidOn: parsed.paidOn },
            lines,
          })
        : null
      return {
        entity: created[0],
        actingRole: authorized.actingRole,
        before: null,
        receiptNumber,
        payerPersonId: parsed.payerPersonId,
        amount: parsed.amount,
        paidOn: parsed.paidOn,
        payments: lines,
        dispatchId,
        scope,
      }
    })
    if (result.dispatchId) {
      await ctx.container.resolve<DispatchService>('foundationDispatch').publish(result.dispatchId, result.scope)
    }
    for (const line of result.payments) {
      await emitAfterCommit('payments.payment.recorded', result.scope, {
        id: line.paymentId,
        chargeId: line.chargeId,
        method: 'cash',
        receiptNumber: result.receiptNumber,
      })
    }
    return result
  },
  buildLog: ({ result }) =>
    paymentsLog({
      result,
      resourceKind: PAYMENT_RESOURCE_KIND,
      labelKey: 'payments.audit.cash.record',
      fallback: 'Accept cash',
      after: {
        receiptNumber: result.receiptNumber,
        payerPersonId: result.payerPersonId,
        amount: result.amount,
        paidOn: result.paidOn,
        payments: result.payments.map((line) => ({
          id: line.paymentId,
          chargeId: line.chargeId,
          amount: line.amount,
          chargeStatus: line.chargeStatus,
        })),
      },
      context: { receiptNumber: result.receiptNumber, notified: result.dispatchId !== null },
    }),
}

registerCommand(recordCashCommand)
