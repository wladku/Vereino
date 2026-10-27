// Raw SQL of the foundation (S5.8: raw SQL lives in a module's data/queries.ts).
import type { EntityManager } from '@mikro-orm/postgresql'

/**
 * Serializes role syncs of one user (foundation DD-F05): a transaction-scoped advisory lock keyed by the user id,
 * held until the caller's transaction commits or rolls back. Reads no tenant data, so it takes no organization.
 */
export async function lockUserRoleSync(em: EntityManager, userId: string): Promise<void> {
  await em.execute('select pg_advisory_xact_lock(hashtextextended(?, 0))', [`foundation.role_sync:${userId}`])
}
