// `groups.directory` (club spec *Architecture*: modules that require `groups` reach its records through DI, never
// through its entities): the groups of one organization by id, a group's roster on a club-zone date and external
// teams by id — for `activities` (an activity's group and section, the people a cancelled session concerns, a
// tournament's invited teams; #31). Callers have already authorized the records that carry these ids.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { CalendarDate } from '@vereino/core'
import { ExternalTeam, Group, GroupMembership } from '../data/entities'
import { COACHING_ROLES, type GroupKind, type MembershipRole } from '../lib/groups-rules'
import type { GroupsScope } from './directory'

export type GroupDirectoryEntry = { id: string; sectionId: string; name: string; kind: GroupKind; isActive: boolean }

export type RosterEntry = { personId: string; role: MembershipRole }

export type ExternalTeamDirectoryEntry = { id: string; name: string }

/** A membership of one person as the member calendar reads it (#32): the group, the role and the period. */
export type MembershipPeriod = {
  personId: string
  groupId: string
  role: MembershipRole
  validFrom: CalendarDate
  validTo: CalendarDate | null
}

export type GroupDirectory = {
  /** The live groups of the organization among `ids`, by id. */
  findGroups(scope: GroupsScope, ids: readonly string[], em?: EntityManager): Promise<Map<string, GroupDirectoryEntry>>
  /** The live memberships of a group active on `date` (any role), one entry per person and role. */
  rosterOn(scope: GroupsScope, groupId: string, date: CalendarDate, em?: EntityManager): Promise<RosterEntry[]>
  /**
   * The live memberships of `personIds` whose period overlaps the inclusive window of club-zone dates (the member
   * calendar: a person's groups across every section, #32); the caller checks each session date against the period.
   */
  membershipsOf(
    scope: GroupsScope,
    personIds: readonly string[],
    window: { from: CalendarDate; to: CalendarDate },
    em?: EntityManager,
  ): Promise<MembershipPeriod[]>
  /**
   * The live active groups of the organization, by name: all of them (`filter` null), or those in `sectionIds` or
   * among `groupIds` — the targets an author may address (foundation III `AudiencePicker`, #35). The caller derives
   * the filter from the author's grants.
   */
  listGroups(
    scope: GroupsScope,
    filter: { sectionIds?: readonly string[]; groupIds?: readonly string[] } | null,
    em?: EntityManager,
  ): Promise<GroupDirectoryEntry[]>
  /**
   * The persons who lead any group on `date` — a live `coach` or `assistant` membership active that day (the coach
   * picker of the activity wizard, #93). Ids only.
   */
  leaderIdsOn(scope: GroupsScope, date: CalendarDate, em?: EntityManager): Promise<string[]>
  /** The live external teams of the organization among `ids`, by id. */
  findExternalTeams(
    scope: GroupsScope,
    ids: readonly string[],
    em?: EntityManager,
  ): Promise<Map<string, ExternalTeamDirectoryEntry>>
}

export async function findGroups(
  em: EntityManager,
  scope: GroupsScope,
  ids: readonly string[],
): Promise<Map<string, GroupDirectoryEntry>> {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return new Map()
  const rows = await em.find(
    Group,
    { id: { $in: unique }, ...scope, deletedAt: null },
    { fields: ['id', 'sectionId', 'name', 'kind', 'isActive'] },
  )
  return new Map(
    rows.map((row) => [
      row.id,
      { id: row.id, sectionId: row.sectionId, name: row.name, kind: row.kind, isActive: row.isActive },
    ]),
  )
}

export async function rosterOn(
  em: EntityManager,
  scope: GroupsScope,
  groupId: string,
  date: CalendarDate,
): Promise<RosterEntry[]> {
  const rows = await em.find(
    GroupMembership,
    {
      ...scope,
      groupId,
      deletedAt: null,
      validFrom: { $lte: date },
      $or: [{ validTo: null }, { validTo: { $gte: date } }],
    },
    { fields: ['id', 'personId', 'role'] },
  )
  const seen = new Set<string>()
  const roster: RosterEntry[] = []
  for (const row of rows) {
    const key = `${row.personId}:${row.role}`
    if (seen.has(key)) continue
    seen.add(key)
    roster.push({ personId: row.personId, role: row.role })
  }
  return roster
}

export async function membershipsOf(
  em: EntityManager,
  scope: GroupsScope,
  personIds: readonly string[],
  window: { from: CalendarDate; to: CalendarDate },
): Promise<MembershipPeriod[]> {
  const unique = [...new Set(personIds)]
  if (unique.length === 0) return []
  const rows = await em.find(
    GroupMembership,
    {
      ...scope,
      personId: { $in: unique },
      deletedAt: null,
      validFrom: { $lte: window.to },
      $or: [{ validTo: null }, { validTo: { $gte: window.from } }],
    },
    { fields: ['id', 'personId', 'groupId', 'role', 'validFrom', 'validTo'] },
  )
  return rows.map((row) => ({
    personId: row.personId,
    groupId: row.groupId,
    role: row.role,
    validFrom: row.validFrom,
    validTo: row.validTo ?? null,
  }))
}

export async function listGroups(
  em: EntityManager,
  scope: GroupsScope,
  filter: { sectionIds?: readonly string[]; groupIds?: readonly string[] } | null,
): Promise<GroupDirectoryEntry[]> {
  const or: Array<Record<string, unknown>> = []
  if (filter?.sectionIds && filter.sectionIds.length > 0) or.push({ sectionId: { $in: [...filter.sectionIds] } })
  if (filter?.groupIds && filter.groupIds.length > 0) or.push({ id: { $in: [...filter.groupIds] } })
  if (filter && or.length === 0) return []
  const rows = await em.find(
    Group,
    { ...scope, deletedAt: null, isActive: true, ...(or.length > 0 ? { $or: or } : {}) },
    { fields: ['id', 'sectionId', 'name', 'kind', 'isActive'], orderBy: { name: 'asc' }, limit: 500 },
  )
  return rows.map((row) => ({
    id: row.id,
    sectionId: row.sectionId,
    name: row.name,
    kind: row.kind,
    isActive: row.isActive,
  }))
}

export async function leaderIdsOn(em: EntityManager, scope: GroupsScope, date: CalendarDate): Promise<string[]> {
  const rows = await em.find(
    GroupMembership,
    {
      ...scope,
      deletedAt: null,
      role: { $in: [...COACHING_ROLES] },
      validFrom: { $lte: date },
      $or: [{ validTo: null }, { validTo: { $gte: date } }],
    },
    { fields: ['id', 'personId'] },
  )
  return [...new Set(rows.map((row) => row.personId))]
}

export async function findExternalTeams(
  em: EntityManager,
  scope: GroupsScope,
  ids: readonly string[],
): Promise<Map<string, ExternalTeamDirectoryEntry>> {
  const unique = [...new Set(ids)]
  if (unique.length === 0) return new Map()
  const rows = await em.find(
    ExternalTeam,
    { id: { $in: unique }, ...scope, deletedAt: null },
    { fields: ['id', 'name'] },
  )
  return new Map(rows.map((row) => [row.id, { id: row.id, name: row.name }]))
}

export function createGroupDirectory(getEm: () => EntityManager): GroupDirectory {
  return {
    findGroups: (scope, ids, em) => findGroups(em ?? getEm().fork(), scope, ids),
    rosterOn: (scope, groupId, date, em) => rosterOn(em ?? getEm().fork(), scope, groupId, date),
    membershipsOf: (scope, personIds, window, em) => membershipsOf(em ?? getEm().fork(), scope, personIds, window),
    listGroups: (scope, filter, em) => listGroups(em ?? getEm().fork(), scope, filter),
    leaderIdsOn: (scope, date, em) => leaderIdsOn(em ?? getEm().fork(), scope, date),
    findExternalTeams: (scope, ids, em) => findExternalTeams(em ?? getEm().fork(), scope, ids),
  }
}
