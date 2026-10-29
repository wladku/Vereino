// Shared pieces of the `groups` routes: the grant kinds each read allows, their column maps, list-item serializers and
// OpenAPI schemas. Lists filter with `scopeWhere` and the detail route guards with `assertInScope` on the same kinds,
// so a list and a detail agree by construction (foundation spec P-03).
import { z } from 'zod'
import type { GrantKind, ScopeColumnMap, ScopeMatchOptions } from '@vereino/core'
import type { GroupMembership } from '../data/entities'

/**
 * Who reads a group and its roster (club spec *Users, Permissions, and Scope*): a coach or an assistant of the group
 * (`coached_group_ids`), the coordinator of its section, the club administrator. Least-privileged first, so a
 * coordinator who also coaches the group reads it as `coach` (DD-F08).
 */
export const GROUP_READ_KINDS: readonly GrantKind[] = ['coach', 'coordinator', 'club_admin']

/** `groups_groups` columns of the query engine (snake_case). */
export const GROUP_LIST_COLUMNS: ScopeColumnMap = { sectionId: 'section_id', groupId: 'id' }

/** `Group` entity properties, for the ORM read of the groups a caller may see (`services/groups-read.ts`). */
export const GROUP_ENTITY_COLUMNS: ScopeColumnMap = { sectionId: 'sectionId', groupId: 'id' }

/**
 * Seasons and external teams are club-wide dictionaries: everyone who works with groups (a coach, a coordinator, the
 * club administrator) reads all of them; the club administrator and every coordinator write them
 * (`commands/shared.ts`).
 */
export const DICTIONARY_READ_KINDS: readonly GrantKind[] = ['coach', 'coordinator', 'club_admin']
export const DICTIONARY_COLUMNS: ScopeColumnMap = {}
export const DICTIONARY_READ_OPTIONS: ScopeMatchOptions = { clubWideKinds: ['coach', 'coordinator'] }

/**
 * The entity ids of the lists (query engine, encryption maps). The query engine resolves the table through the ORM
 * class name (`<module>:<snake_case class>`), so a membership is `groups:group_membership` (class `GroupMembership`).
 */
export const GROUP_ENTITY_ID = 'groups:group'
export const MEMBERSHIP_ENTITY_ID = 'groups:group_membership'
export const SEASON_ENTITY_ID = 'groups:season'
export const EXTERNAL_TEAM_LIST_ENTITY_ID = 'groups:external_team'

type Row = Record<string, unknown>

const text = (value: unknown): string | null => (typeof value === 'string' ? value : null)
const bool = (value: unknown): boolean => value === true || value === 't' || value === 'true'

function iso(value: unknown): string | null {
  let date: Date | null = null
  if (value instanceof Date) date = value
  else if (typeof value === 'string' || typeof value === 'number') date = new Date(value)
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : null
}

/** A calendar date column (`date`) as `YYYY-MM-DD`; the driver may hand back a string or a Date at midnight UTC. */
function calendarDate(value: unknown): string | null {
  if (typeof value === 'string') return value.slice(0, 10)
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10)
  return null
}

export function groupListItem(row: Row) {
  return {
    id: String(row.id),
    sectionId: text(row.section_id),
    name: text(row.name),
    kind: text(row.kind),
    league: text(row.league),
    seasonId: text(row.season_id),
    description: text(row.description),
    isActive: bool(row.is_active),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  }
}

export type GroupListItem = ReturnType<typeof groupListItem> & {
  sectionName?: string | null
  seasonName?: string | null
}

export function membershipListItem(row: Row) {
  return {
    id: String(row.id),
    groupId: text(row.group_id),
    personId: text(row.person_id),
    role: text(row.role),
    validFrom: calendarDate(row.valid_from),
    validTo: calendarDate(row.valid_to),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  }
}

export type MembershipListItem = ReturnType<typeof membershipListItem> & {
  person?: { firstName: string; lastName: string } | null
}

/** A membership entity as the action routes return it. */
export function membershipView(row: GroupMembership) {
  return {
    id: row.id,
    groupId: row.groupId,
    personId: row.personId,
    role: row.role,
    validFrom: row.validFrom,
    validTo: row.validTo ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export function seasonListItem(row: Row) {
  return {
    id: String(row.id),
    name: text(row.name),
    startsOn: calendarDate(row.starts_on),
    endsOn: calendarDate(row.ends_on),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  }
}

export function externalTeamListItem(row: Row) {
  return {
    id: String(row.id),
    name: text(row.name),
    clubName: text(row.club_name),
    institutionId: text(row.institution_id),
    contact: text(row.contact),
    notes: text(row.notes),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  }
}

export const errorSchema = z.object({ error: z.string(), code: z.string().optional() }).loose()

export const updateResponseSchema = z.object({
  ok: z.literal(true),
  id: z.uuid(),
  updatedAt: z.string(),
  actingRole: z.string(),
})

export const groupListItemSchema = z.object({
  id: z.uuid(),
  sectionId: z.string().nullable(),
  sectionName: z.string().nullable().optional().describe('The name of the `club_core` section.'),
  name: z.string().nullable(),
  kind: z.string().nullable(),
  league: z.string().nullable(),
  seasonId: z.string().nullable(),
  seasonName: z.string().nullable().optional(),
  description: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
})

export const groupDetailSchema = groupListItemSchema.extend({
  actingRole: z.string().describe('The role the caller reads the group as: `coach`, `coordinator` or `club_admin`.'),
})

export const membershipListItemSchema = z.object({
  id: z.uuid(),
  groupId: z.string().nullable(),
  personId: z.string().nullable(),
  person: z
    .object({ firstName: z.string(), lastName: z.string() })
    .nullable()
    .optional()
    .describe('The name of the `people` person.'),
  role: z.string().nullable(),
  validFrom: z.string().nullable(),
  validTo: z.string().nullable(),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
})

export const seasonListItemSchema = z.object({
  id: z.uuid(),
  name: z.string().nullable(),
  startsOn: z.string().nullable(),
  endsOn: z.string().nullable(),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
})

export const externalTeamListItemSchema = z.object({
  id: z.uuid(),
  name: z.string().nullable(),
  clubName: z.string().nullable(),
  institutionId: z.string().nullable(),
  contact: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
})
