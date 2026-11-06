// Raw SQL of `activities` (engineering standards S5.8: raw SQL lives in a module's data/queries.ts and takes the
// organization explicitly).
import type { EntityManager } from '@mikro-orm/postgresql'

/**
 * Serializes every session write of one organization (a new series, a series edit, a moved session, a one-off event,
 * the generator) until the caller's transaction ends, so two writes cannot each pass the conflict check and overbook a
 * place or a coach together (`.ai/review-checklist.md`: an availability decision that races takes a lock).
 */
export async function lockSchedule(em: EntityManager, organizationId: string): Promise<void> {
  await em.execute(`select pg_advisory_xact_lock(hashtext('activities.schedule:' || ?))`, [organizationId])
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
