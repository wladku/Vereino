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
