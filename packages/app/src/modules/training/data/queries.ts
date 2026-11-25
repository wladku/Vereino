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
