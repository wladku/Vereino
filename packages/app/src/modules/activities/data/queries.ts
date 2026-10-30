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
