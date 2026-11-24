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

/**
 * The one system-scope operation of the sessionless public pages (club spec DD-35, AGENTS.md exception D-024/D-026,
 * engineering standards S8.6): a read-only lookup of the globally unique `public_slug`, backed by the partial unique
 * index `club_core_club_settings_public_slug_unique`. It returns only the club's settings row id and its tenant and
 * organization; every further query of the public pages is narrowed to them. Called only by `clubCorePublicSite`.
 */
export async function lookupClubByPublicSlug(
  em: EntityManager,
  slug: string,
): Promise<{ settingsId: string; tenantId: string; organizationId: string } | null> {
  const rows = await em.execute<{ id: string; tenant_id: string; organization_id: string }[]>(
    `select id, tenant_id, organization_id from club_core_club_settings
     where public_slug = ? and deleted_at is null
     limit 1`,
    [slug],
  )
  const row = rows.at(0)
  return row ? { settingsId: row.id, tenantId: row.tenant_id, organizationId: row.organization_id } : null
}

/** A club as the offboarding commands see it: its scope, its notice dates and, once deleted, its tombstone's date. */
export type OffboardingClub = {
  settingsId: string
  slug: string
  tenantId: string
  organizationId: string
  noticeAt: Date | null
  deleteAfter: Date | null
  /** Set once `delete-club` deleted the club: the row is then the slug's tombstone (BR-M4). */
  deletedAt: Date | null
}

/**
 * The operator's lookup of a club by its public slug for `offboard-club`, `export-club`, `delete-club` and
 * `restore-club` (many clubs spec phase 4; #632): the same key and index as `lookupClubByPublicSlug` (D-024), read-only,
 * and also finding a deleted club's tombstone, which keeps the slug reserved. Returns ids, the slug and dates only;
 * every further query is narrowed to the club's tenant. Never called from a request.
 */
export async function lookupClubForOffboarding(em: EntityManager, slug: string): Promise<OffboardingClub | null> {
  const rows = await em.execute<
    {
      id: string
      public_slug: string
      tenant_id: string
      organization_id: string
      offboarding_notice_at: Date | null
      offboarding_delete_after: Date | null
      deleted_at: Date | null
    }[]
  >(
    `select id, public_slug, tenant_id, organization_id, offboarding_notice_at, offboarding_delete_after, deleted_at
     from club_core_club_settings where public_slug = ? limit 1`,
    [slug],
  )
  const row = rows.at(0)
  if (!row) return null
  return {
    settingsId: row.id,
    slug: row.public_slug,
    tenantId: row.tenant_id,
    organizationId: row.organization_id,
    noticeAt: row.offboarding_notice_at ? new Date(row.offboarding_notice_at) : null,
    deleteAfter: row.offboarding_delete_after ? new Date(row.offboarding_delete_after) : null,
    deletedAt: row.deleted_at ? new Date(row.deleted_at) : null,
  }
}

/**
 * Serializes the contract writes of one party until the caller's transaction ends (#96), so two concurrent saves
 * cannot each pass the overlap check and leave two active contracts of one kind for the same period.
 */
export async function lockContractParty(em: EntityManager, organizationId: string, partyId: string): Promise<void> {
  await em.execute(`select pg_advisory_xact_lock(hashtext('club_core.contracts:' || ? || ':' || ?))`, [
    organizationId,
    partyId,
  ])
}
