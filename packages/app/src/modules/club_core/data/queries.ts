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

/**
 * Serializes the hierarchy writes of one organization (a parent change, a delete) until the caller's transaction
 * ends, so two concurrent moves cannot each pass the cycle check and close a loop together.
 */
export async function lockPlaceHierarchy(em: EntityManager, organizationId: string): Promise<void> {
  await em.execute(`select pg_advisory_xact_lock(hashtext('club_core.places:' || ?))`, [organizationId])
}

/** `id → parent_place_id` of every live place of the organization (the cycle check reads the whole tree). */
export async function loadPlaceParents(
  em: EntityManager,
  scope: { tenantId: string; organizationId: string },
): Promise<Map<string, string | null>> {
  const rows = await em.execute<{ id: string; parent_place_id: string | null }[]>(
    `select id, parent_place_id from club_core_places
     where tenant_id = ? and organization_id = ? and deleted_at is null`,
    [scope.tenantId, scope.organizationId],
  )
  return new Map(rows.map((row) => [row.id, row.parent_place_id]))
}

/** Number of live children of a place. */
export async function countPlaceChildren(
  em: EntityManager,
  scope: { tenantId: string; organizationId: string },
  placeId: string,
): Promise<number> {
  const rows = await em.execute<{ count: string | number }[]>(
    `select count(*) as count from club_core_places
     where tenant_id = ? and organization_id = ? and parent_place_id = ? and deleted_at is null`,
    [scope.tenantId, scope.organizationId, placeId],
  )
  return Number(rows[0]?.count ?? 0)
}

/** Number of live places owned by an institution. */
export async function countPlacesOwnedBy(
  em: EntityManager,
  scope: { tenantId: string; organizationId: string },
  institutionId: string,
): Promise<number> {
  const rows = await em.execute<{ count: string | number }[]>(
    `select count(*) as count from club_core_places
     where tenant_id = ? and organization_id = ? and owner_institution_id = ? and deleted_at is null`,
    [scope.tenantId, scope.organizationId, institutionId],
  )
  return Number(rows[0]?.count ?? 0)
}
