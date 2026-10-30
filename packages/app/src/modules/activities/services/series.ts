// Writing a series' sessions (club spec DD-10; foundation II DD-G03): re-plans the future sessions of an activity from
// its stored definition — creates the missing slots, moves the movable sessions, removes the slots the rule no longer
// produces, never touches past, detached or pinned sessions — after the conflict check refuses an overbooking (409).
// Runs inside the caller's write transaction under the schedule lock.
import { randomUUID } from 'node:crypto'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { Recurrence, normalizeLocalTime, type CalendarDate, type Recurrence as RecurrenceRule } from '@vereino/core'
import { parseRecurrence } from '@/modules/foundation'
import { activitiesErrors } from '../api/errors'
import { type Activity, Occurrence } from '../data/entities'
import { lockSchedule } from '../data/queries'
import type { SessionChanges } from '../commands/shared'
import { lastSessionDay, ruleYieldsSessions } from '../lib/activities-rules'
import type { ActivitiesScope } from './directory'
import { assertNoConflicts, findConflicts, futureSessions, plannedSessions, sessionPlan } from './schedule'

export type Clock = { today: CalendarDate; timeZone: string }

/** The stored rule of an activity, or null for a one-off activity. */
export function activityRule(activity: Pick<Activity, 'recurrenceRule' | 'startsOn'>): Promise<RecurrenceRule | null> {
  if (!activity.recurrenceRule) return Promise.resolve(null)
  return parseRecurrence({ rrule: activity.recurrenceRule, startsOn: activity.startsOn })
}

/** The stored text of a submitted rule with its exceptions, or null for a one-off activity (422 on a bad rule). */
export async function storedRule(
  text: string | null | undefined,
  exdates: readonly string[] | undefined,
  startsOn: string,
): Promise<{ rule: RecurrenceRule | null; text: string | null }> {
  if (!text) return { rule: null, text: null }
  const rule = await parseRecurrence({ rrule: text, exdates, startsOn })
  return { rule, text: Recurrence.toText(rule) }
}

/** 422 for end times or dates that run backwards, or a series without any session from today on. */
export async function assertSeriesShape(
  shape: { startTime: string; endTime: string; startsOn: string; endsOn: string | null; rule: RecurrenceRule | null },
  clock: Clock,
): Promise<void> {
  if (normalizeLocalTime(shape.endTime) <= normalizeLocalTime(shape.startTime)) {
    await activitiesErrors.throw('activity_times_inverted')
  }
  if (shape.endsOn !== null && shape.endsOn < shape.startsOn) await activitiesErrors.throw('activity_dates_inverted')
  const last = lastSessionDay(shape.rule, shape.startsOn, shape.endsOn)
  const yields = shape.rule === null || ruleYieldsSessions(shape.rule, shape.startsOn, shape.endsOn)
  if (!yields || (last !== null && last < clock.today)) await activitiesErrors.throw('activity_no_sessions')
}

/** Re-plans the activity's sessions from `clock.today` to the horizon and moves `generated_until`. */
export async function replanSeries(
  ctx: CommandRuntimeContext,
  em: EntityManager,
  activity: Activity,
  clock: Clock,
): Promise<SessionChanges> {
  const scope: ActivitiesScope = { tenantId: activity.tenantId, organizationId: activity.organizationId }
  await lockSchedule(em, activity.organizationId)
  const { sessions, generatedUntil } = plannedSessions(
    {
      rule: await activityRule(activity),
      startsOn: activity.startsOn,
      endsOn: activity.endsOn ?? null,
      startTime: activity.defaultStartTime,
      endTime: activity.defaultEndTime,
      isActive: activity.isActive,
    },
    clock.today,
    clock.timeZone,
  )
  const plan = sessionPlan(await futureSessions(em, scope, activity.id, clock.today), sessions, clock.today)
  const coachPersonId = activity.defaultCoachPersonId ?? null
  await assertNoConflicts(
    await findConflicts(
      ctx.container,
      em,
      scope,
      {
        candidates: plan.upsert.map(({ occurrence }) => ({
          key: occurrence.date,
          startAt: occurrence.startAt,
          endAt: occurrence.endAt,
        })),
        placeId: activity.defaultPlaceId,
        coachPersonId,
        ignoreIds: [
          ...plan.upsert.flatMap((entry) => (entry.existing ? [entry.existing.id] : [])),
          ...plan.remove.map((entry) => entry.id),
        ],
      },
      'save',
    ),
  )
  const changes: SessionChanges = { createdIds: [], updatedIds: [], removedIds: [] }
  const now = new Date()
  for (const { occurrence, existing } of plan.upsert) {
    if (existing) {
      const row = existing.row
      const unchanged =
        row.startAt.getTime() === occurrence.startAt.getTime() &&
        row.endAt.getTime() === occurrence.endAt.getTime() &&
        row.placeId === activity.defaultPlaceId &&
        (row.coachPersonId ?? null) === coachPersonId
      if (unchanged) continue
      row.startAt = occurrence.startAt
      row.endAt = occurrence.endAt
      row.placeId = activity.defaultPlaceId
      row.coachPersonId = coachPersonId
      row.needsReschedule = false
      row.updatedAt = now
      changes.updatedIds.push(row.id)
      continue
    }
    const id = randomUUID()
    em.persist(
      em.create(Occurrence, {
        id,
        ...scope,
        activityId: activity.id,
        groupId: activity.groupId,
        sectionId: activity.sectionId,
        occurrenceDate: occurrence.date,
        startAt: occurrence.startAt,
        endAt: occurrence.endAt,
        placeId: activity.defaultPlaceId,
        coachPersonId,
      }),
    )
    changes.createdIds.push(id)
  }
  for (const { row } of plan.remove) {
    row.deletedAt = now
    row.updatedAt = now
    changes.removedIds.push(row.id)
  }
  activity.generatedUntil = generatedUntil
  await em.flush()
  return changes
}

/**
 * Restores soft-deleted sessions (the undo of a delete) one by one, each checked against the schedule as it is now,
 * so an undo never overbooks a place or a coach (409).
 */
export async function restoreSessions(
  ctx: CommandRuntimeContext,
  em: EntityManager,
  rows: readonly Occurrence[],
): Promise<string[]> {
  const restored: string[] = []
  for (const row of rows) {
    const scope = { tenantId: row.tenantId, organizationId: row.organizationId }
    await lockSchedule(em, row.organizationId)
    if (row.status === 'planned') {
      await assertNoConflicts(
        await findConflicts(
          ctx.container,
          em,
          scope,
          {
            candidates: [{ key: row.id, startAt: row.startAt, endAt: row.endAt }],
            placeId: row.placeId,
            coachPersonId: row.coachPersonId ?? null,
            ignoreIds: [row.id],
          },
          'save',
        ),
      )
    }
    row.deletedAt = null
    row.updatedAt = new Date()
    await em.flush()
    restored.push(row.id)
  }
  return restored
}
