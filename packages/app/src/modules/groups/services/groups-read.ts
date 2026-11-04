// Reads behind the `groups` routes: one group of the trusted tenant and organization (the detail route checks it with
// `assertInScope`), the groups whose rosters a caller may list (`scopeWhere` on the groups, foundation spec P-03 — a
// coordinator's grant names sections, which memberships do not carry, so the roster list narrows to the visible
// groups), the names a list shows next to its rows (sections, seasons, persons), and the groups of a member's own
// person and wards (E06-S22 #104).
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { ageOn, scopeWhere, type CalendarDate, type GrantKind, type Scope, type ScopeColumnMap } from '@vereino/core'
import { Group, GroupMembership, Season } from '../data/entities'
import { summarizeRosters, type GroupRosterSummary } from '../lib/group-list'
import { memberGroupRows, memberPersonIds, type MemberGroupRow } from '../lib/member-groups'
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

/**
 * Roster persons by id (`people`): the name and the age in completed years on the club day `today` (null without a
 * birth date), for the roster rows a list already authorized (B-12, E06-S08 #90). The birth date itself is not exposed.
 */
export async function rosterPersons(
  container: AwilixContainer,
  scope: GroupsScope,
  ids: readonly string[],
  today: CalendarDate,
): Promise<Map<string, { firstName: string; lastName: string; age: number | null }>> {
  const persons = await findPersons(container, scope, ids)
  return new Map(
    [...persons.values()].map((person) => [
      person.id,
      {
        firstName: person.firstName,
        lastName: person.lastName,
        age: person.birthDate ? ageOn(person.birthDate.slice(0, 10), today) : null,
      },
    ]),
  )
}

/**
 * The roster summary of each listed group on the club day `today` (E06-S08 #90): its coaching persons and its number
 * of distinct active participants, from one read of the active memberships of those groups. The caller has already
 * authorized the groups.
 */
export async function rosterSummaries(
  container: AwilixContainer,
  scope: GroupsScope,
  groupIds: readonly string[],
  today: CalendarDate,
): Promise<Map<string, GroupRosterSummary>> {
  const unique = [...new Set(groupIds)]
  if (unique.length === 0) return new Map()
  const em = container.resolve<EntityManager>('em').fork()
  const rows = await em.find(
    GroupMembership,
    {
      ...scope,
      groupId: { $in: unique },
      deletedAt: null,
      validFrom: { $lte: today },
      $or: [{ validTo: null }, { validTo: { $gte: today } }],
    },
    { fields: ['groupId', 'personId', 'role'], orderBy: { validFrom: 'asc', id: 'asc' } },
  )
  return summarizeRosters(unique, rows)
}

/**
 * The groups of the member's own person and wards on the club day (E06-S22 #104; README M-10): the persons come only
 * from the caller's `self` and `guardian` grants, so a member never reads another family's groups.
 */
export async function memberGroups(
  container: AwilixContainer,
  trusted: GroupsScope,
  scope: Scope,
  today: CalendarDate,
): Promise<MemberGroupRow[]> {
  const personIds = memberPersonIds(scope)
  if (personIds.length === 0) return []
  const em = container.resolve<EntityManager>('em').fork()
  const memberships = await em.find(
    GroupMembership,
    { ...trusted, personId: { $in: personIds }, deletedAt: null },
    { fields: ['id', 'groupId', 'personId', 'role', 'validFrom', 'validTo'] },
  )
  if (memberships.length === 0) return []
  const groupIds = [...new Set(memberships.map((row) => row.groupId))]
  const groups = await em.find(
    Group,
    { id: { $in: groupIds }, ...trusted, deletedAt: null },
    { fields: ['id', 'name', 'kind', 'sectionId', 'isActive'] },
  )
  const names = await sectionNames(
    container,
    trusted,
    groups.map((group) => group.sectionId),
  )
  return memberGroupRows(
    memberships.map((row) => ({
      personId: row.personId,
      groupId: row.groupId,
      role: row.role,
      validFrom: row.validFrom,
      validTo: row.validTo ?? null,
    })),
    new Map(groups.map((group) => [group.id, group])),
    names,
    today,
  )
}
