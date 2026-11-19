// The charge ledger commands of phase 4 step 3 (payments spec API table → `payments.payments.record`,
// `payments.charges.cancel`, `payments.payments.reverse`; REQ-011, REQ-012, TEST-020; issue #109 E07-S02):
//
// - recording a cash or transfer payment of a charge: at most what remains (422 `payment_exceeds_remaining` "The amount
//   exceeds the remaining 50 zł"), never in the future (422 `payment_date_in_future`), never on a cancelled or forfeited
//   charge (409 `charge_not_payable`); the charge's status is derived again (`partially_paid`, `paid`);
// - cancelling an `open` charge with nothing paid, with a required reason kept on the charge and in the audit log
//   (409 `charge_has_payments`, `charge_not_cancellable`);
// - reversing a cash or transfer payment (the owner's default of 2026-11-06 on #109): a negative entry of the same
//   charge that names the original and carries the reason; once per payment (409 `payment_already_reversed`), never
//   for an online payment or a reversing entry (409 `payment_not_reversible`; an online payment is refunded, DD-42);
// - a manual charge (payments parity spec REQ-C06, DD-C12; #295): a debtor, a description, an amount and a due date,
//   payable to the club; the payer is the one named (an active guardian of the debtor, or the adult debtor — else 422
//   `charge_payer_not_eligible`) or follows the *Payer* rule, otherwise the charge is created with `payer_missing`.
//   Never edited: a wrong one is cancelled and created again;
// - assigning a payer (#295) to an `open` or `partially_paid` charge without one (409 `charge_payer_already_set`,
//   `charge_not_payable`; 422 `charge_payer_not_eligible`). Run with a worker context (the guardianship subscriber),
//   the same command assigns the ward's current primary payer to every such charge of the ward instead.
//
// Every command row-locks the charge and checks its lock token (send the charge's `updatedAt` in the platform
// optimistic-lock header), so concurrent payments of one charge never over-pay it. Money is never edited or deleted:
// the commands are not undoable, and a reversing entry is the correction.
import { randomUUID } from 'node:crypto'
import { LockMode } from '@mikro-orm/core'
import type { EntityManager } from '@mikro-orm/postgresql'
import { registerCommand, type CommandHandler, type CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { notFound } from '@open-mercato/shared/lib/crud/errors'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import type { z } from 'zod'
import type { Scope } from '@vereino/core'
import { authorizeScoped, type AuthorizeScopedSpec, type TargetLock } from '@/modules/foundation'
import { paymentsErrors } from '../api/errors'
import { Charge, Payment } from '../data/entities'
import {
  chargeAssignPayerSchema,
  chargeAssignWardPayerSchema,
  chargeCancelSchema,
  chargeManualCreateSchema,
  paymentRecordSchema,
  paymentReverseSchema,
} from '../data/validators'
import {
  OPEN_CHARGE_STATUSES,
  amountDueOf,
  cancelRefusal,
  formatZloty,
  paidTotal,
  paymentRefusal,
  remainingOf,
  reverseRefusal,
  settledStatus,
} from '../lib/charge-ledger'
import {
  assignPayerRefusal,
  manualDueDateInRange,
  manualDueRange,
  manualPayerOf,
  payerEligible,
} from '../lib/manual-charges'
import type { ChargeStatus } from '../lib/payments-rules'
import { clubClock, payerFactsOf, primaryPayers, type PaymentsScope } from '../services/directory'
import { sendOverdueReminders, type OverdueRemindersRun } from '../services/overdue-reminders'
import {
  PAYMENTS_WRITE_KINDS,
  authorizePaymentsJob,
  clubTarget,
  emitAfterCommit,
  inWriteTransaction,
  paymentsJobLog,
  paymentsLog,
  trustedTenantId,
  type PaymentsCommandResult,
  type PaymentsJobScope,
} from './shared'

export const CHARGE_RESOURCE_KIND = 'payments.charge'
export const PAYMENT_RESOURCE_KIND = 'payments.payment'

export type ChargeLedgerSnapshot = {
  id: string
  tenantId: string
  organizationId: string
  status: ChargeStatus
  amountDue: number
  paid: number
  cancelReason: string | null
}

export type PaymentSnapshot = {
  id: string
  tenantId: string
  organizationId: string
  chargeId: string
  amount: number
  method: string
  paidOn: string
  reversesPaymentId: string | null
  chargeStatus: ChargeStatus
}

export type ChargeCancelResult = PaymentsCommandResult<Charge, ChargeLedgerSnapshot> & { reason: string }

export type PaymentCommandResult = PaymentsCommandResult<Payment, null> & {
  charge: Charge
  remaining: number
  reason?: string
}

function chargeSnapshot(row: Charge, paid: number): ChargeLedgerSnapshot {
  return {
    id: row.id,
    tenantId: row.tenantId,
    organizationId: row.organizationId,
    status: row.status,
    amountDue: amountDueOf(row),
    paid,
    cancelReason: row.cancelReason ?? null,
  }
}

function paymentSnapshot(row: Payment, charge: Charge): PaymentSnapshot {
  return {
    id: row.id,
    tenantId: row.tenantId,
    organizationId: row.organizationId,
    chargeId: row.chargeId,
    amount: row.amount,
    method: row.method,
    paidOn: row.paidOn,
    reversesPaymentId: row.reversesPaymentId ?? null,
    chargeStatus: charge.status,
  }
}

/** The caller's own person (the `self` grant), recorded as who received the money. */
function selfPersonId(scope: Scope): string | null {
  return scope.find((grant) => grant.kind === 'self')?.ids?.[0] ?? null
}

/** A charge of the trusted tenant, row-locked; the scope check then narrows it to the club. */
function chargeLoader(ctx: CommandRuntimeContext) {
  return (em: EntityManager, id: string, lock: TargetLock): Promise<Charge | null> => {
    const tenantId = trustedTenantId(ctx)
    if (!tenantId) return Promise.resolve(null)
    return em.findOne(Charge, { id, tenantId, deletedAt: null }, lock)
  }
}

function chargeSpec<TSchema extends z.ZodType<{ id: string }>>(
  input: TSchema,
  ctx: CommandRuntimeContext,
): AuthorizeScopedSpec<TSchema, Charge> {
  const load = chargeLoader(ctx)
  return {
    input,
    resourceKind: CHARGE_RESOURCE_KIND,
    allowedKinds: PAYMENTS_WRITE_KINDS,
    loadTarget: (parsed, em, lock) => load(em, parsed.id, lock),
    resolveTarget: (_parsed, entity) => clubTarget(entity as Charge),
  }
}

/**
 * The live payments of a charge, read inside the write transaction after the charge's row lock. An online overpayment
 * "to refund" (#110, Q-049) is money held for the payer, not a payment of the charge, so it is left out.
 */
export function ledgerOf(em: EntityManager, charge: Charge): Promise<Payment[]> {
  return em.find(Payment, {
    chargeId: charge.id,
    tenantId: charge.tenantId,
    organizationId: charge.organizationId,
    isOverpayment: false,
    deletedAt: null,
  })
}

const recordPaymentCommand: CommandHandler<Record<string, unknown>, PaymentCommandResult> = {
  id: 'payments.payments.record',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const result = await inWriteTransaction(ctx, 'payments.payments.record', async (em) => {
      const authorized = await authorizeScoped(chargeSpec(paymentRecordSchema, ctx), rawInput, ctx, em)
      const charge = authorized.entity as Charge
      const { parsed, tenantId, organizationId } = authorized
      const { today } = await clubClock(ctx.container, { tenantId, organizationId })
      const paid = paidTotal(await ledgerOf(em, charge))
      const amountDue = amountDueOf(charge)
      const remaining = remainingOf(amountDue, paid)
      const refusal = paymentRefusal({
        status: charge.status,
        remaining,
        amount: parsed.amount,
        paidOn: parsed.paidOn,
        today,
      })
      if (refusal === 'payment_exceeds_remaining') {
        await paymentsErrors.throw(refusal, { remaining: formatZloty(remaining), remainingAmount: remaining })
      } else if (refusal) {
        await paymentsErrors.throw(refusal)
      }
      const now = new Date()
      const payment = em.create(Payment, {
        id: randomUUID(),
        tenantId,
        organizationId,
        chargeId: charge.id,
        amount: parsed.amount,
        method: parsed.method,
        paidOn: parsed.paidOn,
        reference: parsed.reference?.trim() || null,
        recordedByPersonId: selfPersonId(authorized.scope),
        recordedByUserId: ctx.auth?.sub ?? null,
        createdAt: now,
        updatedAt: now,
      })
      em.persist(payment)
      charge.status = settledStatus(charge.status, amountDue, paid + parsed.amount)
      charge.updatedAt = now
      await em.flush()
      return {
        entity: payment,
        actingRole: authorized.actingRole,
        before: null,
        charge,
        remaining: remainingOf(amountDue, paid + parsed.amount),
      }
    })
    await emitAfterCommit(
      'payments.payment.recorded',
      { tenantId: result.entity.tenantId, organizationId: result.entity.organizationId },
      { id: result.entity.id, chargeId: result.charge.id, method: result.entity.method },
    )
    return result
  },
  buildLog: ({ result }) =>
    paymentsLog({
      result,
      resourceKind: PAYMENT_RESOURCE_KIND,
      labelKey: 'payments.audit.payments.record',
      fallback: 'Record a payment',
      after: paymentSnapshot(result.entity, result.charge),
    }),
}

const cancelChargeCommand: CommandHandler<Record<string, unknown>, ChargeCancelResult> = {
  id: 'payments.charges.cancel',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const result = await inWriteTransaction(ctx, 'payments.charges.cancel', async (em) => {
      const authorized = await authorizeScoped(chargeSpec(chargeCancelSchema, ctx), rawInput, ctx, em)
      const charge = authorized.entity as Charge
      const paid = paidTotal(await ledgerOf(em, charge))
      const refusal = cancelRefusal({ status: charge.status, paid })
      if (refusal) await paymentsErrors.throw(refusal)
      const before = chargeSnapshot(charge, paid)
      const now = new Date()
      charge.status = 'cancelled'
      charge.cancelledAt = now
      charge.cancelReason = authorized.parsed.reason
      charge.updatedAt = now
      await em.flush()
      return { entity: charge, actingRole: authorized.actingRole, before, reason: authorized.parsed.reason }
    })
    const charge = result.entity
    await emitAfterCommit(
      'payments.charge.cancelled',
      { tenantId: charge.tenantId, organizationId: charge.organizationId },
      { id: charge.id, chargeIds: [charge.id] },
    )
    return result
  },
  buildLog: ({ result }) =>
    paymentsLog({
      result,
      resourceKind: CHARGE_RESOURCE_KIND,
      labelKey: 'payments.audit.charges.cancel',
      fallback: 'Cancel a charge',
      after: chargeSnapshot(result.entity, 0),
      context: { reason: result.reason },
    }),
}

const reversePaymentCommand: CommandHandler<Record<string, unknown>, PaymentCommandResult> = {
  id: 'payments.payments.reverse',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const result = await inWriteTransaction(ctx, 'payments.payments.reverse', async (em) => {
      const box: { original?: Payment } = {}
      const authorized = await authorizeScoped(
        {
          input: paymentReverseSchema,
          resourceKind: CHARGE_RESOURCE_KIND,
          allowedKinds: PAYMENTS_WRITE_KINDS,
          // The target is the payment's charge: it is row-locked and its lock token is checked.
          loadTarget: async (parsed, txEm, lock) => {
            const tenantId = trustedTenantId(ctx)
            if (!tenantId) return null
            const original = await txEm.findOne(Payment, { id: parsed.id, tenantId, deletedAt: null })
            if (!original) return null
            box.original = original
            return txEm.findOne(
              Charge,
              { id: original.chargeId, tenantId, organizationId: original.organizationId, deletedAt: null },
              lock,
            )
          },
          resolveTarget: (_parsed, entity) => clubTarget(entity as Charge),
        },
        rawInput,
        ctx,
        em,
      )
      const charge = authorized.entity as Charge
      const original = box.original as Payment
      const ledger = await ledgerOf(em, charge)
      const refusal = reverseRefusal({
        method: original.method,
        reversesPaymentId: original.reversesPaymentId ?? null,
        reversed: ledger.some((row) => row.reversesPaymentId === original.id),
      })
      if (refusal) await paymentsErrors.throw(refusal)
      const { today } = await clubClock(ctx.container, {
        tenantId: authorized.tenantId,
        organizationId: authorized.organizationId,
      })
      const now = new Date()
      const reversal = em.create(Payment, {
        id: randomUUID(),
        tenantId: charge.tenantId,
        organizationId: charge.organizationId,
        chargeId: charge.id,
        amount: -original.amount,
        method: original.method,
        paidOn: today,
        reference: authorized.parsed.reason,
        recordedByPersonId: selfPersonId(authorized.scope),
        recordedByUserId: ctx.auth?.sub ?? null,
        reversesPaymentId: original.id,
        createdAt: now,
        updatedAt: now,
      })
      em.persist(reversal)
      const amountDue = amountDueOf(charge)
      const paid = paidTotal(ledger) - original.amount
      charge.status = settledStatus(charge.status, amountDue, paid)
      charge.updatedAt = now
      await em.flush()
      return {
        entity: reversal,
        actingRole: authorized.actingRole,
        before: null,
        charge,
        remaining: remainingOf(amountDue, paid),
        reason: authorized.parsed.reason,
      }
    })
    await emitAfterCommit(
      'payments.payment.reversed',
      { tenantId: result.entity.tenantId, organizationId: result.entity.organizationId },
      { id: result.entity.id, chargeId: result.charge.id, reversesPaymentId: result.entity.reversesPaymentId },
    )
    return result
  },
  buildLog: ({ result }) =>
    paymentsLog({
      result,
      resourceKind: PAYMENT_RESOURCE_KIND,
      labelKey: 'payments.audit.payments.reverse',
      fallback: 'Reverse a payment',
      after: paymentSnapshot(result.entity, result.charge),
      context: { reason: result.reason },
    }),
}

async function personNotFound(): Promise<never> {
  const { translate } = await resolveTranslations()
  throw notFound(translate('payments.errors.person_not_found', 'Person not found'))
}

export type ChargePayerSnapshot = {
  id: string
  tenantId: string
  organizationId: string
  sourceType: string
  personId: string | null
  payerPersonId: string | null
  payerMissing: boolean
  description: string
  amount: number
  dueDate: string
  status: ChargeStatus
}

function chargePayerSnapshot(row: Charge): ChargePayerSnapshot {
  return {
    id: row.id,
    tenantId: row.tenantId,
    organizationId: row.organizationId,
    sourceType: row.sourceType,
    personId: row.personId ?? null,
    payerPersonId: row.payerPersonId ?? null,
    payerMissing: row.payerMissing,
    description: row.description,
    amount: row.amount,
    dueDate: row.dueDate,
    status: row.status,
  }
}

export type ManualChargeResult = PaymentsCommandResult<Charge, null>

const createManualChargeCommand: CommandHandler<Record<string, unknown>, ManualChargeResult> = {
  id: 'payments.charges.create_manual',
  // DD-C12: a manual charge is never edited or undone; a wrong one is cancelled and created again.
  isUndoable: false,
  async execute(rawInput, ctx) {
    const id = randomUUID()
    const result = await inWriteTransaction(ctx, 'payments.charges.create_manual', async (em) => {
      const authorized = await authorizeScoped(
        {
          input: chargeManualCreateSchema,
          resourceKind: CHARGE_RESOURCE_KIND,
          allowedKinds: PAYMENTS_WRITE_KINDS,
          resolveTarget: (_parsed, _entity, scope) => clubTarget({ id, ...scope }),
        },
        rawInput,
        ctx,
        em,
      )
      const { parsed, tenantId, organizationId } = authorized
      const scope = { tenantId, organizationId }
      const { today } = await clubClock(ctx.container, scope)
      const facts = await payerFactsOf(ctx.container, scope, parsed.personId, today, em)
      if (!facts) return personNotFound()
      if (!manualDueDateInRange(parsed.dueDate, today)) {
        await paymentsErrors.throw('charge_due_date_out_of_range', { ...manualDueRange(today), field: 'dueDate' })
      }
      let payerPersonId = manualPayerOf(facts)
      if (parsed.payerPersonId) {
        if (!payerEligible(parsed.payerPersonId, facts)) await paymentsErrors.throw('charge_payer_not_eligible')
        payerPersonId = parsed.payerPersonId
      }
      const now = new Date()
      const charge = em.create(Charge, {
        id,
        ...scope,
        sourceType: 'manual',
        sourceId: null,
        personId: parsed.personId,
        payerPersonId,
        payerMissing: payerPersonId === null,
        description: parsed.description,
        amount: parsed.amount,
        discountAmount: 0,
        dueDate: parsed.dueDate,
        payee: 'club',
        status: 'open',
        createdAt: now,
        updatedAt: now,
      })
      em.persist(charge)
      await em.flush()
      return { entity: charge, actingRole: authorized.actingRole, before: null }
    })
    const charge = result.entity
    await emitAfterCommit(
      'payments.charge.created',
      { tenantId: charge.tenantId, organizationId: charge.organizationId },
      { chargeIds: [charge.id], sourceType: 'manual' },
    )
    return result
  },
  buildLog: ({ result }) =>
    paymentsLog({
      result,
      resourceKind: CHARGE_RESOURCE_KIND,
      labelKey: 'payments.audit.charges.createManual',
      fallback: 'Add a charge by hand',
      after: chargePayerSnapshot(result.entity),
    }),
}

/** B-22 "Assign payer": one charge and the payer the administrator chose. */
export type ChargePayerResult = PaymentsCommandResult<Charge, ChargePayerSnapshot> & { mode: 'charge' }

/** The guardianship subscriber: the ward's charges that got the ward's current primary payer. */
export type WardPayerResult = {
  mode: 'ward'
  scope: PaymentsScope
  chargeIds: string[]
  payerPersonId: string | null
}

function assignChosenPayer(rawInput: unknown, ctx: CommandRuntimeContext): Promise<ChargePayerResult> {
  return inWriteTransaction(ctx, 'payments.charges.assign_payer', async (em) => {
    const authorized = await authorizeScoped(chargeSpec(chargeAssignPayerSchema, ctx), rawInput, ctx, em)
    const charge = authorized.entity as Charge
    const refusal = assignPayerRefusal(charge)
    if (refusal) await paymentsErrors.throw(refusal)
    const scope = { tenantId: authorized.tenantId, organizationId: authorized.organizationId }
    const { today } = await clubClock(ctx.container, scope)
    const facts = charge.personId ? await payerFactsOf(ctx.container, scope, charge.personId, today, em) : null
    if (!facts || !payerEligible(authorized.parsed.payerPersonId, facts)) {
      await paymentsErrors.throw('charge_payer_not_eligible')
    }
    const before = chargePayerSnapshot(charge)
    charge.payerPersonId = authorized.parsed.payerPersonId
    charge.payerMissing = false
    charge.updatedAt = new Date()
    await em.flush()
    return { mode: 'charge', entity: charge, actingRole: authorized.actingRole, before }
  })
}

function assignWardPayer(rawInput: unknown, ctx: CommandRuntimeContext): Promise<WardPayerResult> {
  return inWriteTransaction(ctx, 'payments.charges.assign_payer', async (em) => {
    const authorized = await authorizeScoped(
      {
        input: chargeAssignWardPayerSchema,
        resourceKind: CHARGE_RESOURCE_KIND,
        allowedKinds: ['system_job'],
        resolveTarget: (_parsed, _entity, trusted) => ({ id: trusted.organizationId, ...trusted }),
        lock: 'none',
        scopeSource: { job: true },
      },
      rawInput,
      ctx,
      em,
    )
    const scope = { tenantId: authorized.tenantId, organizationId: authorized.organizationId }
    const wardId = authorized.parsed.wardPersonId
    // The payer is read again now, so a stale or replayed event assigns only the payer that is current.
    const { today } = await clubClock(ctx.container, scope)
    const payerPersonId = (await primaryPayers(ctx.container, scope, [wardId], today, em)).get(wardId) ?? null
    if (!payerPersonId) return { mode: 'ward', scope, chargeIds: [], payerPersonId: null }
    const charges = await em.find(
      Charge,
      {
        ...scope,
        personId: wardId,
        payerMissing: true,
        status: { $in: [...OPEN_CHARGE_STATUSES] },
        deletedAt: null,
      },
      { lockMode: LockMode.PESSIMISTIC_WRITE },
    )
    const now = new Date()
    for (const charge of charges) {
      charge.payerPersonId = payerPersonId
      charge.payerMissing = false
      charge.updatedAt = now
    }
    if (charges.length > 0) await em.flush()
    return { mode: 'ward', scope, chargeIds: charges.map((charge) => charge.id), payerPersonId }
  })
}

const assignPayerCommand: CommandHandler<Record<string, unknown>, ChargePayerResult | WardPayerResult> = {
  id: 'payments.charges.assign_payer',
  isUndoable: false,
  async execute(rawInput, ctx) {
    if (!ctx.systemActor) {
      const result = await assignChosenPayer(rawInput, ctx)
      const charge = result.entity
      await emitAfterCommit(
        'payments.charge.payer_assigned',
        { tenantId: charge.tenantId, organizationId: charge.organizationId },
        { id: charge.id, payerPersonId: charge.payerPersonId },
      )
      return result
    }
    const result = await assignWardPayer(rawInput, ctx)
    for (const chargeId of result.chargeIds) {
      await emitAfterCommit('payments.charge.payer_assigned', result.scope, {
        id: chargeId,
        payerPersonId: result.payerPersonId,
      })
    }
    return result
  },
  // The automatic assignment is a worker's; each charge's `payments.charge.payer_assigned` event records it.
  buildLog: ({ result }) =>
    result.mode === 'charge'
      ? paymentsLog({
          result,
          resourceKind: CHARGE_RESOURCE_KIND,
          labelKey: 'payments.audit.charges.assignPayer',
          fallback: 'Assign a payer to a charge',
          after: chargePayerSnapshot(result.entity),
        })
      : null,
}

// --- payments.charges.remind_overdue (the daily `payments:overdue-reminders` job; DD-C09, #301) ---

export type RemindOverdueResult = { job: PaymentsJobScope } & OverdueRemindersRun

/**
 * `payments.charges.remind_overdue`: today's overdue reminders of the club, one dispatch per payer
 * (`services/overdue-reminders.ts`). Not undoable: a message sent cannot be taken back.
 */
const remindOverdueCommand: CommandHandler<Record<string, unknown>, RemindOverdueResult> = {
  id: 'payments.charges.remind_overdue',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const job = await authorizePaymentsJob(ctx, 'payments.charges.remind_overdue', rawInput)
    const scope = { tenantId: job.tenantId, organizationId: job.organizationId }
    return { job, ...(await sendOverdueReminders(ctx.container, scope, job.now)) }
  },
  buildLog: ({ result }) =>
    paymentsJobLog({
      job: result.job,
      labelKey: 'payments.audit.jobs.remindOverdue',
      fallback: 'Remind the payers of overdue charges',
      context: { today: result.today, switchedOff: result.switchedOff, ...result.counts },
    }),
}

registerCommand(remindOverdueCommand)
registerCommand(recordPaymentCommand)
registerCommand(cancelChargeCommand)
registerCommand(reversePaymentCommand)
registerCommand(createManualChargeCommand)
registerCommand(assignPayerCommand)
