// Client-side helpers shared by the `activities` backend pages: row types as the API returns them, links, option
// loaders for the selectors, wall-time and date formatting, the schedule summary of a rule and the reading of coded API
// errors (the 409 conflict list, the 422 codes mapped to form fields). Authorization stays on the routes and commands.
import type { DataTableProps } from '@open-mercato/ui/backend/DataTable'
import type { CrudFieldOption } from '@open-mercato/ui/backend/CrudForm'
import type { StatusBadgeVariant } from '@open-mercato/ui/primitives/status-badge'
import { fetchCrudList } from '@open-mercato/ui/backend/utils/crud'
import { readApiResultOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import type { useT } from '@open-mercato/shared/lib/i18n/context'
import { Recurrence, WEEKDAYS, type Weekday } from '@vereino/core'

export type Translate = ReturnType<typeof useT>

/**
 * The request init for a read whose page renders its own 403 state ("denied", "not your session"): without it the
 * platform `apiFetch` throws `ForbiddenError` on every 403 before the caller's `status === 403` branch runs (lesson
 * `apifetch-403-throws-before-page-branch`).
 */
export const OWN_FORBIDDEN_STATE: RequestInit = { headers: { 'x-om-forbidden-redirect': '0' } }

/** The column definitions `DataTable` takes for rows of type `T`. */
export type TableColumns<T extends object> = DataTableProps<T>['columns']

export const ACTIVITIES_HREF = '/backend/activities/activities'
export const OCCURRENCES_HREF = '/backend/activities/occurrences'
export const EVENTS_CREATE_HREF = '/backend/activities/events/create'

export const activityHref = (id: string) => `${ACTIVITIES_HREF}/${encodeURIComponent(id)}`
export const occurrenceHref = (id: string) => `${OCCURRENCES_HREF}/${encodeURIComponent(id)}`

export type ActivityRow = {
  id: string
  sectionId: string | null
  sectionName?: string | null
  groupId: string | null
  groupName?: string | null
  name: string | null
  type: string | null
  placeId: string | null
  placeName?: string | null
  coachPersonId: string | null
  coachName?: string | null
  opponentExternalTeamId: string | null
  invitedExternalTeamIds: string[]
  recurrenceRule: string | null
  startsOn: string | null
  endsOn: string | null
  startTime: string | null
  endTime: string | null
  generatedUntil: string | null
  description: string | null
  isActive: boolean
  createdAt: string | null
  updatedAt: string | null
}

/** `GET /api/activities/activities/{id}`: the activity with the role the caller reads it as. */
export type ActivityDetail = ActivityRow & { actingRole: string }

export type OccurrenceRow = {
  id: string
  activityId: string | null
  activityName?: string | null
  activityType?: string | null
  groupId: string | null
  groupName?: string | null
  sectionId: string | null
  occurrenceDate: string | null
  startAt: string | null
  endAt: string | null
  placeId: string | null
  placeName?: string | null
  coachPersonId: string | null
  coachName?: string | null
  status: string | null
  cancelReason: string | null
  isDetached: boolean
  needsReschedule: boolean
  createdAt: string | null
  updatedAt: string | null
}

/** `GET /api/activities/occurrences/{id}`. */
export type OccurrenceDetail = OccurrenceRow & {
  sectionName: string | null
  activityRecurring: boolean
  actingRole: string
}

/** One entry of the 409 `conflicts` list and of a preview item's `conflicts`. */
export type ScheduleConflict = {
  key: string
  startAt: string
  endAt: string
  kind: 'place' | 'coach'
  sessions: Array<{
    id: string
    activityId: string
    activityName: string | null
    groupId: string
    placeId: string
    startAt: string
    endAt: string
  }>
  blocks: Array<{ id: string; reason: string; startAt: string; endAt: string }>
}

export type PreviewItem = {
  date: string
  startAt: string
  endAt: string
  existingId: string | null
  conflicts: ScheduleConflict[]
}

/** `POST /api/activities/activities/preview`. */
export type PreviewResult = {
  items: PreviewItem[]
  total: number
  conflictCount: number
  generatedUntil: string | null
  horizonEnd: string
  providerFailed: boolean
}

type GroupOptionRow = { id: string; name: string | null; isActive?: boolean }
type NamedRow = { id: string; name: string | null }
type PlaceOptionRow = { id: string; name: string; parentName: string | null; isLeaf: boolean }
type ExternalTeamOptionRow = { id: string; name: string | null; clubName: string | null }
type PersonOptionRow = { id: string; firstName: string | null; lastName: string | null; birthDate: string | null }

/** A trimmed text field value, or null when blank (explicit clearing, S6.3). */
export function textOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

export function personName(person: { firstName?: string | null; lastName?: string | null } | null | undefined): string {
  return [person?.firstName, person?.lastName].filter(Boolean).join(' ')
}

const pad = (value: number) => String(value).padStart(2, '0')

/** Today's local calendar date (`YYYY-MM-DD`), the default first day the forms propose. */
export function localToday(): string {
  return localDateOf(new Date())
}

function localDateOf(date: Date): string {
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function parseInstant(iso: string | null | undefined): Date | null {
  if (!iso) return null
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? null : date
}

/** The local calendar date of an instant (`YYYY-MM-DD`), or '' when there is none. */
export function instantDate(iso: string | null | undefined): string {
  const date = parseInstant(iso)
  return date ? localDateOf(date) : ''
}

/** The local 24-hour wall time of an instant (`HH:mm`), or '' when there is none. */
export function instantTime(iso: string | null | undefined): string {
  const date = parseInstant(iso)
  return date ? `${pad(date.getHours())}:${pad(date.getMinutes())}` : ''
}

/** A local date and wall time as an ISO instant with offset, or null when either is missing or invalid. */
export function toInstant(date: unknown, time: unknown): string | null {
  if (typeof date !== 'string' || typeof time !== 'string') return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null
  const value = new Date(`${date}T${time}:00`)
  return Number.isNaN(value.getTime()) ? null : value.toISOString()
}

/** The weekday of a calendar date (`YYYY-MM-DD`), as an RFC 5545 code. */
export function weekdayOfDate(date: string): Weekday | null {
  const parsed = new Date(`${date}T12:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return null
  return WEEKDAYS[(parsed.getUTCDay() + 6) % 7] ?? null
}

/** "Tue 2027-01-05" — the slot date with its short weekday name. */
export function dateLabel(t: Translate, date: string | null | undefined): string {
  if (!date) return t('activities.common.empty')
  const day = weekdayOfDate(date)
  return day ? `${t(`activities.weekdays.short.${day}`)} ${date}` : date
}

/** "17:00–18:30" from two instants. */
export function timeRangeOfInstants(startAt: string | null | undefined, endAt: string | null | undefined): string {
  const start = instantTime(startAt)
  const end = instantTime(endAt)
  return start && end ? `${start}–${end}` : start || end
}

export function typeLabel(t: Translate, type: string | null | undefined): string {
  return type ? t(`activities.types.${type}`) : t('activities.common.empty')
}

export function statusLabel(t: Translate, status: string | null | undefined): string {
  return status ? t(`activities.occurrences.status.${status}`) : t('activities.common.empty')
}

const STATUS_VARIANTS: Record<string, StatusBadgeVariant> = {
  planned: 'info',
  done: 'success',
  cancelled: 'error',
}

export function statusVariant(status: string | null | undefined): StatusBadgeVariant {
  return (status ? STATUS_VARIANTS[status] : undefined) ?? 'neutral'
}

/**
 * The schedule of an activity in one line: "Tue, Thu 17:00–18:30", "every 2 weeks: Tue 17:00–18:30" or
 * "One-off 2027-01-05, 17:00–18:30". A rule the client cannot read is shown as "Custom rule".
 */
export function scheduleSummary(
  t: Translate,
  row: Pick<ActivityRow, 'recurrenceRule' | 'startsOn' | 'startTime' | 'endTime'>,
): string {
  const times = row.startTime && row.endTime ? `${row.startTime}–${row.endTime}` : ''
  if (!row.recurrenceRule) {
    return t('activities.schedule.oneOff', { date: row.startsOn ?? '', time: times })
  }
  const parsed = Recurrence.parse(row.recurrenceRule)
  if (!parsed.ok) return t('activities.schedule.custom')
  const days = parsed.value.byDay.map((day) => t(`activities.weekdays.short.${day}`)).join(', ')
  return parsed.value.interval > 1
    ? t('activities.schedule.everyNWeeks', { n: parsed.value.interval, days, time: times })
    : t('activities.schedule.weekly', { days, time: times })
}

// --- Option sources ---

/** The groups of the caller's scope (`GET /api/groups/groups`), active ones only for a new activity. */
export async function groupOptions(activeOnly: boolean): Promise<CrudFieldOption[]> {
  const data = await fetchCrudList<GroupOptionRow>('groups/groups', {
    pageSize: 100,
    sortField: 'name',
    sortDir: 'asc',
    ...(activeOnly ? { isActive: 'true' } : {}),
  })
  return data.items.map((item) => ({ value: item.id, label: item.name ?? item.id }))
}

export async function sectionOptions(): Promise<CrudFieldOption[]> {
  const data = await fetchCrudList<NamedRow>('club_core/sections', { pageSize: 100, sortField: 'name', sortDir: 'asc' })
  return data.items.map((item) => ({ value: item.id, label: item.name ?? item.id }))
}

/** Bookable places only (sessions point to a leaf), labelled "Parent › Name". */
export async function placeOptions(): Promise<CrudFieldOption[]> {
  const data = await readApiResultOrThrow<{ items?: PlaceOptionRow[] }>('/api/club_core/options/places')
  return (data.items ?? [])
    .filter((item) => item.isLeaf)
    .map((item) => ({ value: item.id, label: item.parentName ? `${item.parentName} › ${item.name}` : item.name }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

export async function externalTeamOptions(): Promise<CrudFieldOption[]> {
  const data = await fetchCrudList<ExternalTeamOptionRow>('groups/external-teams', {
    pageSize: 100,
    sortField: 'name',
    sortDir: 'asc',
  })
  return data.items.map((item) => ({
    value: item.id,
    label: item.clubName ? `${item.name ?? item.id} (${item.clubName})` : (item.name ?? item.id),
  }))
}

/** The person picker of the coach field: the same source as the groups roster picker (search by last name). */
export async function personOptions(query?: string): Promise<CrudFieldOption[]> {
  const params = new URLSearchParams({ pageSize: '50' })
  if (query?.trim()) params.set('lastName', query.trim())
  const data = await readApiResultOrThrow<{ items?: PersonOptionRow[] }>(`/api/people/persons?${params.toString()}`)
  return (data.items ?? []).map((person) => ({ value: person.id, label: personName(person) || person.id }))
}

/** An option loader that answers an empty list when the source is not readable (the field then shows no options). */
export function tolerant(load: () => Promise<CrudFieldOption[]>): () => Promise<CrudFieldOption[]> {
  return async () => {
    try {
      return await load()
    } catch {
      return []
    }
  }
}

// --- Coded API errors ---

type CodedError = { status?: unknown; code?: unknown; conflicts?: unknown; field?: unknown }

export function errorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null
  const code = (error as CodedError).code
  return typeof code === 'string' ? code : null
}

export function errorStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null
  const status = (error as CodedError).status
  return typeof status === 'number' ? status : null
}

/** The `conflicts` list of a 409 `occurrence_place_conflict` / `occurrence_coach_conflict`, or null. */
export function scheduleConflictsOf(error: unknown): ScheduleConflict[] | null {
  const code = errorCode(error)
  if (code !== 'occurrence_place_conflict' && code !== 'occurrence_coach_conflict') return null
  const conflicts = (error as CodedError).conflicts
  return Array.isArray(conflicts) ? (conflicts as ScheduleConflict[]) : []
}

const FIELD_OF_CODE = new Map<string, string>([
  ['recurrence_unsupported', 'recurrence'],
  ['recurrence_invalid', 'recurrence'],
  ['activity_no_sessions', 'recurrence'],
  ['activity_times_inverted', 'endTime'],
  ['activity_dates_inverted', 'endsOn'],
  ['activity_type_requires_team', 'type'],
  ['event_type_not_allowed', 'type'],
  ['activity_group_inactive', 'groupId'],
  ['place_not_bookable', 'placeId'],
])

/** The `field` an `activities_reference_invalid` names, as a form field id. */
const REFERENCE_FIELDS = new Map<string, string>([
  ['groupId', 'groupId'],
  ['placeId', 'placeId'],
  ['coachPersonId', 'coachPersonId'],
  ['externalTeamIds', 'invitedExternalTeamIds'],
])

/** The form field a coded 422 belongs to, so the form shows the message next to it; null when none. */
export function fieldOfError(error: unknown): string | null {
  const code = errorCode(error)
  if (!code) return null
  if (code === 'activities_reference_invalid') {
    const field = (error as CodedError).field
    return typeof field === 'string' ? (REFERENCE_FIELDS.get(field) ?? null) : null
  }
  return FIELD_OF_CODE.get(code) ?? null
}

// --- Declaration policies (#32) ---

export const POLICIES_HREF = '/backend/activities/policies'
export const CLUB_SETTINGS_HREF = '/backend/club/settings'

export const policyEditHref = (id: string) => `${POLICIES_HREF}/${encodeURIComponent(id)}/edit`

/** One row of `GET /api/activities/attendance-policies`. */
export type PolicyRow = {
  id: string
  scope: string | null
  groupId: string | null
  groupName?: string | null
  activityType: string | null
  minorDeclarationMode: string | null
  confirmTimeoutHours: number | null
  defaultAfterTimeout: string | null
  createdAt: string | null
  updatedAt: string | null
}

/** "Club", "Group: U-12", "Away trip" or "Activity type: Match". */
export function policyScopeLabel(t: Translate, row: Pick<PolicyRow, 'scope' | 'groupName' | 'activityType'>): string {
  if (row.scope === 'group') {
    return t('activities.policies.scope.group.label', { name: row.groupName ?? t('activities.common.empty') })
  }
  if (row.scope === 'activity_type') {
    return t('activities.policies.scope.activity_type.label', { type: typeLabel(t, row.activityType) })
  }
  if (row.scope === 'club' || row.scope === 'away_trip') return t(`activities.policies.scope.${row.scope}`)
  return t('activities.common.empty')
}

export function declarationModeLabel(t: Translate, mode: string | null | undefined): string {
  return mode ? t(`activities.policies.mode.${mode}`) : t('activities.common.empty')
}

export function timeoutDefaultLabel(t: Translate, value: string | null | undefined): string {
  return value ? t(`activities.policies.afterTimeout.${value}`) : t('activities.common.empty')
}

const POLICY_FIELD_OF_CODE = new Map<string, string>([
  ['attendance_policy_duplicate', 'scope'],
  ['attendance_policy_scope_invalid', 'scope'],
])

/** The policy form field a coded 409/422 belongs to (an unknown group lands on `groupId` through `fieldOfError`). */
export function policyFieldOfError(error: unknown): string | null {
  const code = errorCode(error)
  return (code ? POLICY_FIELD_OF_CODE.get(code) : undefined) ?? fieldOfError(error)
}
