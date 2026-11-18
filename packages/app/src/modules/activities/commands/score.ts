// `activities.occurrences.record_score` (groups and activities parity spec REQ-A15, Q-A21, glossary *Score*; E10-S07
// #272): the score of a match or sparring — `scoreHome`, `scoreAway` (0–99, both or neither: both null clears it) and an
// optional note — recorded by the session's assigned coach, a coach of its group, the coordinator of its section or the
// club administrator (the grants that check off attendance), once the session started and also after it is closed.
// 422 `score_not_applicable` for another type, 409 `score_before_start` before the start, 409 `occurrence_not_planned`
// for a cancelled session. Saved against the session version; undoable (the undo restores the previous score only).
import type { EntityManager } from '@mikro-orm/postgresql'
import { registerCommand, type CommandHandler, type CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { z } from 'zod'
import { authorizeScoped, trustedScopeOf, type TargetLock } from '@/modules/foundation'
import { activitiesErrors } from '../api/errors'
import { Activity, Occurrence } from '../data/entities'
import { occurrenceScoreSchema } from '../data/validators'
import { resultNoteOrNull, scoreProblem, scoreView, type ScoreView } from '../lib/score'
import { CHECK_OFF_KINDS, checkOffRole, checkOffTarget } from './check-off'
import { OCCURRENCE_RESOURCE_KIND, occurrenceSnapshot, type OccurrenceSnapshot } from './occurrences'
import { activitiesLog, inWriteTransaction, type ActivitiesCommandResult } from './shared'

export type ScoreCommandResult = ActivitiesCommandResult<Occurrence, OccurrenceSnapshot> & { score: ScoreView | null }

function loadOccurrence(ctx: CommandRuntimeContext) {
  return (em: EntityManager, id: string, lock: TargetLock): Promise<Occurrence | null> => {
    const scope = trustedScopeOf(ctx)
    if (!scope) return Promise.resolve(null)
    return em.findOne(Occurrence, { id, ...scope, deletedAt: null }, lock)
  }
}

function scoreSpec<TSchema extends z.ZodType<{ id: string }>>(ctx: CommandRuntimeContext, input: TSchema) {
  const load = loadOccurrence(ctx)
  return {
    input,
    resourceKind: OCCURRENCE_RESOURCE_KIND,
    allowedKinds: CHECK_OFF_KINDS,
    loadTarget: (parsed: z.output<TSchema>, em: EntityManager, lock: TargetLock) => load(em, parsed.id, lock),
    resolveTarget: (_parsed: z.output<TSchema>, entity: Occurrence | null) => checkOffTarget(entity as Occurrence),
  }
}

const recordScoreCommand: CommandHandler<Record<string, unknown>, ScoreCommandResult> = {
  id: 'activities.occurrences.record_score',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const now = new Date()
    return inWriteTransaction(ctx, 'activities.occurrences.record_score', async (em) => {
      const authorized = await authorizeScoped(scoreSpec(ctx, occurrenceScoreSchema), rawInput, ctx, em)
      const row = authorized.entity as Occurrence
      const activity = await em.findOne(
        Activity,
        { id: row.activityId, tenantId: row.tenantId, organizationId: row.organizationId },
        { fields: ['id', 'type'] },
      )
      const problem = scoreProblem(activity?.type ?? 'other', row, now)
      if (problem === 'not_applicable') await activitiesErrors.throw('score_not_applicable')
      if (problem === 'cancelled') await activitiesErrors.throw('occurrence_not_planned', { status: row.status })
      if (problem === 'before_start') await activitiesErrors.throw('score_before_start')
      const { scoreHome, scoreAway, note } = authorized.parsed
      const before = occurrenceSnapshot(row)
      row.scoreHome = scoreHome
      row.scoreAway = scoreAway
      // Clearing the score clears its note too.
      row.resultNote = scoreHome === null ? null : resultNoteOrNull(note)
      row.updatedAt = now
      await em.flush()
      return { entity: row, actingRole: checkOffRole(authorized.actingRole), before, score: scoreView(row) }
    })
  },
  buildLog: ({ result }) =>
    activitiesLog({
      result,
      resourceKind: OCCURRENCE_RESOURCE_KIND,
      labelKey: 'activities.audit.occurrences.recordScore',
      fallback: 'Record a session score',
      after: occurrenceSnapshot(result.entity),
      parent: { resourceKind: 'activities.activity', resourceId: result.entity.activityId },
    }),
  async authorizeReplay({ ctx, logEntry }) {
    await authorizeScoreReplay(ctx, logEntry.resourceId)
  },
  async undo({ ctx, logEntry }) {
    const before = logEntry.snapshotBefore as OccurrenceSnapshot | null | undefined
    if (!before?.id) throw new Error('[internal] missing session snapshot for undo')
    const row = await authorizeScoreReplay(ctx, before.id)
    row.scoreHome = before.scoreHome ?? null
    row.scoreAway = before.scoreAway ?? null
    row.resultNote = before.resultNote ?? null
    row.updatedAt = new Date()
    await (ctx.transactionalEm as EntityManager).flush()
  },
}

/** The undo of a score is authorized like the score, through the session. */
async function authorizeScoreReplay(ctx: CommandRuntimeContext, id: string | null | undefined): Promise<Occurrence> {
  const em = ctx.transactionalEm
  if (!em || !id) throw new Error('[internal] score replay needs the replay transaction and the id')
  const authorized = await authorizeScoped(scoreSpec(ctx, z.object({ id: z.uuid() })), { id }, ctx, em, {
    mode: 'replay',
  })
  return authorized.entity as Occurrence
}

registerCommand(recordScoreCommand)
