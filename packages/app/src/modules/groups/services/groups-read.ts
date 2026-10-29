// Reads behind the `groups` routes: one group of the trusted tenant and organization (the detail route checks it with
// `assertInScope`), the groups whose rosters a caller may list (`scopeWhere` on the groups, foundation spec P-03 — a
// coordinator's grant names sections, which memberships do not carry, so the roster list narrows to the visible
// groups), and the names a list shows next to its rows (sections, seasons, persons).
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { scopeWhere, type GrantKind, type Scope, type ScopeColumnMap } from '@vereino/core'
import { Group, Season } from '../data/entities'
import { findPersons, findSections, type GroupsScope } from './directory'

export async function findGroup(container: AwilixContainer, scope: GroupsScope, id: string): Promise<Group | null> {
  const em = container.resolve<EntityManager>('em').fork()
  return em.findOne(Group, { id, ...scope, deletedAt: null })
}

/**
 * The ids of the live groups of the organization the caller's scope lets them read, or `'all'` when a club-wide grant
 * covers every group. Both come from `scopeWhere` with the groups' own column map, so the roster list and the group
 * list agree by construction; no grant yields an empty list (fail closed).
 */
export async function readableGroupIds(
  container: AwilixContainer,
  trusted: GroupsScope,
  scope: Scope,
  kinds: readonly GrantKind[],
  columns: ScopeColumnMap,
): Promise<string[] | 'all'> {
  const where = scopeWhere(scope, kinds, columns)
  if (Object.keys(where).length === 0) return 'all'
  const em = container.resolve<EntityManager>('em').fork()
  const rows = await em.find(Group, { $and: [where, { ...trusted, deletedAt: null }] }, { fields: ['id'] })
  return rows.map((row) => row.id)
}

/** Section names by id (`club_core`), for the rows a list already authorized. */
export async function sectionNames(
  container: AwilixContainer,
  scope: GroupsScope,
  ids: readonly string[],
): Promise<Map<string, string>> {
  const sections = await findSections(container, scope, ids)
  return new Map([...sections.values()].map((section) => [section.id, section.name]))
}

/** Season names by id. */
export async function seasonNames(
  container: AwilixContainer,
  scope: GroupsScope,
  ids: readonly string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return new Map()
  const em = container.resolve<EntityManager>('em').fork()
  const rows = await em.find(Season, { id: { $in: unique }, ...scope, deletedAt: null }, { fields: ['id', 'name'] })
  return new Map(rows.map((row) => [row.id, row.name]))
}

/** Person names by id (`people`), for the roster rows a list already authorized. */
export async function personNames(
  container: AwilixContainer,
  scope: GroupsScope,
  ids: readonly string[],
): Promise<Map<string, { firstName: string; lastName: string }>> {
  const persons = await findPersons(container, scope, ids)
  return new Map(
    [...persons.values()].map((person) => [person.id, { firstName: person.firstName, lastName: person.lastName }]),
  )
}
