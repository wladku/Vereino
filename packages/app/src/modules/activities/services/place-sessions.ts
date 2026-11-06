// `activities.placeSessions` (facilities spec DD-20, DD-43; #121): the planned sessions on a set of places in a window
// and the reschedule flag a closure sets on them, for `facilities`, which requires `activities` and reaches it only
// through this DI service. The caller passes the place family (the place, its ancestors and descendants) and has
// authorized its own record; nothing here checks a grant.
import type { EntityManager } from '@mikro-orm/postgresql'
import { Occurrence } from '../data/entities'
import { flagSessionsForReschedule } from '../data/queries'
import { emitActivitiesEvent } from '../events'
import type { ActivitiesScope } from './directory'

export const ACTIVITIES_PLACE_SESSIONS = 'activities.placeSessions' as const

export type PlaceSessionEntry = {
  id: string
  placeId: string
  startAt: Date
  endAt: Date
  needsReschedule: boolean
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
    { fields: ['id', 'placeId', 'startAt', 'endAt', 'needsReschedule'], orderBy: { startAt: 'asc' }, limit: 2000 },
  )
  return rows.map((row) => ({
    id: row.id,
    placeId: row.placeId,
    startAt: row.startAt,
    endAt: row.endAt,
    needsReschedule: row.needsReschedule,
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

export function createPlaceSessions(getEm: () => EntityManager): ActivitiesPlaceSessions {
  return {
    plannedSessions: (scope, placeIds, window, em) => plannedSessions(em ?? getEm().fork(), scope, placeIds, window),
    flagForReschedule: (scope, placeIds, window) => flagForReschedule(getEm().fork(), scope, placeIds, window),
  }
}
