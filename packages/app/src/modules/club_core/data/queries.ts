// Raw SQL of `club_core` (engineering standards S5.8: raw SQL lives in a module's data/queries.ts and takes the
// organization explicitly).
import type { EntityManager } from '@mikro-orm/postgresql'

/**
 * Creates the organization's settings row with the column defaults when it does not exist yet; a no-op otherwise
 * (`on conflict` on the unique `organization_id`). Runs inside the caller's write transaction, so a refused update
 * rolls the insert back.
 */
export async function ensureClubSettingsRow(
  em: EntityManager,
  scope: { tenantId: string; organizationId: string },
): Promise<void> {
  await em.execute(
    `insert into club_core_club_settings (id, tenant_id, organization_id, created_at, updated_at)
     values (gen_random_uuid(), ?, ?, now(), now())
     on conflict (organization_id) do nothing`,
    [scope.tenantId, scope.organizationId],
  )
}
