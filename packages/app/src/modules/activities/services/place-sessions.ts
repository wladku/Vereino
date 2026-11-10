// `activities.placeSessions` (facilities spec DD-20, DD-43; #121): the planned sessions on a set of places in a window
// and the reschedule flag a closure sets on them, for `facilities`, which requires `activities` and reaches it only
// through this DI service. The caller passes the place family (the place, its ancestors and descendants) and has
// authorized its own record; nothing here checks a grant. The rented-hours report (#129) also reads the done sessions
// with their group's name, which `activities` resolves through `groups.directory` (`facilities` does not require
// `groups`).
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { Activity, Occurrence } from '../data/entities'
import { flagSessionsForReschedule } from '../data/queries'
import { emitActivitiesEvent } from '../events'
import { findGroups, type ActivitiesScope } from './directory'

export const ACTIVITIES_PLACE_SESSIONS = 'activities.placeSessions' as const

export type PlaceSessionEntry = {
  id: string
  placeId: string
  startAt: Date
  endAt: Date
  needsReschedule: boolean
  /** The session's activity and group, and the activity's name — the label staff see on the facility calendar (#123). */
  activityId: string
  groupId: string
  activityName: string | null
}

/** A done session as the rented-hours report counts it (facilities REQ-038, #129): place, times, group and coach. */
export type DoneSessionReportEntry = {
  placeId: string
  start: Date
  end: Date
  groupId: string
  /** The group's name, or null when the group is gone. */
  groupName: string | null
  coachPersonId: string | null
}

export type ActivitiesPlaceSessions = {
  /** The live `planned` sessions on the places that overlap the window, by start (at most 2000). */
  plannedSessions(
    scope: ActivitiesScope,
    placeIds: readonly string[],
    window: { start: Date; end: Date },
    em?: EntityManager,
  ): Promise<PlaceSessionEntry[]>
  /**
   * The start and end of the live `done` sessions on the places that overlap the window (the hours of use a
   * maintenance task counts, facilities #128); times only, no names.
   */
  doneSessionTimes(
    scope: ActivitiesScope,
    placeIds: readonly string[],
    window: { start: Date; end: Date },
    em?: EntityManager,
  ): Promise<Array<{ start: Date; end: Date }>>
  /**
   * The place, start and end of the live `planned` and `done` sessions on the places that overlap the window, without
   * a limit (the club time of the owner report, facilities #127); times only, no names.
   */
  clubSessionTimes(
    scope: ActivitiesScope,
    placeIds: readonly string[],
    window: { start: Date; end: Date },
    em?: EntityManager,
  ): Promise<Array<{ placeId: string; start: Date; end: Date }>>
  /**
   * The live `done` sessions on the places that start in the window, by start, without a limit, with their group's
   * name and their coach's person id (the rented-hours report, facilities #129).
   */
  doneSessionsForReport(
    scope: ActivitiesScope,
    placeIds: readonly string[],
    window: { start: Date; end: Date },
    em?: EntityManager,
  ): Promise<DoneSessionReportEntry[]>
  /** The live `planned` sessions among `ids` (a group event or a generated series that may take a requested slot, #123). */
  sessionsByIds(scope: ActivitiesScope, ids: readonly string[], em?: EntityManager): Promise<PlaceSessionEntry[]>
  /**
   * Flags the `planned` sessions on the places that overlap the window `needs_reschedule`, in a transaction of its
   * own, and emits `activities.occurrence.updated` for each; returns the ids flagged now (already flagged ones are not
   * counted again).
   */
  flagForReschedule(
    scope: ActivitiesScope,
    placeIds: readonly string[],
    window: { start: Date; end: Date },
  ): Promise<string[]>
}

const SESSION_FIELDS = ['id', 'placeId', 'startAt', 'endAt', 'needsReschedule', 'activityId', 'groupId'] as const

export async function plannedSessions(
  em: EntityManager,
  scope: ActivitiesScope,
  placeIds: readonly string[],
  window: { start: Date; end: Date },
): Promise<PlaceSessionEntry[]> {
  if (placeIds.length === 0) return []
  const rows = await em.find(
    Occurrence,
    {
      ...scope,
      deletedAt: null,
      status: 'planned',
      placeId: { $in: [...new Set(placeIds)] },
      startAt: { $lt: window.end },
      endAt: { $gt: window.start },
    },
    { fields: [...SESSION_FIELDS], orderBy: { startAt: 'asc' }, limit: 2000 },
  )
  return withActivityNames(em, scope, rows)
}

export async function doneSessionTimes(
  em: EntityManager,
  scope: ActivitiesScope,
  placeIds: readonly string[],
  window: { start: Date; end: Date },
): Promise<Array<{ start: Date; end: Date }>> {
  if (placeIds.length === 0) return []
  const rows = await em.find(
    Occurrence,
    {
      ...scope,
      deletedAt: null,
      status: 'done',
      placeId: { $in: [...new Set(placeIds)] },
      startAt: { $lt: window.end },
      endAt: { $gt: window.start },
    },
    { fields: ['id', 'startAt', 'endAt'], orderBy: { startAt: 'asc' } },
  )
  return rows.map((row) => ({ start: row.startAt, end: row.endAt }))
}

export async function clubSessionTimes(
  em: EntityManager,
  scope: ActivitiesScope,
  placeIds: readonly string[],
  window: { start: Date; end: Date },
): Promise<Array<{ placeId: string; start: Date; end: Date }>> {
  if (placeIds.length === 0) return []
  const rows = await em.find(
    Occurrence,
    {
      ...scope,
      deletedAt: null,
      status: { $in: ['planned', 'done'] },
      placeId: { $in: [...new Set(placeIds)] },
      startAt: { $lt: window.end },
      endAt: { $gt: window.start },
    },
    { fields: ['id', 'placeId', 'startAt', 'endAt'], orderBy: { startAt: 'asc' } },
  )
  return rows.map((row) => ({ placeId: row.placeId, start: row.startAt, end: row.endAt }))
}

export async function doneSessionsForReport(
  container: AwilixContainer,
  em: EntityManager,
  scope: ActivitiesScope,
  placeIds: readonly string[],
  window: { start: Date; end: Date },
): Promise<DoneSessionReportEntry[]> {
  if (placeIds.length === 0) return []
  const rows = await em.find(
    Occurrence,
    {
      ...scope,
      deletedAt: null,
      status: 'done',
      placeId: { $in: [...new Set(placeIds)] },
      startAt: { $gte: window.start, $lt: window.end },
    },
    {
      fields: ['id', 'placeId', 'startAt', 'endAt', 'groupId', 'coachPersonId'],
      orderBy: { startAt: 'asc', id: 'asc' },
    },
  )
  const groups = await findGroups(container, scope, [...new Set(rows.map((row) => row.groupId))], em)
  return rows.map((row) => ({
    placeId: row.placeId,
    start: row.startAt,
    end: row.endAt,
    groupId: row.groupId,
    groupName: groups.get(row.groupId)?.name ?? null,
    coachPersonId: row.coachPersonId ?? null,
  }))
}

export async function sessionsByIds(
  em: EntityManager,
  scope: ActivitiesScope,
  ids: readonly string[],
): Promise<PlaceSessionEntry[]> {
  if (ids.length === 0) return []
  const rows = await em.find(
    Occurrence,
    { ...scope, deletedAt: null, status: 'planned', id: { $in: [...new Set(ids)] } },
    { fields: [...SESSION_FIELDS], orderBy: { startAt: 'asc' } },
  )
  return withActivityNames(em, scope, rows)
}

async function withActivityNames(
  em: EntityManager,
  scope: ActivitiesScope,
  rows: ReadonlyArray<Pick<Occurrence, (typeof SESSION_FIELDS)[number]>>,
): Promise<PlaceSessionEntry[]> {
  const activityIds = [...new Set(rows.map((row) => row.activityId))]
  const activities =
    activityIds.length > 0
      ? await em.find(Activity, { ...scope, id: { $in: activityIds } }, { fields: ['id', 'name'] })
      : []
  const names = new Map(activities.map((row) => [row.id, row.name]))
  return rows.map((row) => ({
    id: row.id,
    placeId: row.placeId,
    startAt: row.startAt,
    endAt: row.endAt,
    needsReschedule: row.needsReschedule,
    activityId: row.activityId,
    groupId: row.groupId,
    activityName: names.get(row.activityId) ?? null,
  }))
}

export async function flagForReschedule(
  em: EntityManager,
  scope: ActivitiesScope,
  placeIds: readonly string[],
  window: { start: Date; end: Date },
): Promise<string[]> {
  const ids = await em.transactional((tx) => flagSessionsForReschedule(tx, scope, placeIds, window))
  for (const id of ids) {
    await emitActivitiesEvent('activities.occurrence.updated', { id, ...scope }, { persistent: true, ...scope })
  }
  return ids
}

export function createPlaceSessions(getEm: () => EntityManager, container: AwilixContainer): ActivitiesPlaceSessions {
  return {
    plannedSessions: (scope, placeIds, window, em) => plannedSessions(em ?? getEm().fork(), scope, placeIds, window),
    doneSessionTimes: (scope, placeIds, window, em) => doneSessionTimes(em ?? getEm().fork(), scope, placeIds, window),
    clubSessionTimes: (scope, placeIds, window, em) => clubSessionTimes(em ?? getEm().fork(), scope, placeIds, window),
    doneSessionsForReport: (scope, placeIds, window, em) =>
      doneSessionsForReport(container, em ?? getEm().fork(), scope, placeIds, window),
    sessionsByIds: (scope, ids, em) => sessionsByIds(em ?? getEm().fork(), scope, ids),
    flagForReschedule: (scope, placeIds, window) => flagForReschedule(getEm().fork(), scope, placeIds, window),
  }
}
