// The `groups` side of the people list's membership filters and Groups column (UX parity spec REQ-U01, DD-U01,
// DD-U02). `people` owns the contract (`people/services/person-filter.ts`) and resolves it with `hasRegistration`;
// `groups` registers it in `di.ts` under the token `people` names, so the dependency stays `groups` → `people`.
// A membership counts when it is live and active on the date and its group is live.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { CalendarDate } from '@vereino/core'
import type { PersonFilterContract } from '../../people/services/person-filter'
import { Group, GroupMembership } from '../data/entities'

/** The token `people` reads (`GROUPS_PERSON_FILTER` in `people/services/person-filter.ts`). */
export const GROUPS_PERSON_FILTER = 'groups.personFilter'

type Scope = { tenantId: string; organizationId: string }

function activeOn(on: CalendarDate) {
  return { deletedAt: null, validFrom: { $lte: on }, $or: [{ validTo: null }, { validTo: { $gte: on } }] }
}

export const personFilter: PersonFilterContract = {
  async matchPersonIds(em, { tenantId, organizationId, on, sectionId, groupId, membershipRoles }) {
    const scope = { tenantId, organizationId }
    let groupIds: string[] | null = null
    if (sectionId || groupId) {
      const groups = await em.find(
        Group,
        { ...scope, deletedAt: null, ...(sectionId ? { sectionId } : {}), ...(groupId ? { id: groupId } : {}) },
        { fields: ['id'] },
      )
      groupIds = groups.map((row) => row.id)
      if (groupIds.length === 0) return []
    }
    const memberships = await em.find(
      GroupMembership,
      {
        ...scope,
        ...activeOn(on),
        ...(groupIds ? { groupId: { $in: groupIds } } : {}),
        ...(membershipRoles ? { role: { $in: [...membershipRoles] } } : {}),
      },
      { fields: ['id', 'groupId', 'personId'] },
    )
    if (memberships.length === 0) return []
    // Without a group condition the groups are not loaded yet: keep only the memberships of live groups.
    const liveGroupIds =
      groupIds ??
      (
        await em.find(
          Group,
          { ...scope, deletedAt: null, id: { $in: [...new Set(memberships.map((row) => row.groupId))] } },
          { fields: ['id'] },
        )
      ).map((row) => row.id)
    const live = new Set(liveGroupIds)
    return [...new Set(memberships.filter((row) => live.has(row.groupId)).map((row) => row.personId))].sort()
  },
}

/** A person's active group on `on`, as the people list's Groups column shows it. */
export type PersonGroup = { id: string; name: string; role: string }

/** The live groups in which each of `personIds` has a membership active on `on`, ordered by group name. */
export async function activeGroupsOfPersons(
  em: EntityManager,
  scope: Scope,
  personIds: readonly string[],
  on: CalendarDate,
): Promise<Map<string, PersonGroup[]>> {
  const result = new Map<string, PersonGroup[]>()
  if (personIds.length === 0) return result
  const memberships = await em.find(
    GroupMembership,
    { ...scope, ...activeOn(on), personId: { $in: [...personIds] } },
    { fields: ['id', 'groupId', 'personId', 'role'] },
  )
  if (memberships.length === 0) return result
  const groups = await em.find(
    Group,
    { ...scope, deletedAt: null, id: { $in: [...new Set(memberships.map((row) => row.groupId))] } },
    { fields: ['id', 'name'] },
  )
  const names = new Map(groups.map((row) => [row.id, row.name]))
  for (const row of memberships) {
    const name = names.get(row.groupId)
    if (name === undefined) continue
    const list = result.get(row.personId) ?? []
    list.push({ id: row.groupId, name, role: row.role })
    result.set(row.personId, list)
  }
  for (const list of result.values()) list.sort((a, b) => a.name.localeCompare(b.name) || a.role.localeCompare(b.role))
  return result
}
