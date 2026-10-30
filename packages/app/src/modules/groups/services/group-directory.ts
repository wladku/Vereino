// `groups.directory` (club spec *Architecture*: modules that require `groups` reach its records through DI, never
// through its entities): the groups of one organization by id, a group's roster on a club-zone date and external
// teams by id — for `activities` (an activity's group and section, the people a cancelled session concerns, a
// tournament's invited teams; #31). Callers have already authorized the records that carry these ids.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { CalendarDate } from '@vereino/core'
import { ExternalTeam, Group, GroupMembership } from '../data/entities'
import type { GroupKind, MembershipRole } from '../lib/groups-rules'
import type { GroupsScope } from './directory'

export type GroupDirectoryEntry = { id: string; sectionId: string; name: string; kind: GroupKind; isActive: boolean }

export type RosterEntry = { personId: string; role: MembershipRole }

export type ExternalTeamDirectoryEntry = { id: string; name: string }

export type GroupDirectory = {
  /** The live groups of the organization among `ids`, by id. */
  findGroups(scope: GroupsScope, ids: readonly string[], em?: EntityManager): Promise<Map<string, GroupDirectoryEntry>>
  /** The live memberships of a group active on `date` (any role), one entry per person and role. */
  rosterOn(scope: GroupsScope, groupId: string, date: CalendarDate, em?: EntityManager): Promise<RosterEntry[]>
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
    findExternalTeams: (scope, ids, em) => findExternalTeams(em ?? getEm().fork(), scope, ids),
  }
}
