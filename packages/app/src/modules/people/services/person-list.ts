// Reads behind the people list's filters and columns (UX parity spec REQ-U01, DD-U01, DD-U02; B-09). The id predicates
// over `people`'s own data (role assignments, guardianships, the name search) are resolved here; the membership
// predicates come from the optional `groups.personFilter` contract. The route intersects every set into its `id`
// filter on top of the record scope, so a filter only ever narrows what the caller may read.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import type { AssignableRole, CalendarDate } from '@vereino/core'
import { Guardianship, Person, RoleAssignment } from '../data/entities'
import { ASSIGNABLE_ROLES } from '../data/validators'
import { intersectIdSets, listDisplayName, type PersonListPlan } from '../lib/person-list-filters'
import type { ClubScope } from './club-clock'
import { searchPersonIds as searchDirectoryPersonIds } from './person-directory'
import { personFilterContract, type PersonFilterContract, type PersonFilterQuery } from './person-filter'

/** Why the list cannot answer a plan: a membership filter without `groups`, or the `groups` contract failed. */
export class PersonFilterProblem extends Error {
  constructor(readonly problem: 'unavailable' | 'failed') {
    super(`[internal] people list filter ${problem}`)
  }
}

/** The validity condition of a row active on `today` (inclusive, open-ended when `valid_to` is null). */
function activeOn(today: CalendarDate) {
  return { validFrom: { $lte: today }, $or: [{ validTo: null }, { validTo: { $gte: today } }] }
}

async function assignedPersonIds(
  em: EntityManager,
  scope: ClubScope,
  today: CalendarDate,
  where: { roles: readonly AssignableRole[]; sectionId?: string },
): Promise<Set<string>> {
  const rows = await em.find(
    RoleAssignment,
    {
      ...scope,
      ...activeOn(today),
      role: { $in: [...where.roles] },
      ...(where.sectionId ? { sectionId: where.sectionId } : {}),
      deletedAt: null,
    },
    { fields: ['id', 'personId'] },
  )
  return new Set(rows.map((row) => row.personId))
}

async function guardianPersonIds(em: EntityManager, scope: ClubScope, today: CalendarDate): Promise<Set<string>> {
  const rows = await em.find(
    Guardianship,
    { ...scope, ...activeOn(today), deletedAt: null },
    { fields: ['id', 'guardianPersonId'] },
  )
  return new Set(rows.map((row) => row.guardianPersonId))
}

async function memberIds(
  contract: PersonFilterContract | null,
  em: EntityManager,
  query: PersonFilterQuery,
): Promise<Set<string>> {
  if (!contract) throw new PersonFilterProblem('unavailable')
  try {
    return new Set(await contract.matchPersonIds(em, query))
  } catch (error) {
    throw Object.assign(new PersonFilterProblem('failed'), { cause: error })
  }
}

function union(...sets: ReadonlyArray<ReadonlySet<string>>): Set<string> {
  return new Set(sets.flatMap((set) => [...set]))
}

/**
 * The ids the plan's role, section, group and staff predicates allow, or null when none applies. Throws
 * `PersonFilterProblem('unavailable')` when a predicate needs `groups` and it is absent, and `'failed'` when the
 * contract throws.
 */
export async function resolvePlanPersonIds(
  container: AwilixContainer,
  scope: ClubScope,
  plan: PersonListPlan,
  today: CalendarDate,
): Promise<Set<string> | null> {
  const em = container.resolve<EntityManager>('em').fork()
  const contract = personFilterContract(container)
  const base = { ...scope, on: today }
  const sets: Array<Set<string> | null> = []

  if (plan.staff) {
    const assigned = await assignedPersonIds(em, scope, today, { roles: ASSIGNABLE_ROLES })
    // Without `groups` there is no coach membership: the staff are the role assignments alone.
    const coaching = contract
      ? await memberIds(contract, em, { ...base, membershipRoles: ['coach', 'assistant'] })
      : new Set<string>()
    sets.push(union(assigned, coaching))
  }
  if (plan.role === 'club_admin' || plan.role === 'coordinator') {
    sets.push(await assignedPersonIds(em, scope, today, { roles: [plan.role] }))
  } else if (plan.role === 'coach') {
    const assigned = await assignedPersonIds(em, scope, today, { roles: ['coach'] })
    const coaching = contract
      ? await memberIds(contract, em, { ...base, membershipRoles: ['coach', 'assistant'] })
      : new Set<string>()
    sets.push(union(assigned, coaching))
  } else if (plan.role === 'guardian') {
    sets.push(await guardianPersonIds(em, scope, today))
  } else if (plan.role === 'participant') {
    sets.push(await memberIds(contract, em, { ...base, membershipRoles: ['participant'] }))
  }
  if (plan.sectionId) {
    const members = await memberIds(contract, em, { ...base, sectionId: plan.sectionId })
    const assigned = await assignedPersonIds(em, scope, today, {
      roles: ASSIGNABLE_ROLES,
      sectionId: plan.sectionId,
    })
    sets.push(union(members, assigned))
  }
  if (plan.groupId) sets.push(await memberIds(contract, em, { ...base, groupId: plan.groupId }))
  return intersectIdSets(sets)
}

/**
 * The ids of the people whose first or last name matches every word of `term` (prefixes of three characters or more),
 * through the platform's hashed `search_tokens` — the names are encrypted. Null when the index was not consulted
 * (search disabled, or no word long enough): the caller then falls back to a last-name match.
 */
export function searchPersonIds(
  container: AwilixContainer,
  scope: ClubScope,
  term: string,
): Promise<Set<string> | null> {
  return searchDirectoryPersonIds(container.resolve<EntityManager>('em'), scope, term)
}

/** The columns `people` adds to a list row: roles, whether the person has wards, and the guardians' names. */
export type PersonListColumns = {
  roles: AssignableRole[]
  hasWards: boolean
  guardians: Array<{ id: string; displayName: string }>
}

/**
 * The own columns of the listed people on `today`: active role assignments, active guardianships as a guardian, and
 * the guardians of each ward. A guardian's name is returned only when `canReadPerson` allows the caller to read that
 * person (basic data: the display name only).
 */
export async function loadPersonListColumns(
  container: AwilixContainer,
  scope: ClubScope,
  personIds: readonly string[],
  today: CalendarDate,
  canReadPerson: (personId: string) => boolean,
): Promise<Map<string, PersonListColumns>> {
  const result = new Map<string, PersonListColumns>()
  if (personIds.length === 0) return result
  const em = container.resolve<EntityManager>('em').fork()
  const ids = [...personIds]
  const [assignments, asGuardian, asWard] = await Promise.all([
    em.find(
      RoleAssignment,
      { ...scope, ...activeOn(today), personId: { $in: ids }, deletedAt: null },
      { fields: ['id', 'personId', 'role'] },
    ),
    em.find(
      Guardianship,
      { ...scope, ...activeOn(today), guardianPersonId: { $in: ids }, deletedAt: null },
      { fields: ['id', 'guardianPersonId'] },
    ),
    em.find(
      Guardianship,
      { ...scope, ...activeOn(today), wardPersonId: { $in: ids }, deletedAt: null },
      { fields: ['id', 'guardianPersonId', 'wardPersonId'] },
    ),
  ])
  const guardianIds = [...new Set(asWard.map((row) => row.guardianPersonId))].filter(canReadPerson)
  const guardians =
    guardianIds.length > 0
      ? await findWithDecryption(
          em,
          Person,
          { id: { $in: guardianIds }, ...scope, deletedAt: null },
          { fields: ['id', 'firstName', 'lastName'] },
          scope,
        )
      : []
  const names = new Map(guardians.map((person) => [person.id, listDisplayName(person)]))
  const wardsOf = new Set(asGuardian.map((row) => row.guardianPersonId))
  for (const id of ids) {
    const held = new Set(assignments.filter((row) => row.personId === id).map((row) => row.role))
    result.set(id, {
      roles: ASSIGNABLE_ROLES.filter((role) => held.has(role)),
      hasWards: wardsOf.has(id),
      guardians: asWard
        .filter((row) => row.wardPersonId === id && names.has(row.guardianPersonId))
        .map((row) => ({ id: row.guardianPersonId, displayName: names.get(row.guardianPersonId) as string }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName)),
    })
  }
  return result
}
