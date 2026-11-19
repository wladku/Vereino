// `payments.chargeService` (payments parity spec REQ-C01, DD-C01, Contract 1; facilities spec DD-19; #291): the charge
// of a rental, written in the rental's own transaction. `facilities` resolves the token with `hasRegistration` and
// declares the contract in its own `facilities/services/charges.ts`; the type is declared again here, structurally
// equal, so neither module imports the other. The service writes only through the caller's `em`, takes the tenant
// and organization from the caller's command context (never from the input), emits nothing itself and returns
// `afterCommit`, which the caller runs once its transaction has committed.
import { randomUUID } from 'node:crypto'
import { LockMode } from '@mikro-orm/core'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { trustedScopeOf } from '@/modules/foundation'
import { paymentsErrors } from '../api/errors'
import { emitAfterCommit } from '../commands/shared'
import { Charge, Payment } from '../data/entities'
import { sourceAmountValid, sourceCancelDecision, sourceChargeStatus, sourcePayerOf } from '../lib/charge-ledger'
import type { ChargeStatus } from '../lib/payments-rules'
import type { PaymentsScope } from './directory'

export const PAYMENTS_CHARGE_SERVICE = 'payments.chargeService' as const

export type SourceChargeInput = {
  sourceType: 'rental'
  sourceId: string
  payee: 'owner_institution'
  payeeInstitutionId: string | null
  payerInstitutionId?: string | null
  payerPersonId?: string | null
  /** The typed-in name of an unregistered renter (DD-C01): the payer when neither id is given. */
  payerDisplayName?: string | null
  /** Grosz. */
  amount: number
  /** `YYYY-MM-DD` in the club's calendar. */
  dueDate: string
  description: string
}

export type SourceChargeOutcome = 'cancelled' | 'forfeited'

/**
 * What a moved source changes on its charge (#221 L2): the due date from the new payment deadline, the description
 * naming the new slot, and the amount and payee re-quoted for a new place. The payer never changes.
 */
export type SourceChargeReschedule = {
  sourceType: 'rental'
  sourceId: string
  payeeInstitutionId: string | null
  /** Grosz. */
  amount: number
  /** `YYYY-MM-DD` in the club's calendar. */
  dueDate: string
  description: string
}

export type PaymentsChargeService = {
  createForSource(
    em: EntityManager,
    input: SourceChargeInput,
    ctx: CommandRuntimeContext,
  ): Promise<{ chargeId: string; afterCommit: () => Promise<void> }>
  cancelForSource(
    em: EntityManager,
    input: { sourceType: 'rental'; sourceId: string; outcome: SourceChargeOutcome },
    ctx: CommandRuntimeContext,
  ): Promise<{ warning?: 'charge_paid'; afterCommit?: () => Promise<void> }>
  /**
   * Rewrites the live charge of a moved source in the caller's transaction (#221 L2): only while no payment was ever
   * recorded on it; a charge holding a payment is left as it is and answers the warning `charge_paid`. Nothing happens
   * when the source has no live charge.
   */
  rescheduleForSource(
    em: EntityManager,
    input: SourceChargeReschedule,
    ctx: CommandRuntimeContext,
  ): Promise<{ warning?: 'charge_paid' }>
  /** The stored status of each of the given charges of the caller's organization; unknown or foreign ids are absent. */
  statusOf(chargeIds: readonly string[], ctx: CommandRuntimeContext): Promise<Map<string, ChargeStatus>>
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/

const noEffect = async (): Promise<void> => {}

/** The caller's trusted tenant and organization; a call without one fails closed. */
function scopeOf(ctx: CommandRuntimeContext): PaymentsScope {
  // A staff command carries a session; the rental lifecycle worker runs as a job (`jobCommandContext`).
  const scope = trustedScopeOf(ctx) ?? trustedScopeOf(ctx, { job: true })
  if (!scope) throw new Error('[internal] payments.chargeService needs a command context with a trusted scope')
  return scope
}

/** The live (not cancelled) charge of a source, row-locked in the caller's transaction when `lock` is set. */
function liveSourceCharge(
  em: EntityManager,
  scope: PaymentsScope,
  source: { sourceType: 'rental'; sourceId: string },
  lock: boolean,
): Promise<Charge | null> {
  return em.findOne(
    Charge,
    {
      ...scope,
      sourceType: source.sourceType,
      sourceId: source.sourceId,
      status: { $ne: 'cancelled' as const },
      deletedAt: null,
    },
    lock ? { lockMode: LockMode.PESSIMISTIC_WRITE } : {},
  )
}

export function createChargeService(): PaymentsChargeService {
  return {
    async createForSource(em, input, ctx) {
      const scope = scopeOf(ctx)
      // Idempotent per source: a second create returns the live charge and writes nothing.
      const existing = await liveSourceCharge(em, scope, input, false)
      if (existing) return { chargeId: existing.id, afterCommit: noEffect }
      const payer = sourcePayerOf(input)
      if (!payer) return paymentsErrors.throw('charge_payer_required')
      if (!sourceAmountValid(input.amount) || !CALENDAR_DATE.test(input.dueDate)) {
        await paymentsErrors.throw('charge_amount_invalid')
      }
      const now = new Date()
      const charge = em.create(Charge, {
        id: randomUUID(),
        ...scope,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        personId: null,
        ...payer,
        payerMissing: false,
        payee: input.payee,
        payeeInstitutionId: input.payeeInstitutionId,
        description: input.description,
        amount: input.amount,
        dueDate: input.dueDate,
        status: sourceChargeStatus(input.amount),
        createdAt: now,
        updatedAt: now,
      })
      em.persist(charge)
      await em.flush()
      return {
        chargeId: charge.id,
        afterCommit: () =>
          emitAfterCommit('payments.charge.created', scope, { chargeIds: [charge.id], sourceType: input.sourceType }),
      }
    },

    async cancelForSource(em, input, ctx) {
      const scope = scopeOf(ctx)
      const charge = await liveSourceCharge(em, scope, input, true)
      if (!charge) return {}
      const payments = await em.count(Payment, { ...scope, chargeId: charge.id, deletedAt: null })
      const decision = sourceCancelDecision({ status: charge.status, hasPayments: payments > 0 })
      if (decision === 'charge_paid') return { warning: 'charge_paid' }
      if (decision === 'none') return {}
      const now = new Date()
      charge.status = input.outcome
      charge.cancelledAt = now
      charge.updatedAt = now
      await em.flush()
      return {
        afterCommit: () =>
          emitAfterCommit('payments.charge.cancelled', scope, {
            id: charge.id,
            chargeIds: [charge.id],
            sourceType: input.sourceType,
            outcome: input.outcome,
          }),
      }
    },

    async rescheduleForSource(em, input, ctx) {
      const scope = scopeOf(ctx)
      if (!sourceAmountValid(input.amount) || !CALENDAR_DATE.test(input.dueDate)) {
        await paymentsErrors.throw('charge_amount_invalid')
      }
      const charge = await liveSourceCharge(em, scope, input, true)
      if (!charge) return {}
      const payments = await em.count(Payment, { ...scope, chargeId: charge.id, deletedAt: null })
      // The same rule as a cancellation: a charge that ever held money keeps its terms, so a move never reprices or
      // re-dates money already paid.
      const decision = sourceCancelDecision({ status: charge.status, hasPayments: payments > 0 })
      if (decision === 'charge_paid') return { warning: 'charge_paid' }
      if (decision === 'none') return {}
      charge.dueDate = input.dueDate
      charge.description = input.description
      charge.amount = input.amount
      charge.payeeInstitutionId = input.payeeInstitutionId
      charge.status = sourceChargeStatus(input.amount)
      charge.updatedAt = new Date()
      await em.flush()
      return {}
    },

    async statusOf(chargeIds, ctx) {
      const scope = scopeOf(ctx)
      const ids = [...new Set(chargeIds)].filter((id) => UUID.test(id))
      if (ids.length === 0) return new Map()
      const em = ctx.container.resolve<EntityManager>('em').fork()
      const rows = await em.find(Charge, { id: { $in: ids }, ...scope, deletedAt: null }, { fields: ['id', 'status'] })
      return new Map(rows.map((row) => [row.id, row.status]))
    },
  }
}
