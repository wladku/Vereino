// Raw SQL of `training` (engineering standards S5.8: raw SQL lives in a module's data/queries.ts and takes the
// organization explicitly).
import type { EntityManager } from '@mikro-orm/postgresql'

/**
 * How many live outlines of the organization reference the image attachment in their parts (JSON; the id is a UUID,
 * so the pattern holds no wildcard of its own). An image is released only when this is zero.
 */
export async function outlineImageReferences(
  em: EntityManager,
  scope: { tenantId: string; organizationId: string },
  attachmentId: string,
): Promise<number> {
  const rows = await em.execute<{ count: string }[]>(
    'select count(*)::text as count from training_outlines where tenant_id = ? and organization_id = ? and deleted_at is null and parts::text like ?',
    [scope.tenantId, scope.organizationId, `%"attachmentId":"${attachmentId}"%`],
  )
  return Number(rows[0]?.count ?? 0)
}

/**
 * The live outlines of the organization with at least one exercise in `part` (`warm_up`, `main`, `cool_down`; validated
 * by the caller): the outline list's part filter (training outlines spec M-O5, #847). The caller narrows them further by
 * the record scope.
 */
export async function outlineIdsWithPart(
  em: EntityManager,
  scope: { tenantId: string; organizationId: string },
  part: string,
): Promise<string[]> {
  const rows = await em.execute<{ id: string }[]>(
    "select id from training_outlines where tenant_id = ? and organization_id = ? and deleted_at is null and jsonb_array_length(coalesce(parts -> ?, '[]'::jsonb)) > 0",
    [scope.tenantId, scope.organizationId, part],
  )
  return rows.map((row) => row.id)
}

/** The library tenant and organization (the configured scope, DD-O10): every library query names both. */
export type LibraryQueryScope = { tenantId: string; organizationId: string }

/** The rating totals of every listed entry: the ranking's mean `m` (DD-O13). */
export async function libraryRatingTotals(
  em: EntityManager,
  scope: LibraryQueryScope,
): Promise<{ ratingSum: number; ratingCount: number }> {
  const rows = await em.execute<{ sum: string; count: string }[]>(
    `select coalesce(sum(rating_sum), 0)::text as sum, coalesce(sum(rating_count), 0)::text as count
       from training_library_entries
      where tenant_id = ? and organization_id = ? and status = 'listed' and deleted_at is null`,
    [scope.tenantId, scope.organizationId],
  )
  return { ratingSum: Number(rows[0]?.sum ?? 0), ratingCount: Number(rows[0]?.count ?? 0) }
}

export type LibrarySearchFilter = {
  /** The visibilities the viewer may see: `public` only without a session, both for a signed-in club user. */
  visibilities: readonly string[]
  /** `ILIKE` pattern over the topic and the goal (already escaped, `likePattern`). */
  pattern: string | null
  ageCategory: string | null
  /** A part that must hold at least one exercise (`warm_up`, `main`, `cool_down`; validated by the caller). */
  part: string | null
}

/**
 * One page of listed entries' ids in the chosen order (training outlines spec M-O8, DD-O13): `ranking` by the Bayesian
 * average `(5 × m + Σ) ÷ (5 + n)`, `used` by distinct users, `newest` by publication; ties by users, then newest, then
 * id. Returns the ids of the page and the total.
 */
export async function searchLibraryEntryIds(
  em: EntityManager,
  scope: LibraryQueryScope,
  filter: LibrarySearchFilter,
  order: { sort: 'ranking' | 'used' | 'newest'; mean: number; weight: number },
  page: { limit: number; offset: number },
): Promise<{ ids: string[]; total: number }> {
  const where: string[] = [
    'tenant_id = ?',
    'organization_id = ?',
    "status = 'listed'",
    'deleted_at is null',
    'visibility = any(?::text[])',
  ]
  const params: unknown[] = [scope.tenantId, scope.organizationId, `{${filter.visibilities.join(',')}}`]
  if (filter.pattern) {
    where.push("(topic ilike ? escape '\\' or goal ilike ? escape '\\')")
    params.push(filter.pattern, filter.pattern)
  }
  if (filter.ageCategory) {
    where.push('age_category = ?')
    params.push(filter.ageCategory)
  }
  if (filter.part) {
    where.push("jsonb_array_length(coalesce(parts -> ?, '[]'::jsonb)) > 0")
    params.push(filter.part)
  }
  const clause = where.join(' and ')
  const orderBy =
    order.sort === 'ranking'
      ? '((? * ?) + rating_sum)::float8 / (? + rating_count) desc, user_count desc, published_at desc, id asc'
      : order.sort === 'used'
        ? 'user_count desc, published_at desc, id asc'
        : 'published_at desc, id asc'
  const orderParams = order.sort === 'ranking' ? [order.weight, order.mean, order.weight] : []
  const rows = await em.execute<{ id: string }[]>(
    `select id from training_library_entries where ${clause} order by ${orderBy} limit ? offset ?`,
    [...params, ...orderParams, page.limit, page.offset],
  )
  const counted = await em.execute<{ count: string }[]>(
    `select count(*)::text as count from training_library_entries where ${clause}`,
    params,
  )
  return { ids: rows.map((row) => row.id), total: Number(counted[0]?.count ?? 0) }
}

/** Recomputes the aggregates of `entryIds` from their rating, use and report rows (every write that changes them). */
export async function recomputeLibraryAggregates(
  em: EntityManager,
  scope: LibraryQueryScope,
  entryIds: readonly string[],
): Promise<void> {
  const ids = [...new Set(entryIds)]
  if (ids.length === 0) return
  await em.execute(
    `update training_library_entries e set
        rating_sum = coalesce((select sum(r.stars) from training_library_ratings r
                                where r.tenant_id = e.tenant_id and r.entry_id = e.id), 0),
        rating_count = (select count(*) from training_library_ratings r where r.tenant_id = e.tenant_id and r.entry_id = e.id),
        user_count = (select count(*) from training_library_uses u where u.tenant_id = e.tenant_id and u.entry_id = e.id),
        report_count = (select count(*) from training_library_reports p where p.tenant_id = e.tenant_id and p.entry_id = e.id),
        updated_at = now()
      where e.tenant_id = ? and e.organization_id = ? and e.id = any(?::uuid[])`,
    [scope.tenantId, scope.organizationId, `{${ids.join(',')}}`],
  )
}

/** The number of different clubs that reported an entry (public reports, which have no club, do not count). */
export async function reportingClubs(em: EntityManager, scope: LibraryQueryScope, entryId: string): Promise<number> {
  const rows = await em.execute<{ count: string }[]>(
    `select count(distinct rater_organization_id)::text as count from training_library_reports
      where tenant_id = ? and organization_id = ? and entry_id = ? and rater_organization_id is not null`,
    [scope.tenantId, scope.organizationId, entryId],
  )
  return Number(rows[0]?.count ?? 0)
}

/** Entry ids whose credit names one of `entryIds` as the origin (`credit.adaptedFrom.entryId`). */
export async function entriesAdaptedFrom(
  em: EntityManager,
  scope: LibraryQueryScope,
  entryIds: readonly string[],
): Promise<string[]> {
  if (entryIds.length === 0) return []
  const rows = await em.execute<{ id: string }[]>(
    `select id from training_library_entries
      where tenant_id = ? and organization_id = ? and deleted_at is null
        and (credit -> 'adaptedFrom' ->> 'entryId') = any(?::text[])`,
    [scope.tenantId, scope.organizationId, `{${entryIds.join(',')}}`],
  )
  return rows.map((row) => row.id)
}
