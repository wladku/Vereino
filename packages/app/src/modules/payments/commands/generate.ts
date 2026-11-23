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
import { createLogger } from '@open-mercato/shared/lib/logger'
import { calendarDateInZone } from '@vereino/core'
import { z } from 'zod'
import { authorizeScoped, type AuthorizeScopedSpec, type TargetLock } from '@/modules/foundation'
import { paymentsErrors } from '../api/errors'
import { Charge, ChargeGeneration } from '../data/entities'
import { automaticGenerationSince, tryLockGeneration } from '../data/queries'
import { chargeGenerateSchema, chargeGenerationUndoSchema } from '../data/validators'
import { planCharges } from '../lib/charge-plan'
import {
  automaticGenerationRecorded,
  generationDue,
  periodInGenerationRange,
  periodOfDate,
  type GenerationDecision,
} from '../lib/payments-rules'
import { clubClock, type PaymentsScope } from '../services/directory'
import { loadGenerationInputs } from '../services/generation'
import { storedPaymentsSettings } from '../services/read'
import {
  PAYMENTS_WRITE_KINDS,
  authorizePaymentsJob,
  clubTarget,
  emitAfterCommit,
  emitAfterReplayCommit,
  inWriteTransaction,
  paymentsJobLog,
  paymentsLog,
  trustedTenantId,
  type PaymentsCommandResult,
  type PaymentsJobScope,
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

type GenerationClock = Awaited<ReturnType<typeof clubClock>>

function scopeOf(generation: ChargeGeneration): { tenantId: string; organizationId: string } {
  return { tenantId: generation.tenantId, organizationId: generation.organizationId }
}

/**
 * The undo of one generation (#108; #403), with the caller's transactional `em` and the generation row-locked or
 * authorized by the caller: 409 `generation_already_undone` for an undone run, 409 `generation_in_progress` while
 * another generation (or undo) of the club holds the advisory lock; otherwise cancels the run's charges that are still
 * `open` (reason `generation_undone`; nothing is deleted), marks the run undone and returns the cancelled charge ids.
 * Shared by the audit-log undo of `payments.charges.generate` and `payments.charge_generations.undo`.
 */
async function undoGeneration(em: EntityManager, generation: ChargeGeneration): Promise<string[]> {
  if (generation.undoneAt) await paymentsErrors.throw('generation_already_undone')
  if (!(await tryLockGeneration(em, generation.organizationId))) {
    await paymentsErrors.throw('generation_in_progress')
  }
  const open = await em.find(Charge, {
    ...scopeOf(generation),
    generationId: generation.id,
    status: 'open',
    deletedAt: null,
  })
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
  return open.map((charge) => charge.id)
}

/**
 * Plans and writes one generation of `period` — the run row and its charges — with the caller's transactional `em`,
 * under the club's advisory lock the caller already holds. A plan with a fee over the per-session limit writes nothing
 * and returns those fees. Shared by the manual `payments.charges.generate` and the daily `payments.charges.generate_due`;
 * the daily one passes `automatic`, and its plan with nothing to create or skip writes nothing either (#666).
 */
async function writeGeneration(
  ctx: CommandRuntimeContext,
  em: EntityManager,
  input: {
    id: string
    scope: { tenantId: string; organizationId: string }
    period: string
    clock: GenerationClock
    automatic?: boolean
  },
): Promise<{ generation: ChargeGeneration | null; charges: Charge[]; overLimitFees: string[] }> {
  const { id, scope, period, clock } = input
  const plan = planCharges(await loadGenerationInputs(ctx.container, em, scope, period, clock))
  if (plan.overLimitFees.length > 0) return { generation: null, charges: [], overLimitFees: plan.overLimitFees }
  if (input.automatic && !automaticGenerationRecorded({ created: plan.charges.length, skipped: plan.skipped })) {
    return { generation: null, charges: [], overLimitFees: [] }
  }
  const generation = em.create(ChargeGeneration, {
    id,
    ...scope,
    period,
    createdCount: plan.charges.length,
    skippedCount: plan.skipped,
    payerMissingCount: plan.payerMissing,
  })
  em.persist(generation)
  const charges = plan.charges.map((planned) =>
    em.create(Charge, {
      id: randomUUID(),
      ...scope,
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
  return { generation, charges, overLimitFees: [] }
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

      const { generation, charges, overLimitFees } = await writeGeneration(ctx, em, {
        id,
        scope,
        period: parsed.period,
        clock,
      })
      if (!generation) {
        return paymentsErrors.throw('charge_amount_over_limit', { fee: overLimitFees.join(', ') })
      }
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
    const cancelled = await undoGeneration(ctx.transactionalEm as EntityManager, generation)
    if (cancelled.length > 0) {
      // Not `emitAfterCommit`: the replay transaction commits only after the bus's audit write (#184).
      emitAfterReplayCommit(ctx, 'payments.charge.cancelled', scopeOf(generation), {
        id: generation.id,
        generationId: generation.id,
        chargeIds: cancelled,
      })
    }
  },
}

registerCommand(generateChargesCommand)

// --- payments.charge_generations.undo (the generation list's "Undo"; owner decision (a) on #403) ---

export type ChargeGenerationUndoResult = PaymentsCommandResult<ChargeGeneration, ChargeGenerationSummary> & {
  cancelled: number
}

/**
 * `payments.charge_generations.undo`: the administrator's undo of one generation from the generation list — the
 * undo of #108 for any run, including one written by the daily job, whose audit entry has no user to own an undo
 * (the spec's risk row "Automatic generation creates charges the club did not expect"). Send the generation's lock
 * token. Not undoable itself: the cancelled charges stay cancelled, and the month can be generated again by hand.
 */
const undoGenerationCommand: CommandHandler<Record<string, unknown>, ChargeGenerationUndoResult> = {
  id: 'payments.charge_generations.undo',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const result = await inWriteTransaction(ctx, 'payments.charge_generations.undo', async (em) => {
      const authorized = await authorizeScoped(
        {
          input: chargeGenerationUndoSchema,
          resourceKind: CHARGE_GENERATION_RESOURCE_KIND,
          allowedKinds: PAYMENTS_WRITE_KINDS,
          loadTarget: (parsed, txEm, lock) => {
            const tenantId = trustedTenantId(ctx)
            if (!tenantId) return Promise.resolve(null)
            return txEm.findOne(ChargeGeneration, { id: parsed.id, tenantId, deletedAt: null }, lock)
          },
          resolveTarget: (_parsed, entity) => clubTarget(entity as ChargeGeneration),
        },
        rawInput,
        ctx,
        em,
      )
      const generation = authorized.entity as ChargeGeneration
      const before = summaryOf(generation)
      const chargeIds = await undoGeneration(em, generation)
      return { entity: generation, actingRole: authorized.actingRole, before, chargeIds }
    })
    const { entity: generation, chargeIds, ...rest } = result
    if (chargeIds.length > 0) {
      await emitAfterCommit('payments.charge.cancelled', scopeOf(generation), {
        id: generation.id,
        generationId: generation.id,
        chargeIds,
      })
    }
    return { ...rest, entity: generation, cancelled: chargeIds.length }
  },
  buildLog: ({ result }) =>
    paymentsLog({
      result,
      resourceKind: CHARGE_GENERATION_RESOURCE_KIND,
      labelKey: 'payments.audit.generations.undo',
      fallback: 'Undo a charge generation',
      after: { ...summaryOf(result.entity), cancelled: result.cancelled },
    }),
}

registerCommand(undoGenerationCommand)

// --- payments.charges.generate_due (the daily `payments:generate-charges` job; DD-C08, #301) ---

const logger = createLogger('payments').child({ component: 'generate-due' })

/**
 * Why the daily run generated nothing beyond the pure rule: the lock is held, a fee is over its limit, or the plan has
 * nothing to create or skip (no fee schedules or rosters yet; nothing is recorded and the next run looks again, #666).
 */
export type GenerateDueOutcome =
  | GenerationDecision
  | { due: false; period: string; reason: 'in_progress' | 'amount_over_limit' | 'nothing_to_generate' }

export type GenerateDueResult = {
  job: PaymentsJobScope
  outcome: GenerateDueOutcome
  summary: ChargeGenerationSummary | null
}

/** The club's calendar day on which migration B was applied, or null (logged) when its row cannot be read. */
async function migrationAppliedOn(ctx: CommandRuntimeContext, scope: PaymentsScope, timeZone: string) {
  try {
    const appliedAt = await automaticGenerationSince(ctx.container.resolve<EntityManager>('em').fork())
    if (appliedAt) return calendarDateInZone(appliedAt, timeZone)
    logger.warn('Migration B is not recorded; the automatic generation waits', { ...scope })
  } catch (error: unknown) {
    logger.warn('The migration record could not be read; the automatic generation waits', { ...scope, err: error })
  }
  return null
}

/**
 * `payments.charges.generate_due`: generates the current month in the club's calendar when the daily rule says so
 * (`generationDue`: switch on, migration B's month passed, on or after the generation day, no generation of the month
 * yet — an undone one counts). It writes the same generation as the manual command, under the same advisory lock: a
 * held lock (a manual run in progress) or a month generated meanwhile generates nothing, and the next daily run looks
 * again; so does a plan with nothing to create or skip, which records no generation (#666). Not undoable from the
 * audit log (there is no user to own the undo); the administrator undoes the run from
 * the generation list (`payments.charge_generations.undo`, #403).
 */
const generateDueCommand: CommandHandler<Record<string, unknown>, GenerateDueResult> = {
  id: 'payments.charges.generate_due',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const job = await authorizePaymentsJob(ctx, 'payments.charges.generate_due.authorize', rawInput)
    const scope = { tenantId: job.tenantId, organizationId: job.organizationId }
    const clock = await clubClock(ctx.container, scope, job.now)
    const settings = await storedPaymentsSettings(ctx.container, scope)
    const monthGenerated = (em: EntityManager, period: string) =>
      em.count(ChargeGeneration, { ...scope, period, deletedAt: null }).then((count) => count > 0)
    const decision = generationDue({
      today: clock.today,
      autoGenerate: settings?.autoGenerateCharges ?? true,
      generationDay: settings?.generationDay ?? 1,
      migrationAppliedOn: await migrationAppliedOn(ctx, scope, clock.timeZone),
      monthGenerated: await monthGenerated(
        ctx.container.resolve<EntityManager>('em').fork(),
        periodOfDate(clock.today),
      ),
    })
    if (!decision.due) return { job, outcome: decision, summary: null }

    const id = randomUUID()
    type Written =
      | { generation: ChargeGeneration; chargeIds: string[] }
      | {
          generation: null
          reason: 'in_progress' | 'generated' | 'amount_over_limit' | 'nothing_to_generate'
          overLimitFees?: string[]
        }
    const written = await inWriteTransaction(ctx, 'payments.charges.generate_due', async (em): Promise<Written> => {
      if (!(await tryLockGeneration(em, scope.organizationId))) return { generation: null, reason: 'in_progress' }
      // Re-read under the lock: a manual run may have generated the month since the decision.
      if (await monthGenerated(em, decision.period)) return { generation: null, reason: 'generated' }
      const { generation, charges, overLimitFees } = await writeGeneration(ctx, em, {
        id,
        scope,
        period: decision.period,
        clock,
        automatic: true,
      })
      if (!generation && overLimitFees.length > 0)
        return { generation: null, reason: 'amount_over_limit', overLimitFees }
      if (!generation) return { generation: null, reason: 'nothing_to_generate' }
      return { generation, chargeIds: charges.map((charge) => charge.id) }
    })
    if (!written.generation) {
      if (written.reason === 'amount_over_limit') {
        logger.warn('A fee is over its per-session limit; the month is not generated automatically', {
          ...scope,
          period: decision.period,
          fees: written.overLimitFees?.length ?? 0,
        })
      }
      return { job, outcome: { due: false, period: decision.period, reason: written.reason }, summary: null }
    }
    if (written.chargeIds.length > 0) {
      await emitAfterCommit('payments.charge.created', scope, {
        id: written.generation.id,
        generationId: written.generation.id,
        chargeIds: written.chargeIds,
      })
    }
    return { job, outcome: decision, summary: summaryOf(written.generation) }
  },
  buildLog: ({ result }) =>
    paymentsJobLog({
      job: result.job,
      labelKey: 'payments.audit.jobs.generateDue',
      fallback: 'Generate the month’s charges automatically',
      context: {
        period: result.outcome.period,
        generated: result.outcome.due,
        reason: result.outcome.due ? null : result.outcome.reason,
        ...(result.summary ? { generationId: result.summary.id, created: result.summary.created } : {}),
      },
    }),
}

registerCommand(generateDueCommand)
