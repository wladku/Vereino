// Who manages a club event, and which sessions are parts of one (club events spec DD-T06, glossary *Who manages a club
// event*, *Part session changes by others*): the club administrator manages every event, a coordinator the events of
// their sections; a whole-club event (no section) only the administrator. The session commands and the reads that
// offer "Edit" and "Cancel" share these, so a read never promises what the command refuses.
import type { EntityManager } from '@mikro-orm/postgresql'
import { findActingRole, type ActingRole, type GrantKind, type Scope, type ScopeTarget } from '@vereino/core'
import { Activity, ClubEvent } from '../data/entities'
import type { ActivitiesScope } from './directory'

/** The grant kinds that manage a club event: a coordinator of its section, the club administrator. */
export const CLUB_EVENT_MANAGE_KINDS: readonly GrantKind[] = ['coordinator', 'club_admin']

/** The club event of a part session as its guard needs it. */
export type PartEvent = {
  id: string
  tenantId: string
  organizationId: string
  sectionId: string | null
  placeId: string
  status: string
}

/** A club event as a scope target: its section matches a coordinator's grant; without one, only a club-wide grant. */
export function clubEventTarget(
  event: Pick<ClubEvent, 'id' | 'tenantId' | 'organizationId'> & { sectionId?: string | null },
): ScopeTarget {
  return {
    id: event.id,
    tenantId: event.tenantId,
    organizationId: event.organizationId,
    sectionId: event.sectionId ?? null,
    groupId: null,
  }
}

/** The role the caller manages the club event in, or null (DD-T06). */
export function clubEventManagerRole(grants: Scope, event: PartEvent): ActingRole | null {
  return findActingRole(grants, CLUB_EVENT_MANAGE_KINDS, clubEventTarget(event))
}

/** The club event of each activity among `activityIds` that is a part of one, by activity id. */
export async function partEventsOf(
  em: EntityManager,
  scope: ActivitiesScope,
  activityIds: readonly string[],
): Promise<Map<string, PartEvent>> {
  const ids = [...new Set(activityIds)]
  if (ids.length === 0) return new Map()
  const activities = await em.find(
    Activity,
    { ...scope, id: { $in: ids }, clubEventId: { $ne: null } },
    { fields: ['id', 'clubEventId'] },
  )
  if (activities.length === 0) return new Map()
  const events = await em.find(
    ClubEvent,
    { ...scope, id: { $in: [...new Set(activities.map((row) => row.clubEventId as string))] } },
    { fields: ['id', 'tenantId', 'organizationId', 'sectionId', 'placeId', 'status'] },
  )
  const byId = new Map(
    events.map((event) => [
      event.id,
      {
        id: event.id,
        tenantId: event.tenantId,
        organizationId: event.organizationId,
        sectionId: event.sectionId ?? null,
        placeId: event.placeId,
        status: event.status,
      },
    ]),
  )
  const result = new Map<string, PartEvent>()
  for (const activity of activities) {
    const event = byId.get(activity.clubEventId as string)
    if (event) result.set(activity.id, event)
  }
  return result
}

/** The club event of one activity, or null when it is no part. */
export async function partEventOf(
  em: EntityManager,
  scope: ActivitiesScope,
  activityId: string,
): Promise<PartEvent | null> {
  return (await partEventsOf(em, scope, [activityId])).get(activityId) ?? null
}
