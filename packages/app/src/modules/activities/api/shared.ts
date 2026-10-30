// Shared pieces of the `activities` routes: the grant kinds each read allows, their column maps, list-item serializers,
// the name enrichment of list rows and the OpenAPI schemas. Lists filter with `scopeWhere` and the detail routes guard
// with `assertInScope` on the same kinds, so a list and a detail agree by construction (foundation spec P-03).
import { z } from 'zod'
import type { CrudCtx } from '@open-mercato/shared/lib/crud/factory'
import type { GrantKind, ScopeColumnMap } from '@vereino/core'
import type { Attendance } from '../data/entities'
import { DECLARATION_KINDS, DECLARATION_SOURCES, DECLARATION_STATUSES, DECLARED_VALUES } from '../lib/policy'
import { activityLabels, nameMaps } from '../services/read'

/**
 * Who reads activities and sessions (club spec *Users, Permissions, and Scope*): a coach of the group
 * (`coached_group_ids`), the coordinator of its section, the club administrator. Least-privileged first (DD-F08).
 */
export const SCHEDULE_READ_KINDS: readonly GrantKind[] = ['coach', 'coordinator', 'club_admin']

/** `activities_activities` columns of the query engine (snake_case). */
export const ACTIVITY_LIST_COLUMNS: ScopeColumnMap = { sectionId: 'section_id', groupId: 'group_id' }

/** `activities_occurrences` columns; a substitute coach's grant names the session itself. */
export const OCCURRENCE_LIST_COLUMNS: ScopeColumnMap = {
  sectionId: 'section_id',
  groupId: 'group_id',
  occurrenceId: 'id',
}

/** List entity ids: `<module>:<snake_case of the ORM class>` (lesson `query-engine-entity-ids-and-acl-depends-on`). */
export const ACTIVITY_ENTITY_ID = 'activities:activity'
export const OCCURRENCE_ENTITY_ID = 'activities:occurrence'

type Row = Record<string, unknown>

const text = (value: unknown): string | null => (typeof value === 'string' ? value : null)
const bool = (value: unknown): boolean => value === true || value === 't' || value === 'true'

function iso(value: unknown): string | null {
  let date: Date | null = null
  if (value instanceof Date) date = value
  else if (typeof value === 'string' || typeof value === 'number') date = new Date(value)
  return date && !Number.isNaN(date.getTime()) ? date.toISOString() : null
}

/** A `date` column as `YYYY-MM-DD`; the driver may hand back a string or a Date at midnight UTC. */
function calendarDate(value: unknown): string | null {
  if (typeof value === 'string') return value.slice(0, 10)
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10)
  return null
}

/** A `time` column as `HH:mm`. */
function wallTime(value: unknown): string | null {
  return typeof value === 'string' ? value.slice(0, 5) : null
}

/** A `uuid[]` column: an array, or the Postgres literal `{a,b}` some drivers return. */
function uuidList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((entry): entry is string => typeof entry === 'string')
  if (typeof value === 'string' && value.startsWith('{') && value.length > 2) return value.slice(1, -1).split(',')
  return []
}

export function activityListItem(row: Row) {
  return {
    id: String(row.id),
    sectionId: text(row.section_id),
    groupId: text(row.group_id),
    name: text(row.name),
    type: text(row.type),
    placeId: text(row.default_place_id),
    coachPersonId: text(row.default_coach_person_id),
    opponentExternalTeamId: text(row.opponent_external_team_id),
    invitedExternalTeamIds: uuidList(row.invited_external_team_ids),
    recurrenceRule: text(row.recurrence_rule),
    startsOn: calendarDate(row.starts_on),
    endsOn: calendarDate(row.ends_on),
    startTime: wallTime(row.default_start_time),
    endTime: wallTime(row.default_end_time),
    generatedUntil: calendarDate(row.generated_until),
    description: text(row.description),
    isActive: bool(row.is_active),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  }
}

export type ActivityListItem = ReturnType<typeof activityListItem> & {
  groupName?: string | null
  sectionName?: string | null
  placeName?: string | null
  coachName?: string | null
}

export function occurrenceListItem(row: Row) {
  return {
    id: String(row.id),
    activityId: text(row.activity_id),
    groupId: text(row.group_id),
    sectionId: text(row.section_id),
    occurrenceDate: calendarDate(row.occurrence_date),
    startAt: iso(row.start_at),
    endAt: iso(row.end_at),
    placeId: text(row.place_id),
    coachPersonId: text(row.coach_person_id),
    status: text(row.status),
    cancelReason: text(row.cancel_reason),
    isDetached: bool(row.is_detached),
    needsReschedule: bool(row.needs_reschedule),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  }
}

export type OccurrenceListItem = ReturnType<typeof occurrenceListItem> & {
  activityName?: string | null
  activityType?: string | null
  groupName?: string | null
  placeName?: string | null
  coachName?: string | null
}

function trustedScope(ctx: CrudCtx): { tenantId: string; organizationId: string } | null {
  const tenantId = ctx.auth?.tenantId
  const organizationId = ctx.selectedOrganizationId ?? ctx.auth?.orgId
  return tenantId && organizationId ? { tenantId, organizationId } : null
}

/** Adds the group, section, place and coach names to the activity rows the scope filter already admitted. */
export async function attachActivityNames(payload: { items?: unknown[] }, ctx: CrudCtx): Promise<void> {
  const items = (payload.items ?? []) as ActivityListItem[]
  const scope = trustedScope(ctx)
  if (items.length === 0 || !scope) return
  const names = await nameMaps(ctx.container, scope, {
    groupIds: items.flatMap((item) => (item.groupId ? [item.groupId] : [])),
    sectionIds: items.flatMap((item) => (item.sectionId ? [item.sectionId] : [])),
    placeIds: items.flatMap((item) => (item.placeId ? [item.placeId] : [])),
    personIds: items.flatMap((item) => (item.coachPersonId ? [item.coachPersonId] : [])),
  })
  for (const item of items) {
    item.groupName = item.groupId ? (names.groups.get(item.groupId) ?? null) : null
    item.sectionName = item.sectionId ? (names.sections.get(item.sectionId) ?? null) : null
    item.placeName = item.placeId ? (names.places.get(item.placeId) ?? null) : null
    item.coachName = item.coachPersonId ? (names.persons.get(item.coachPersonId) ?? null) : null
  }
}

/** Adds the activity, group, place and coach names to the session rows the scope filter already admitted. */
export async function attachOccurrenceNames(payload: { items?: unknown[] }, ctx: CrudCtx): Promise<void> {
  const items = (payload.items ?? []) as OccurrenceListItem[]
  const scope = trustedScope(ctx)
  if (items.length === 0 || !scope) return
  const [names, activities] = await Promise.all([
    nameMaps(ctx.container, scope, {
      groupIds: items.flatMap((item) => (item.groupId ? [item.groupId] : [])),
      sectionIds: [],
      placeIds: items.flatMap((item) => (item.placeId ? [item.placeId] : [])),
      personIds: items.flatMap((item) => (item.coachPersonId ? [item.coachPersonId] : [])),
    }),
    activityLabels(
      ctx.container,
      scope,
      items.flatMap((item) => (item.activityId ? [item.activityId] : [])),
    ),
  ])
  for (const item of items) {
    const activity = item.activityId ? activities.get(item.activityId) : undefined
    item.activityName = activity?.name ?? null
    item.activityType = activity?.type ?? null
    item.groupName = item.groupId ? (names.groups.get(item.groupId) ?? null) : null
    item.placeName = item.placeId ? (names.places.get(item.placeId) ?? null) : null
    item.coachName = item.coachPersonId ? (names.persons.get(item.coachPersonId) ?? null) : null
  }
}

export const errorSchema = z.object({ error: z.string(), code: z.string().optional() }).loose()

export const conflictSchema = z.object({
  key: z.string().describe('The slot date of a series candidate, or the session id of a single session.'),
  startAt: z.string(),
  endAt: z.string(),
  kind: z.enum(['place', 'coach']),
  sessions: z.array(
    z.object({
      id: z.uuid(),
      activityId: z.uuid(),
      activityName: z.string().nullable(),
      groupId: z.uuid(),
      placeId: z.uuid(),
      startAt: z.string(),
      endAt: z.string(),
    }),
  ),
  blocks: z.array(z.object({ id: z.string(), reason: z.string(), startAt: z.string(), endAt: z.string() })),
})

export const conflictErrorSchema = errorSchema.extend({ conflicts: z.array(conflictSchema).optional() })

export const updateResponseSchema = z.object({
  ok: z.literal(true),
  id: z.uuid(),
  updatedAt: z.string(),
  actingRole: z.string(),
})

export const activityListItemSchema = z.object({
  id: z.uuid(),
  sectionId: z.string().nullable(),
  sectionName: z.string().nullable().optional(),
  groupId: z.string().nullable(),
  groupName: z.string().nullable().optional(),
  name: z.string().nullable(),
  type: z.string().nullable(),
  placeId: z.string().nullable(),
  placeName: z.string().nullable().optional(),
  coachPersonId: z.string().nullable(),
  coachName: z.string().nullable().optional(),
  opponentExternalTeamId: z.string().nullable(),
  invitedExternalTeamIds: z.array(z.string()),
  recurrenceRule: z.string().nullable().describe('The stored RRULE subset text with an optional `EXDATE:` line.'),
  startsOn: z.string().nullable(),
  endsOn: z.string().nullable(),
  startTime: z.string().nullable(),
  endTime: z.string().nullable(),
  generatedUntil: z.string().nullable(),
  description: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
})

export const occurrenceListItemSchema = z.object({
  id: z.uuid(),
  activityId: z.string().nullable(),
  activityName: z.string().nullable().optional(),
  activityType: z.string().nullable().optional(),
  groupId: z.string().nullable(),
  groupName: z.string().nullable().optional(),
  sectionId: z.string().nullable(),
  occurrenceDate: z.string().nullable(),
  startAt: z.string().nullable(),
  endAt: z.string().nullable(),
  placeId: z.string().nullable(),
  placeName: z.string().nullable().optional(),
  coachPersonId: z.string().nullable(),
  coachName: z.string().nullable().optional(),
  status: z.string().nullable(),
  cancelReason: z.string().nullable(),
  isDetached: z.boolean(),
  needsReschedule: z.boolean(),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
})

// --- Declarations, policies and calendars (#32) ---

/** `activities:attendance_policy` (class `AttendancePolicy`). */
export const ATTENDANCE_POLICY_ENTITY_ID = 'activities:attendance_policy'

function integer(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN
  return Number.isFinite(parsed) ? parsed : null
}

export function attendancePolicyListItem(row: Row) {
  return {
    id: String(row.id),
    scope: text(row.scope),
    groupId: text(row.group_id),
    activityType: text(row.activity_type),
    minorDeclarationMode: text(row.minor_declaration_mode),
    confirmTimeoutHours: integer(row.confirm_timeout_hours),
    defaultAfterTimeout: text(row.default_after_timeout),
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  }
}

export type AttendancePolicyListItem = ReturnType<typeof attendancePolicyListItem> & { groupName?: string | null }

/** Adds the group name to the `group` policies the scope filter already admitted. */
export async function attachPolicyNames(payload: { items?: unknown[] }, ctx: CrudCtx): Promise<void> {
  const items = (payload.items ?? []) as AttendancePolicyListItem[]
  const scope = trustedScope(ctx)
  const groupIds = items.flatMap((item) => (item.groupId ? [item.groupId] : []))
  if (groupIds.length === 0 || !scope) return
  const names = await nameMaps(ctx.container, scope, { groupIds, sectionIds: [], placeIds: [], personIds: [] })
  for (const item of items) item.groupName = item.groupId ? (names.groups.get(item.groupId) ?? null) : null
}

export const attendancePolicyListItemSchema = z.object({
  id: z.uuid(),
  scope: z.string().nullable(),
  groupId: z.string().nullable(),
  groupName: z.string().nullable().optional(),
  activityType: z.string().nullable(),
  minorDeclarationMode: z.string().nullable(),
  confirmTimeoutHours: z.number().nullable(),
  defaultAfterTimeout: z.string().nullable(),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
})

/** One declaration row as the action routes return it. */
export function attendanceView(row: Attendance) {
  return {
    id: row.id,
    occurrenceId: row.occurrenceId,
    personId: row.personId,
    declared: row.declared,
    declaredByPersonId: row.declaredByPersonId ?? null,
    declaredAt: row.declaredAt?.toISOString() ?? null,
    declarationStatus: row.declarationStatus,
    guardianDecidedAt: row.guardianDecidedAt?.toISOString() ?? null,
    pendingUntil: row.pendingUntil?.toISOString() ?? null,
    source: row.source,
    updatedAt: row.updatedAt.toISOString(),
  }
}

export const attendanceViewSchema = z.object({
  id: z.uuid(),
  occurrenceId: z.uuid(),
  personId: z.uuid(),
  declared: z.enum(DECLARED_VALUES),
  declaredByPersonId: z.string().nullable(),
  declaredAt: z.string().nullable(),
  declarationStatus: z.enum(DECLARATION_STATUSES),
  guardianDecidedAt: z.string().nullable(),
  pendingUntil: z.string().nullable().describe('When a `pending_guardian` declaration takes the policy default'),
  source: z.enum(DECLARATION_SOURCES),
  updatedAt: z.string(),
  actingRole: z.string(),
  created: z.boolean().optional(),
})

const calendarDeclarationSchema = z.object({
  attendanceId: z.uuid(),
  declared: z.enum(DECLARED_VALUES),
  declarationStatus: z.enum(DECLARATION_STATUSES),
  declaredAt: z.string().nullable(),
  pendingUntil: z.string().nullable(),
  guardianDecidedAt: z.string().nullable(),
  updatedAt: z.string(),
})

const calendarPersonSchema = z.object({
  personId: z.uuid(),
  firstName: z.string(),
  lastName: z.string(),
  declaration: calendarDeclarationSchema.nullable(),
  canDeclare: z.boolean(),
  needsGuardianConfirmation: z.boolean(),
  guardianOnly: z.boolean(),
})

export const calendarEntrySchema = z.object({
  occurrence: occurrenceListItemSchema.omit({ createdAt: true }).extend({
    sectionName: z.string().nullable(),
    placeAddress: z.string().nullable(),
    placeGeoLat: z.number().nullable(),
    placeGeoLng: z.number().nullable(),
    updatedAt: z.string(),
  }),
  declarationKind: z.enum(DECLARATION_KINDS).describe('The club setting for the activity type (D-026)'),
  declarationsOpen: z.boolean().describe('False once the session started, was cancelled or is done'),
  persons: z.array(calendarPersonSchema).describe('The caller (as=self) or the concerned wards (as=guardian)'),
  summary: z
    .object({
      kind: z.enum(DECLARATION_KINDS),
      expected: z.number(),
      absent: z.number(),
      confirmed: z.number(),
      declined: z.number(),
      unanswered: z.number(),
    })
    .optional()
    .describe('Staff perspectives only'),
  calledUpChildren: z
    .array(z.object({ personId: z.uuid(), firstName: z.string(), lastName: z.string() }))
    .optional()
    .describe('as=guardian under show_called_up_children = consented: other children whose guardian consented'),
})
