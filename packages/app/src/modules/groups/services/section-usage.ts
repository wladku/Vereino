// The `groups` side of the section deactivation guard and the section list's group counts (UX parity spec REQ-U02,
// DD-U04). `club_core` owns the contract (`club_core/services/section-usage.ts`) and resolves it with
// `hasRegistration`; `groups` registers it in `di.ts` under the token `club_core` names, so the dependency stays
// `groups` → `club_core`. An active group of a section is live (`deleted_at IS NULL`) and `is_active`.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { SectionUsageContract } from '../../club_core/services/section-usage'
import { Group } from '../data/entities'

/** The token `club_core` reads (`GROUPS_SECTION_USAGE` in `club_core/services/section-usage.ts`). */
export const GROUPS_SECTION_USAGE = 'groups.sectionUsage'

type Scope = { tenantId: string; organizationId: string }

export const sectionUsage: SectionUsageContract = {
  async activeGroupsOf(em, { tenantId, organizationId, sectionId, limit }) {
    const where = { tenantId, organizationId, sectionId, isActive: true, deletedAt: null }
    const [rows, total] = await em.findAndCount(Group, where, {
      fields: ['id', 'name'],
      orderBy: { name: 'asc', id: 'asc' },
      limit,
    })
    return { groups: rows.map((row) => ({ id: row.id, name: row.name })), total }
  },
}

/** The number of active groups of each of `sectionIds` (sections without one are absent). */
export async function activeGroupCounts(
  em: EntityManager,
  scope: Scope,
  sectionIds: readonly string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  if (sectionIds.length === 0) return counts
  const rows = await em.find(
    Group,
    { ...scope, sectionId: { $in: [...sectionIds] }, isActive: true, deletedAt: null },
    { fields: ['id', 'sectionId'] },
  )
  for (const row of rows) counts.set(row.sectionId, (counts.get(row.sectionId) ?? 0) + 1)
  return counts
}
