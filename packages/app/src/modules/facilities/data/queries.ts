// Raw SQL of `facilities` (engineering standards S5.8: raw SQL lives in a module's data/queries.ts and takes the
// organization explicitly).
import type { EntityManager } from '@mikro-orm/postgresql'

/**
 * Serializes the zone-rule writes of one organization (a rule save, a bulk availability) until the caller's transaction
 * ends, so two writes cannot each pass the equal-priority overlap check and store overlapping rules together.
 */
export async function lockZoneRules(em: EntityManager, organizationId: string): Promise<void> {
  await em.execute(`select pg_advisory_xact_lock(hashtext('facilities.zones:' || ?))`, [organizationId])
}

/** Serializes the rental-rate writes of one organization, so two writes cannot each pass the overlap check together. */
export async function lockRentalRates(em: EntityManager, organizationId: string): Promise<void> {
  await em.execute(`select pg_advisory_xact_lock(hashtext('facilities.rates:' || ?))`, [organizationId])
}

/**
 * Sets `needs_reschedule` on the rentals that still hold their slot (`requested`, `confirmed`) on the given places
 * and overlap `start`–`end` and are not flagged yet (facilities spec `facilities.closure.created`; #122): one
 * conditional update, so a repeated call flags nothing twice. Returns the ids it flagged.
 */
export async function flagRentalsForReschedule(
  em: EntityManager,
  scope: { tenantId: string; organizationId: string },
  placeIds: readonly string[],
  window: { start: Date; end: Date },
): Promise<string[]> {
  if (placeIds.length === 0) return []
  const placeholders = placeIds.map(() => '?').join(', ')
  const rows = await em.execute<{ id: string }[]>(
    `update facilities_rentals
     set needs_reschedule = true, updated_at = now()
     where tenant_id = ? and organization_id = ? and deleted_at is null and status in ('requested', 'confirmed')
       and needs_reschedule = false and place_id in (${placeholders}) and starts_at < ? and ends_at > ?
     returning id`,
    [scope.tenantId, scope.organizationId, ...placeIds, window.end, window.start],
  )
  return rows.map((row) => row.id)
}
