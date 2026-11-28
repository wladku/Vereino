// `activities.occurrenceFacts` (training outlines spec DD-O07a; E24-S03, #683): the facts of sessions and activities
// another module needs without reading `activities` tables — `training` checks the scope of an attach (the group and
// the section), the 72-hour lock after a session's end (BR-O3), copies a series outline into the activity's future
// sessions (DD-O07) and prints the header of an outline (M-O7); `enrolment` lists a group's next sessions for the
// trial-session picker and reads the session of a trial participant (sign-up form spec DD-J12, #801). Read only, for ids in the caller's tenant and
// organization: an id of another club, a removed session or an unknown id is simply missing from the answer. The
// consumer resolves the token with `hasRegistration`, so `activities` stays optional for it.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { Activity, Occurrence } from '../data/entities'
import type { ActivityType, OccurrenceStatus } from '../lib/activities-rules'
import { findPlaces, type ActivitiesScope } from './directory'

/** The DI token `training` resolves (`training/services/session-facts.ts`). */
export const ACTIVITIES_OCCURRENCE_FACTS = 'activities.occurrenceFacts'

export type OccurrenceFact = {
  id: string
  activityId: string
  activityName: string | null
  groupId: string
  sectionId: string
  type: ActivityType
  status: OccurrenceStatus
  /** The session's day in the club's calendar (`YYYY-MM-DD`). */
  occurrenceDate: string
  startAt: string
  endAt: string
  coachPersonId: string | null
  /** The club place's name, else the typed venue, else null. */
  placeLabel: string | null
}

export type ActivityFact = {
  id: string
  name: string
  groupId: string
  sectionId: string
  type: ActivityType
  /** Whether the activity is a weekly series (an outline attached to it is a series outline, DD-O07). */
  recurring: boolean
}

export type OccurrenceFactsContract = {
  /** The sessions among `ids` in the organization, by id; removed sessions are left out. */
  occurrences(scope: ActivitiesScope, ids: readonly string[], em?: EntityManager): Promise<Map<string, OccurrenceFact>>
  /** The live activities among `ids` in the organization, by id. */
  activities(scope: ActivitiesScope, ids: readonly string[], em?: EntityManager): Promise<Map<string, ActivityFact>>
  /** The planned live sessions of an activity that start at or after `from`, by start. */
  upcomingSessions(
    scope: ActivitiesScope,
    activityId: string,
    from: Date,
    em?: EntityManager,
  ): Promise<OccurrenceFact[]>
  /**
   * The next `limit` planned live sessions of a group that start at or after `from`, by start (sign-up form spec
   * DD-J12: the trial-session picker of `enrolment`; Ask First approved on #788, 2026-11-26). `limit` is 1–50.
   */
  upcomingSessionsOfGroup(
    scope: ActivitiesScope,
    groupId: string,
    from: Date,
    limit: number,
    em?: EntityManager,
  ): Promise<OccurrenceFact[]>
}

/** The most sessions `upcomingSessionsOfGroup` returns. */
export const UPCOMING_SESSIONS_MAX = 50

async function toFacts(
  container: AwilixContainer,
  scope: ActivitiesScope,
  em: EntityManager,
  rows: readonly Occurrence[],
): Promise<OccurrenceFact[]> {
  if (rows.length === 0) return []
  const activityIds = [...new Set(rows.map((row) => row.activityId))]
  const placeIds = [...new Set(rows.flatMap((row) => (row.placeId ? [row.placeId] : [])))]
  const [activities, places] = await Promise.all([
    em.find(Activity, { id: { $in: activityIds }, ...scope }, { fields: ['id', 'name', 'type'] }),
    findPlaces(container, scope, placeIds, em),
  ])
  const byId = new Map(activities.map((row) => [row.id, row]))
  return rows.map((row) => {
    const activity = byId.get(row.activityId)
    return {
      id: row.id,
      activityId: row.activityId,
      activityName: activity?.name ?? null,
      groupId: row.groupId,
      sectionId: row.sectionId,
      type: activity?.type ?? 'other',
      status: row.status,
      occurrenceDate: row.occurrenceDate,
      startAt: row.startAt.toISOString(),
      endAt: row.endAt.toISOString(),
      coachPersonId: row.coachPersonId ?? null,
      placeLabel: (row.placeId ? places.get(row.placeId)?.name : null) ?? row.venueName ?? null,
    }
  })
}

export function createOccurrenceFacts(container: AwilixContainer): OccurrenceFactsContract {
  const emOf = (em?: EntityManager) => em ?? container.resolve<EntityManager>('em').fork()
  return {
    async occurrences(scope, ids, em) {
      const unique = [...new Set(ids)]
      if (unique.length === 0) return new Map()
      const reader = emOf(em)
      const rows = await reader.find(Occurrence, { id: { $in: unique }, ...scope, deletedAt: null })
      const facts = await toFacts(container, scope, reader, rows)
      return new Map(facts.map((fact) => [fact.id, fact]))
    },
    async activities(scope, ids, em) {
      const unique = [...new Set(ids)]
      if (unique.length === 0) return new Map()
      const rows = await emOf(em).find(Activity, { id: { $in: unique }, ...scope, deletedAt: null })
      return new Map(
        rows.map((row) => [
          row.id,
          {
            id: row.id,
            name: row.name,
            groupId: row.groupId,
            sectionId: row.sectionId,
            type: row.type,
            recurring: Boolean(row.recurrenceRule),
          },
        ]),
      )
    },
    async upcomingSessions(scope, activityId, from, em) {
      const reader = emOf(em)
      const rows = await reader.find(
        Occurrence,
        { ...scope, activityId, status: 'planned', startAt: { $gte: from }, deletedAt: null },
        { orderBy: { startAt: 'asc', id: 'asc' } },
      )
      return toFacts(container, scope, reader, rows)
    },
    async upcomingSessionsOfGroup(scope, groupId, from, limit, em) {
      const reader = emOf(em)
      const rows = await reader.find(
        Occurrence,
        { ...scope, groupId, status: 'planned', startAt: { $gte: from }, deletedAt: null },
        {
          orderBy: { startAt: 'asc', id: 'asc' },
          limit: Math.min(Math.max(Math.trunc(limit), 1), UPCOMING_SESSIONS_MAX),
        },
      )
      return toFacts(container, scope, reader, rows)
    },
  }
}
