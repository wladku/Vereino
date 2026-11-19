// Raw SQL of `activities` (engineering standards S5.8: raw SQL lives in a module's data/queries.ts and takes the
// organization explicitly).
import type { EntityManager } from '@mikro-orm/postgresql'
import { lockOccupancy } from '@/modules/foundation'

/**
 * Serializes every session write of one organization (a new series, a series edit, a moved session, a one-off event,
 * the generator) until the caller's transaction ends, so two writes cannot each pass the conflict check and overbook a
 * place or a coach together (`.ai/review-checklist.md`: an availability decision that races takes a lock). It is the
 * organization's one occupancy lock (facilities spec DD-43), so a session write and a facility rental or closure
 * serialize too.
 */
export async function lockSchedule(em: EntityManager, organizationId: string): Promise<void> {
  await lockOccupancy(em, organizationId)
}

/**
 * Sets `needs_reschedule` on the `planned` sessions of the given places that overlap `start`–`end` and are not flagged
 * yet (facilities spec, `facilities.closure.created`; DD-20, DD-43): one conditional update, so a repeated call flags
 * nothing twice and needs no schedule lock. Returns the ids it flagged.
 */
export async function flagSessionsForReschedule(
  em: EntityManager,
  scope: { tenantId: string; organizationId: string },
  placeIds: readonly string[],
  window: { start: Date; end: Date },
): Promise<string[]> {
  if (placeIds.length === 0) return []
  const placeholders = placeIds.map(() => '?').join(', ')
  const rows = await em.execute<{ id: string }[]>(
    `update activities_occurrences
     set needs_reschedule = true, updated_at = now()
     where tenant_id = ? and organization_id = ? and deleted_at is null and status = 'planned'
       and needs_reschedule = false and place_id in (${placeholders}) and start_at < ? and end_at > ?
     returning id`,
    [scope.tenantId, scope.organizationId, ...placeIds, window.end, window.start],
  )
  return rows.map((row) => row.id)
}

/**
 * The planned club events of the organization whose every live part has ended before `now` (club events spec B-T1
 * views "Upcoming" / "Past"): a part with a group ends with its live session, an open part with its own `ends_at`. An
 * event without a live part is never past.
 */
export async function pastClubEventIds(
  em: EntityManager,
  scope: { tenantId: string; organizationId: string },
  now: Date,
): Promise<string[]> {
  const rows = await em.execute<{ id: string }[]>(
    `select e.id
     from activities_club_events e
     where e.tenant_id = ? and e.organization_id = ? and e.deleted_at is null and e.status = 'planned'
       and exists (
         select 1 from activities_club_event_parts p
         where p.club_event_id = e.id and p.organization_id = e.organization_id and p.deleted_at is null
       )
       and not exists (
         select 1
         from activities_club_event_parts p
         left join activities_occurrences o
           on o.activity_id = p.activity_id and o.organization_id = p.organization_id and o.deleted_at is null
         where p.club_event_id = e.id and p.organization_id = e.organization_id and p.deleted_at is null
           and coalesce(o.end_at, p.ends_at) >= ?
       )`,
    [scope.tenantId, scope.organizationId, now],
  )
  return rows.map((row) => row.id)
}
