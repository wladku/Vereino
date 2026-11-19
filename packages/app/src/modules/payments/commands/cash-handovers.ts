// "Accept handover", B-33 (payments spec REQ-033, TEST-046; issue #118 E07-S11; J-010 step 4): the club — the club
// administrator, until the treasurer role of #245 — receives from one collector the cash of the selected payments.
// One `RG/YYYY/MM/NNN` number is issued under the club's advisory lock in the month the handover is accepted (the
// club's calendar), the payments carry the handover and leave the collector's "Cash with you".
//
// Refusals: 422 `cash_handover_payments_invalid` (a payment unknown in the club, not cash with a receipt, a reversing
// entry, or collected by someone else — one handover is one collector), 409 `cash_already_settled` (a payment already
// in a handover), 409 `cash_payment_reversed`. The payments are row-locked in id order, so two handovers of the same
// payment never both succeed. Money is never edited: the command is not undoable, and a payment reversed later keeps
// its handover (the owner's defaults C and D on #118).
import { randomUUID } from 'node:crypto'
import { LockMode } from '@mikro-orm/core'
import { registerCommand, type CommandHandler } from '@open-mercato/shared/lib/commands'
import { authorizeScoped } from '@/modules/foundation'
import { paymentsErrors } from '../api/errors'
import { CashHandover, Payment } from '../data/entities'
import { lastHandoverNumber, lockHandoverNumbering } from '../data/queries'
import { cashHandoverAcceptSchema } from '../data/validators'
import { handoverPrefix, handoverRefusal, handoverSequence, nextHandoverNumber } from '../lib/cash-handovers'
import { clubClock } from '../services/directory'
import { selfPersonId } from './cash'
import { PAYMENTS_WRITE_KINDS, clubTarget, inWriteTransaction, paymentsLog, type PaymentsCommandResult } from './shared'

export const CASH_HANDOVER_RESOURCE_KIND = 'payments.cash_handover'

export type CashHandoverResult = PaymentsCommandResult<CashHandover, null> & {
  number: string
  collectorPersonId: string
  amount: number
  paymentIds: string[]
}

const acceptHandoverCommand: CommandHandler<Record<string, unknown>, CashHandoverResult> = {
  id: 'payments.cash_handovers.accept',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const handoverId = randomUUID()
    return inWriteTransaction(ctx, 'payments.cash_handovers.accept', async (em) => {
      const authorized = await authorizeScoped(
        {
          input: cashHandoverAcceptSchema,
          resourceKind: CASH_HANDOVER_RESOURCE_KIND,
          allowedKinds: PAYMENTS_WRITE_KINDS,
          resolveTarget: (_parsed, _entity, scope) => clubTarget({ id: handoverId, ...scope }),
        },
        rawInput,
        ctx,
        em,
      )
      const { parsed, tenantId, organizationId } = authorized
      const scope = { tenantId, organizationId }
      // Row locks in id order, so two handovers that share payments never deadlock and never both settle one.
      const payments = await em.find(
        Payment,
        { id: { $in: parsed.paymentIds }, ...scope, deletedAt: null },
        { lockMode: LockMode.PESSIMISTIC_WRITE, orderBy: { id: 'asc' } },
      )
      const reversals = await em.find(
        Payment,
        { ...scope, deletedAt: null, reversesPaymentId: { $in: parsed.paymentIds } },
        { fields: ['id', 'reversesPaymentId'] },
      )
      const reversed = new Set(reversals.map((row) => row.reversesPaymentId as string))
      const refusal = handoverRefusal({
        collectorPersonId: parsed.collectorPersonId,
        paymentIds: parsed.paymentIds,
        payments: payments.map((payment) => ({
          id: payment.id,
          method: payment.method,
          receiptNumber: payment.receiptNumber ?? null,
          collectedByPersonId: payment.collectedByPersonId ?? null,
          reversesPaymentId: payment.reversesPaymentId ?? null,
          cashHandoverId: payment.cashHandoverId ?? null,
          reversed: reversed.has(payment.id),
        })),
      })
      if (refusal) await paymentsErrors.throw(refusal)

      const { today } = await clubClock(ctx.container, scope)
      await lockHandoverNumbering(em, organizationId)
      const last = await lastHandoverNumber(em, scope, handoverPrefix(today))
      const number = nextHandoverNumber(today, (last && handoverSequence(last)) || 0)
      const now = new Date()
      const paymentIds = payments.map((payment) => payment.id)
      const amount = payments.reduce((sum, payment) => sum + payment.amount, 0)
      const handover = em.create(CashHandover, {
        id: handoverId,
        ...scope,
        number,
        collectorPersonId: parsed.collectorPersonId,
        receivedByPersonId: selfPersonId(authorized.scope),
        receivedByUserId: ctx.auth?.sub ?? null,
        amount,
        paymentIds,
        createdAt: now,
        updatedAt: now,
      })
      em.persist(handover)
      for (const payment of payments) {
        payment.cashHandoverId = handoverId
        payment.updatedAt = now
      }
      await em.flush()
      return {
        entity: handover,
        actingRole: authorized.actingRole,
        before: null,
        number,
        collectorPersonId: parsed.collectorPersonId,
        amount,
        paymentIds,
      }
    })
  },
  buildLog: ({ result }) =>
    paymentsLog({
      result,
      resourceKind: CASH_HANDOVER_RESOURCE_KIND,
      labelKey: 'payments.audit.cashHandover.accept',
      fallback: 'Accept cash handover',
      after: {
        number: result.number,
        collectorPersonId: result.collectorPersonId,
        amount: result.amount,
        paymentIds: result.paymentIds,
      },
      context: { number: result.number },
    }),
}

registerCommand(acceptHandoverCommand)
