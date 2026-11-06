// `payments.charges.generate` (payments spec API table → `POST /api/payments/charges/generate`, REQ-011, REQ-018,
// TEST-018, TEST-048; B-21 "Generate period", flow F-07; issue #108): creates every charge of a period at once —
// one per fee, participant and period label — with the payer, the sibling or custom discount and the due date, and
// answers "created X, skipped Y (already existed), without payer Z". The period is `YYYY-MM`, from 12 months before to
// 12 months after the club's current month (422 `period_out_of_range`). Idempotent: the partial unique index keeps one
// live charge per fee, person and label, so a second run skips them all. One generation per club at a time: the
// club's advisory lock is tried, and a held lock answers 409 `generation_in_progress` at once.
//
// Undo (the owner's default of 2026-11-05 on #108): cancels the run's charges that are still `open` (status
// `cancelled`, reason `generation_undone`; nothing is deleted) and marks the run undone; a later run of the same period
// creates them again, because a cancelled charge leaves the unique index.
import { randomUUID } from 'node:crypto'
import type { EntityManager } from '@mikro-orm/postgresql'
import { registerCommand, type CommandHandler, type CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { z } from 'zod'
import { authorizeScoped, type AuthorizeScopedSpec, type TargetLock } from '@/modules/foundation'
import { paymentsErrors } from '../api/errors'
import { Charge, ChargeGeneration } from '../data/entities'
import { tryLockGeneration } from '../data/queries'
import { chargeGenerateSchema } from '../data/validators'
import { planCharges } from '../lib/charge-plan'
import { periodInGenerationRange } from '../lib/payments-rules'
import { clubClock } from '../services/directory'
import { loadGenerationInputs } from '../services/generation'
import {
  PAYMENTS_WRITE_KINDS,
  clubTarget,
  emitAfterCommit,
  emitAfterReplayCommit,
  inWriteTransaction,
  paymentsLog,
  trustedTenantId,
  type PaymentsCommandResult,
} from './shared'

export const CHARGE_GENERATION_RESOURCE_KIND = 'payments.charge_generation'

/** The reason stored on a charge its generation's undo cancelled. */
export const GENERATION_UNDONE_REASON = 'generation_undone'

export type ChargeGenerationSummary = {
  id: string
  tenantId: string
  organizationId: string
  period: string
  created: number
  skipped: number
  payerMissing: number
}

export type ChargeGenerationResult = PaymentsCommandResult<ChargeGeneration, null> & {
  summary: ChargeGenerationSummary
  chargeIds: string[]
}

function summaryOf(row: ChargeGeneration): ChargeGenerationSummary {
  return {
    id: row.id,
    tenantId: row.tenantId,
    organizationId: row.organizationId,
    period: row.period,
    created: row.createdCount,
    skipped: row.skippedCount,
    payerMissing: row.payerMissingCount,
  }
}

function replaySpec(ctx: CommandRuntimeContext): AuthorizeScopedSpec<z.ZodType<{ id: string }>, ChargeGeneration> {
  return {
    input: z.object({ id: z.uuid() }),
    resourceKind: CHARGE_GENERATION_RESOURCE_KIND,
    allowedKinds: PAYMENTS_WRITE_KINDS,
    lock: 'none',
    loadTarget: (parsed, em: EntityManager, lock: TargetLock) => {
      const tenantId = trustedTenantId(ctx)
      if (!tenantId) return Promise.resolve(null)
      return em.findOne(ChargeGeneration, { id: parsed.id, tenantId, deletedAt: null }, lock)
    },
    resolveTarget: (_parsed, entity) => clubTarget(entity as ChargeGeneration),
  }
}

async function authorizeGenerationReplay(
  ctx: CommandRuntimeContext,
  id: string | null | undefined,
): Promise<ChargeGeneration> {
  const em = ctx.transactionalEm
  if (!em || !id) throw new Error('[internal] generation replay needs the replay transaction and the id')
  const { entity } = await authorizeScoped(replaySpec(ctx), { id }, ctx, em, { mode: 'replay' })
  return entity as ChargeGeneration
}

const generateChargesCommand: CommandHandler<Record<string, unknown>, ChargeGenerationResult> = {
  id: 'payments.charges.generate',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const id = randomUUID()
    const result = await inWriteTransaction(ctx, 'payments.charges.generate', async (em) => {
      const authorized = await authorizeScoped(
        {
          input: chargeGenerateSchema,
          resourceKind: CHARGE_GENERATION_RESOURCE_KIND,
          allowedKinds: PAYMENTS_WRITE_KINDS,
          resolveTarget: (_parsed, _entity, scope) => clubTarget({ id, ...scope }),
        },
        rawInput,
        ctx,
        em,
      )
      const { parsed, tenantId, organizationId } = authorized
      const scope = { tenantId, organizationId }
      const clock = await clubClock(ctx.container, scope)
      if (!periodInGenerationRange(parsed.period, clock.today)) await paymentsErrors.throw('period_out_of_range')
      if (!(await tryLockGeneration(em, organizationId))) await paymentsErrors.throw('generation_in_progress')

      const plan = planCharges(await loadGenerationInputs(ctx.container, em, scope, parsed.period, clock))
      const generation = em.create(ChargeGeneration, {
        id,
        tenantId,
        organizationId,
        period: parsed.period,
        createdCount: plan.charges.length,
        skippedCount: plan.skipped,
        payerMissingCount: plan.payerMissing,
      })
      em.persist(generation)
      const charges = plan.charges.map((planned) =>
        em.create(Charge, {
          id: randomUUID(),
          tenantId,
          organizationId,
          sourceType: 'fee',
          sourceId: planned.feeId,
          personId: planned.personId,
          payerPersonId: planned.payerPersonId,
          payerMissing: planned.payerMissing,
          periodLabel: planned.periodLabel,
          description: planned.description,
          amount: planned.amount,
          discountAmount: planned.discountAmount,
          discountRuleId: planned.discountRuleId,
          dueDate: planned.dueDate,
          generationId: id,
        }),
      )
      em.persist(charges)
      await em.flush()
      return {
        entity: generation,
        actingRole: authorized.actingRole,
        before: null,
        summary: summaryOf(generation),
        chargeIds: charges.map((charge) => charge.id),
      }
    })
    if (result.chargeIds.length > 0) {
      await emitAfterCommit(
        'payments.charge.created',
        { tenantId: result.entity.tenantId, organizationId: result.entity.organizationId },
        { id: result.entity.id, generationId: result.entity.id, chargeIds: result.chargeIds },
      )
    }
    return result
  },
  buildLog: ({ result }) =>
    paymentsLog({
      result,
      resourceKind: CHARGE_GENERATION_RESOURCE_KIND,
      labelKey: 'payments.audit.charges.generate',
      fallback: 'Generate the charges of a period',
      after: result.summary,
    }),
  async authorizeReplay({ ctx, logEntry }) {
    await authorizeGenerationReplay(ctx, logEntry.resourceId)
  },
  async undo({ ctx, logEntry }) {
    const generation = await authorizeGenerationReplay(ctx, logEntry.resourceId)
    const em = ctx.transactionalEm as EntityManager
    if (generation.undoneAt) await paymentsErrors.throw('generation_already_undone')
    if (!(await tryLockGeneration(em, generation.organizationId))) {
      await paymentsErrors.throw('generation_in_progress')
    }
    const scope = { tenantId: generation.tenantId, organizationId: generation.organizationId }
    const open = await em.find(Charge, { ...scope, generationId: generation.id, status: 'open', deletedAt: null })
    const now = new Date()
    for (const charge of open) {
      charge.status = 'cancelled'
      charge.cancelledAt = now
      charge.cancelReason = GENERATION_UNDONE_REASON
      charge.updatedAt = now
    }
    generation.undoneAt = now
    generation.cancelledCount = open.length
    generation.updatedAt = now
    await em.flush()
    if (open.length > 0) {
      // Not `emitAfterCommit`: the replay transaction commits only after the bus's audit write (#184).
      emitAfterReplayCommit(ctx, 'payments.charge.cancelled', scope, {
        id: generation.id,
        generationId: generation.id,
        chargeIds: open.map((charge) => charge.id),
      })
    }
  },
}

registerCommand(generateChargesCommand)
