// `activities.occurrences.generate` — the `activities:generate-occurrences` job (club spec DD-10 and *Events, Jobs*
// row; foundation II DD-G07): extends every active series of the organization to the 16-week horizon. It accepts only
// the `system_job` grant of the organization its context names (`jobCommandContext`), so no HTTP route reaches it; the
// worker and the module CLI dispatch it. Each series is extended in its own transaction under the schedule lock; a
// slot that already has a session (generated, detached or cancelled) is never generated again, and the unique slot
// index makes a retried run a no-op. A new session over a conflict the job cannot refuse is created with
// `needs_reschedule` for the coordinator. Not undoable: it only re-derives sessions from the audited series.
import { randomUUID } from 'node:crypto'
import type { EntityManager } from '@mikro-orm/postgresql'
import { registerCommand, type CommandHandler, type CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { getTelemetryRuntime } from '@open-mercato/shared/lib/telemetry/runtime'
import { addCalendarDays, expandOccurrences, type ActingRole, type CalendarDate } from '@vereino/core'
import { authorizeScoped } from '@/modules/foundation'
import { Activity, Occurrence } from '../data/entities'
import { lockSchedule } from '../data/queries'
import { generateOccurrencesSchema } from '../data/validators'
import { horizonEnd, lastSessionDay } from '../lib/activities-rules'
import { clubClock } from '../services/directory'
import { findConflicts } from '../services/schedule'
import { activityRule } from '../services/series'
import { emitAfterCommit, inWriteTransaction } from './shared'

const logger = createLogger('activities').child({ component: 'generate-occurrences' })

export type GenerateCounts = { processed: number; skipped: number; failed: number; created: number; flagged: number }

export type GenerateJobResult = {
  tenantId: string
  organizationId: string
  actingRole: ActingRole
  today: CalendarDate
  counts: GenerateCounts
}

type ExtendOutcome = { createdIds: string[]; flagged: number } | null

/** Extends one series from the day after `generated_until` to the horizon end; null when nothing was due. */
async function extendSeries(
  ctx: CommandRuntimeContext,
  activityId: string,
  scope: { tenantId: string; organizationId: string },
  clock: { today: CalendarDate; timeZone: string },
): Promise<ExtendOutcome> {
  return inWriteTransaction(ctx, 'activities.occurrences.generate.series', async (em) => {
    await lockSchedule(em, scope.organizationId)
    const activity = await em.findOne(Activity, { id: activityId, ...scope, deletedAt: null, isActive: true })
    const rule = activity ? await activityRule(activity) : null
    if (!activity || !rule) return null
    const after = activity.generatedUntil ? [addCalendarDays(activity.generatedUntil, 1)] : []
    const candidatesFrom = [clock.today, activity.startsOn, ...after].sort().at(-1) as CalendarDate
    const end = horizonEnd(clock.today)
    const last = lastSessionDay(rule, activity.startsOn, activity.endsOn ?? null)
    const to = last !== null && last < end ? last : end
    if (candidatesFrom > to) return null
    const generated = expandOccurrences(
      rule,
      {
        startsOn: activity.startsOn,
        startTime: activity.defaultStartTime,
        endTime: activity.defaultEndTime,
        timeZone: clock.timeZone,
      },
      { from: candidatesFrom, to },
    )
    const taken = await em.find(
      Occurrence,
      { ...scope, activityId, deletedAt: null, occurrenceDate: { $gte: candidatesFrom, $lte: to } },
      { fields: ['id', 'occurrenceDate'] },
    )
    const takenSlots = new Set(taken.map((row) => row.occurrenceDate))
    const fresh = generated.filter((session) => !takenSlots.has(session.date))
    const coachPersonId = activity.defaultCoachPersonId ?? null
    const report = await findConflicts(
      ctx.container,
      em,
      scope,
      {
        candidates: fresh.map((session) => ({ key: session.date, startAt: session.startAt, endAt: session.endAt })),
        placeId: activity.defaultPlaceId,
        coachPersonId,
      },
      'save',
    )
    const conflicting = new Set(report.conflicts.map((conflict) => conflict.key))
    const createdIds: string[] = []
    for (const session of fresh) {
      const id = randomUUID()
      em.persist(
        em.create(Occurrence, {
          id,
          ...scope,
          activityId,
          groupId: activity.groupId,
          sectionId: activity.sectionId,
          occurrenceDate: session.date,
          startAt: session.startAt,
          endAt: session.endAt,
          placeId: activity.defaultPlaceId,
          coachPersonId,
          needsReschedule: conflicting.has(session.date),
        }),
      )
      createdIds.push(id)
    }
    activity.generatedUntil = to
    await em.flush()
    return { createdIds, flagged: conflicting.size }
  })
}

const generateOccurrencesCommand: CommandHandler<Record<string, unknown>, GenerateJobResult> = {
  id: 'activities.occurrences.generate',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const authorized = await inWriteTransaction(ctx, 'activities.occurrences.generate.authorize', (em) =>
      authorizeScoped(
        {
          input: generateOccurrencesSchema,
          resourceKind: 'activities.organization',
          allowedKinds: ['system_job'],
          resolveTarget: (_parsed, _entity, scope) => ({ id: scope.organizationId, ...scope }),
          lock: 'none',
          scopeSource: { job: true },
        },
        rawInput,
        ctx,
        em,
      ),
    )
    const scope = { tenantId: authorized.tenantId, organizationId: authorized.organizationId }
    const clock = await clubClock(ctx.container, scope)
    const today = authorized.parsed.today ?? clock.today
    const end = horizonEnd(today)
    const em = ctx.container.resolve<EntityManager>('em').fork()
    const due = await em.find(
      Activity,
      {
        ...scope,
        deletedAt: null,
        isActive: true,
        recurrenceRule: { $ne: null },
        $or: [{ generatedUntil: null }, { generatedUntil: { $lt: end } }],
      },
      { fields: ['id'], orderBy: { id: 'asc' } },
    )
    const counts: GenerateCounts = { processed: 0, skipped: 0, failed: 0, created: 0, flagged: 0 }
    logger.info('Session generation started', { ...scope, today, due: due.length })
    for (const { id } of due) {
      try {
        const outcome = await extendSeries(ctx, id, scope, { today, timeZone: clock.timeZone })
        if (!outcome) {
          counts.skipped += 1
          continue
        }
        counts.processed += 1
        counts.created += outcome.createdIds.length
        counts.flagged += outcome.flagged
        if (outcome.createdIds.length > 0) {
          await emitAfterCommit('activities.occurrence.generated', scope, {
            id,
            createdIds: outcome.createdIds,
            updatedIds: [],
            removedIds: [],
          })
        }
      } catch (error: unknown) {
        counts.failed += 1
        logger.warn('Session generation failed for one series; the next run retries it', { ...scope, err: error })
        getTelemetryRuntime()?.reportError(error, { module: 'activities', code: 'activities.generate.failed' })
      }
    }
    logger.info('Session generation finished', { ...scope, today, ...counts })
    return { ...scope, actingRole: authorized.actingRole, today, counts }
  },
  async buildLog({ result }) {
    const { translate } = await resolveTranslations()
    return {
      actionLabel: translate('activities.audit.jobs.generate', 'Generate sessions'),
      resourceKind: 'activities.organization',
      resourceId: result.organizationId,
      tenantId: result.tenantId,
      organizationId: result.organizationId,
      context: { actingRole: result.actingRole, today: result.today, ...result.counts },
    }
  },
}

registerCommand(generateOccurrencesCommand)
