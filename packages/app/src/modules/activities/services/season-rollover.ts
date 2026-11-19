// The `activities` season contributor (people life-cycle spec REQ-L08, DD-L10, the `SeasonContributor` row; phase L9,
// #311): `groups` declares the contract (`groups/services/season-rollover.ts`) and reads it with `hasRegistration`;
// `activities` registers it in `di.ts` under `groups.season.activities`. The candidates are the live, active recurring
// activities of the plan's groups that run past the old season's last day. `end` sets `ends_on` to the last day and
// re-plans the series (its later sessions go); `end_and_copy` also creates a copy that starts on the new season's
// first day — same group, rule (without its exceptions and end), coach and settings, with the new name, times or place
// the plan gives — and runs open-ended when the original did, else to the new season's last day. The preview reports
// the copies' collisions (place over capacity, a rental, a busy coach) through the same conflict check as a save; the
// apply re-plans through `replanSeries`, which refuses a collision (409), so a rollover never overbooks. Writes run in
// the caller's transaction; the `activities.activity.*` and `activities.occurrence.generated` events after the commit.
import { randomUUID } from 'node:crypto'
import type { EntityManager } from '@mikro-orm/postgresql'
import { z } from 'zod'
import { Recurrence, normalizeLocalTime } from '@vereino/core'
import type {
  SeasonChange,
  SeasonConflict,
  SeasonContributor,
  SeasonPreviewItem,
  SeasonRolloverContext,
  SeasonRolloverPlan,
} from '../../groups/services/season-rollover'
import { assertReferences, emitAfterCommit, hasSessionChanges, type SessionChanges } from '../commands/shared'
import { Activity, Occurrence } from '../data/entities'
import type { PlaceDirectoryEntry } from '../../club_core/services/directory'
import { clubClock, findPlaces, type ActivitiesScope } from './directory'
import { findConflicts, plannedSessions } from './schedule'
import { activityRule, replanSeries } from './series'

/** The token `groups` reads (`seasonContributorToken('activities')` in `groups/services/season-rollover.ts`). */
export const ACTIVITIES_SEASON_CONTRIBUTOR = 'groups.season.activities'

const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/)

/** The values an activity copy may change. */
const copySchema = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    startTime: timeSchema.optional(),
    endTime: timeSchema.optional(),
    placeId: z.uuid().optional(),
  })
  .strict()

type CopyValues = z.output<typeof copySchema>

function scopeOf(plan: SeasonRolloverPlan): ActivitiesScope {
  return { tenantId: plan.tenantId, organizationId: plan.organizationId }
}

/** The recurring activities of the plan's groups still running after the last day (oldest first). */
async function candidateRows(
  em: EntityManager,
  plan: SeasonRolloverPlan,
  rules: SeasonRolloverContext['rules'],
): Promise<Activity[]> {
  const groupIds = plan.groups.map((group) => group.groupId)
  if (groupIds.length === 0) return []
  const rows = await em.find(
    Activity,
    {
      ...scopeOf(plan),
      groupId: { $in: groupIds },
      recurrenceRule: { $ne: null },
      isActive: true,
      deletedAt: null,
      startsOn: { $lte: plan.lastDay },
    },
    { orderBy: { name: 'asc', id: 'asc' } },
  )
  return rows.filter((row) => rules.runsPast({ validTo: row.endsOn ?? null }, plan.lastDay))
}

/** The copy values of a record, checked (422 `rollover_copy_invalid` naming the field). */
async function copyValues(
  plan: SeasonRolloverPlan,
  recordId: string,
  rules: SeasonRolloverContext['rules'],
): Promise<CopyValues> {
  const parsed = copySchema.safeParse(plan.records[recordId]?.copy ?? {})
  if (parsed.success) return parsed.data
  const key = parsed.error.issues[0]?.path[0]
  return rules.copyInvalid(`records.${recordId}.copy${typeof key === 'string' ? `.${key}` : ''}`)
}

/** The copy of `row` the plan creates (not persisted). */
async function copyShape(
  row: Activity,
  plan: SeasonRolloverPlan,
  values: CopyValues,
  rules: SeasonRolloverContext['rules'],
) {
  const rule = await activityRule(row)
  // The exceptions and the end of the old rule belong to the old season.
  const recurrenceRule = rule ? Recurrence.toText({ ...rule, exdates: [], until: null, count: null }) : null
  const startTime = normalizeLocalTime(values.startTime ?? row.defaultStartTime)
  const endTime = normalizeLocalTime(values.endTime ?? row.defaultEndTime)
  if (endTime <= startTime) return rules.copyInvalid(`records.${row.id}.copy.endTime`)
  return {
    name: values.name ?? row.name,
    placeId: values.placeId ?? row.defaultPlaceId,
    recurrenceRule,
    startsOn: plan.toSeason.startsOn,
    endsOn: rules.copyEndsOn(row.endsOn ?? null, plan.toSeason.endsOn),
    startTime,
    endTime,
  }
}

/** The planned sessions of a copy that collide with the schedule (the original's later sessions do not count). */
async function copyConflicts(
  em: EntityManager,
  plan: SeasonRolloverPlan,
  container: SeasonRolloverContext['container'],
  row: Activity,
  shape: Awaited<ReturnType<typeof copyShape>>,
): Promise<unknown[]> {
  const scope = scopeOf(plan)
  const clock = await clubClock(container, scope)
  const rule = shape.recurrenceRule
    ? await activityRule({ recurrenceRule: shape.recurrenceRule, startsOn: shape.startsOn })
    : null
  const { sessions } = plannedSessions(
    {
      rule,
      startsOn: shape.startsOn,
      endsOn: shape.endsOn,
      startTime: shape.startTime,
      endTime: shape.endTime,
      isActive: true,
    },
    clock.today,
    clock.timeZone,
  )
  if (sessions.length === 0) return []
  const ending = await em.find(
    Occurrence,
    { ...scope, activityId: row.id, occurrenceDate: { $gt: plan.lastDay }, deletedAt: null },
    { fields: ['id'] },
  )
  const report = await findConflicts(
    container,
    em,
    scope,
    {
      candidates: sessions.map((session) => ({ key: session.date, startAt: session.startAt, endAt: session.endAt })),
      placeId: shape.placeId,
      coachPersonId: row.defaultCoachPersonId ?? null,
      ignoreIds: ending.map((session) => session.id),
    },
    'preview',
  )
  return report.conflicts
}

export const seasonContribution: SeasonContributor = {
  async preview(em, plan, ctx) {
    const scope = scopeOf(plan)
    const rows = await candidateRows(em, plan, ctx.rules)
    const placeIds = [...new Set(rows.flatMap((row) => (row.defaultPlaceId ? [row.defaultPlaceId] : [])))]
    const places =
      placeIds.length > 0
        ? await findPlaces(ctx.container, scope, placeIds, em)
        : new Map<string, PlaceDirectoryEntry>()
    const items: SeasonPreviewItem[] = []
    const conflicts: SeasonConflict[] = []
    for (const row of rows) {
      const action = ctx.rules.recordAction(plan, row.groupId, row.id)
      if (action === null || action === 'keep') continue
      items.push({
        module: 'activities',
        kind: 'activity',
        recordId: row.id,
        groupId: row.groupId,
        action: 'end',
        label: { name: row.name, until: plan.lastDay },
      })
      if (action !== 'end_and_copy') continue
      const values = await copyValues(plan, row.id, ctx.rules)
      if (values.placeId && values.placeId !== row.defaultPlaceId) {
        await assertReferences(ctx.command, em, scope, { placeId: values.placeId })
      }
      const shape = await copyShape(row, plan, values, ctx.rules)
      const label = {
        name: shape.name,
        startsOn: shape.startsOn,
        endsOn: shape.endsOn,
        startTime: shape.startTime,
        endTime: shape.endTime,
        placeId: shape.placeId,
      }
      items.push({
        module: 'activities',
        kind: 'activity',
        recordId: null,
        groupId: row.groupId,
        action: 'create',
        label,
      })
      const found = await copyConflicts(em, plan, ctx.container, row, shape)
      if (found.length > 0) {
        conflicts.push({
          module: 'activities',
          kind: 'activity',
          recordId: row.id,
          groupId: row.groupId,
          label,
          conflicts: found,
        })
      }
    }
    return {
      candidates: rows.map((row) => ({
        module: 'activities' as const,
        kind: 'activity',
        recordId: row.id,
        groupId: row.groupId,
        version: row.updatedAt.toISOString(),
        label: {
          name: row.name,
          type: row.type,
          rule: row.recurrenceRule ?? null,
          startsOn: row.startsOn,
          endsOn: row.endsOn ?? null,
          startTime: normalizeLocalTime(row.defaultStartTime),
          endTime: normalizeLocalTime(row.defaultEndTime),
          placeId: row.defaultPlaceId,
          placeName: row.defaultPlaceId ? (places.get(row.defaultPlaceId)?.name ?? null) : null,
        },
      })),
      items,
      conflicts,
      notices: [],
    }
  },

  async apply(em, plan, ctx) {
    const scope = scopeOf(plan)
    const clock = await clubClock(ctx.container, scope)
    const rows = await candidateRows(em, plan, ctx.rules)
    const changes: SeasonChange[] = []
    const copies: Record<string, string> = {}
    for (const row of rows) {
      const action = ctx.rules.recordAction(plan, row.groupId, row.id)
      if (action === null || action === 'keep') continue
      // The copy is shaped before the original's end changes its rule's context.
      const shape =
        action === 'end_and_copy'
          ? await copyShape(row, plan, await copyValues(plan, row.id, ctx.rules), ctx.rules)
          : null
      row.endsOn = plan.lastDay
      row.updatedAt = new Date()
      const ended = await replanSeries(ctx.command, em, row, clock)
      changes.push({ kind: 'activity', recordId: row.id, action: 'updated', related: ended })
      if (!shape) continue
      const id = randomUUID()
      const copy = em.create(Activity, {
        id,
        ...scope,
        sectionId: row.sectionId,
        groupId: row.groupId,
        name: shape.name,
        type: row.type,
        defaultPlaceId: shape.placeId,
        venueName: null,
        venueAddress: null,
        defaultCoachPersonId: row.defaultCoachPersonId ?? null,
        opponentExternalTeamId: row.opponentExternalTeamId ?? null,
        invitedExternalTeamIds: [...row.invitedExternalTeamIds],
        recurrenceRule: shape.recurrenceRule,
        startsOn: shape.startsOn,
        endsOn: shape.endsOn,
        defaultStartTime: shape.startTime,
        defaultEndTime: shape.endTime,
        gatheringMinutesBefore: row.gatheringMinutesBefore ?? null,
        confirmByMinutesBefore: row.confirmByMinutesBefore ?? null,
        description: row.description ?? null,
        isActive: true,
        isAway: row.isAway,
      })
      em.persist(copy)
      const created = await replanSeries(ctx.command, em, copy, clock)
      changes.push({ kind: 'activity', recordId: id, action: 'created', related: created })
      copies[row.id] = id
    }
    await em.flush()
    return { changes, copies }
  },

  async afterCommit(changes, ctx) {
    const scope = { tenantId: ctx.tenantId, organizationId: ctx.organizationId }
    for (const change of changes) {
      if (change.kind !== 'activity') continue
      await emitAfterCommit(`activities.activity.${change.action}`, scope, { id: change.recordId })
      const sessions: SessionChanges = {
        createdIds: change.related?.createdIds ?? [],
        updatedIds: change.related?.updatedIds ?? [],
        removedIds: change.related?.removedIds ?? [],
      }
      if (hasSessionChanges(sessions)) {
        await emitAfterCommit('activities.occurrence.generated', scope, { id: change.recordId, ...sessions })
      }
    }
  },

  async firstSessions(em, scope, groupIds, from) {
    if (groupIds.length === 0) return {}
    const rows = await em.find(
      Occurrence,
      {
        ...scope,
        groupId: { $in: [...groupIds] },
        status: 'planned',
        occurrenceDate: { $gte: from },
        deletedAt: null,
      },
      { orderBy: { startAt: 'asc' }, fields: ['id', 'groupId', 'startAt'] },
    )
    const first: Record<string, string> = {}
    for (const row of rows) if (!(row.groupId in first)) first[row.groupId] = row.startAt.toISOString()
    return first
  },
}
