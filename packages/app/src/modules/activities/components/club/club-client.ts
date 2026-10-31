// Client pieces of the `activities` member pages (club spec UI rows `/club`, `/club/calendar`,
// `/club/occurrences/[id]`, `/club/occurrences/[id]/attendance`; REQ-006, REQ-007; #32, #33): the member profile read from `GET /api/people/me` (an HTTP read —
// `activities` never imports `people`; the query key and shape are the ones `people`'s member pages use, so both
// share one cache entry), the calendar queries, the declaration and decision writes, the coach's attendance list and
// its save, and the mapping of calendar
// entries to the shared `CalendarItem` (foundation II P-23). Authorization stays on the routes and commands.
import { useQuery } from '@tanstack/react-query'
import { apiCall, apiCallOrThrow, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import type { CalendarBadgeTone, CalendarItem, CalendarItemAction, CalendarItemBadge } from '@vereino/core'
import type { useT } from '@open-mercato/shared/lib/i18n/context'

export type Translate = ReturnType<typeof useT>

export const CLUB_HOME_HREF = '/club'
export const CLUB_CALENDAR_HREF = '/club/calendar'
export const CLUB_PROFILE_HREF = '/club/profile'
export const BACKEND_HREF = '/backend'

/** The perspectives a member page reads the calendar in (`GET /api/activities/calendar?as=`). */
export type MemberPerspective = 'self' | 'guardian' | 'coach'

export function sessionHref(id: string, as: 'self' | 'guardian', personId?: string | null): string {
  const params = new URLSearchParams({ as })
  if (personId) params.set('personId', personId)
  return `/club/occurrences/${encodeURIComponent(id)}?${params.toString()}`
}

/** The coach's attendance list of a session (#33). */
export function attendanceHref(id: string): string {
  return `/club/occurrences/${encodeURIComponent(id)}/attendance`
}

// --- The member profile (`GET /api/people/me`) ---

export type ClubProfile = {
  person: { id: string; firstName: string; lastName: string }
  wards: { personId: string; firstName: string; lastName: string }[]
  contexts: string[]
  /** The member's resolved interface locale (DD-34). */
  locale: string
  club: { shortName: string | null; defaultLocale: string; timezone: string; logoUrl: string | null }
}

export type ClubProfileLoad = { status: 'ok'; profile: ClubProfile } | { status: 'not_linked' }

/** The query key of `people`'s member pages: the same entry, the same `{ status, profile }` shape. */
export const MEMBER_PROFILE_QUERY_KEY = ['people-me'] as const

class ClubProfileLoadError extends Error {}

export function useClubProfile() {
  return useQuery({
    queryKey: MEMBER_PROFILE_QUERY_KEY,
    queryFn: async (): Promise<ClubProfileLoad> => {
      const call = await apiCall<ClubProfile>('/api/people/me')
      if (call.status === 404) return { status: 'not_linked' }
      if (!call.ok || !call.result) throw new ClubProfileLoadError(String(call.status))
      return { status: 'ok', profile: call.result }
    },
  })
}

/** Contexts that work in the admin panel: the "Admin panel" link is shown for them (the panel authorizes itself). */
const STAFF_CONTEXTS = ['club_admin', 'coordinator', 'coach']

export function hasStaffContext(profile: ClubProfile): boolean {
  return profile.contexts.some((context) => STAFF_CONTEXTS.includes(context))
}

/** The perspectives the member offers, the guardian's first (one calendar of every ward, D21). */
export function perspectivesOf(profile: ClubProfile): MemberPerspective[] {
  const perspectives: MemberPerspective[] = []
  if (profile.wards.length > 0) perspectives.push('guardian')
  perspectives.push('self')
  if (profile.contexts.includes('coach')) perspectives.push('coach')
  return perspectives
}

// --- Calendar entries (`GET /api/activities/calendar`) ---

export type DeclaredValue = 'yes' | 'no' | 'unknown'
export type DeclarationStatus = 'final' | 'pending_guardian' | 'rejected_by_guardian'
export type DeclarationKind = 'absence_only' | 'confirm'

export type CalendarDeclaration = {
  attendanceId: string
  declared: DeclaredValue
  declarationStatus: DeclarationStatus
  declaredAt: string | null
  pendingUntil: string | null
  guardianDecidedAt: string | null
  updatedAt: string
}

export type CalendarPerson = {
  personId: string
  firstName: string
  lastName: string
  declaration: CalendarDeclaration | null
  canDeclare: boolean
  needsGuardianConfirmation: boolean
  guardianOnly: boolean
}

export type CalendarOccurrence = {
  id: string
  activityId: string
  activityName: string | null
  activityType: string | null
  groupId: string
  groupName: string | null
  sectionId: string
  sectionName: string | null
  occurrenceDate: string
  startAt: string
  endAt: string
  placeId: string
  placeName: string | null
  placeAddress: string | null
  placeGeoLat: number | null
  placeGeoLng: number | null
  coachPersonId: string | null
  coachName: string | null
  status: 'planned' | 'done' | 'cancelled'
  cancelReason: string | null
  isDetached: boolean
  needsReschedule: boolean
  updatedAt: string
}

export type CalendarSummary = {
  kind: DeclarationKind
  expected: number
  absent: number
  confirmed: number
  declined: number
  unanswered: number
}

export type CalendarEntry = {
  occurrence: CalendarOccurrence
  declarationKind: DeclarationKind
  declarationsOpen: boolean
  persons: CalendarPerson[]
  summary?: CalendarSummary
  calledUpChildren?: { personId: string; firstName: string; lastName: string }[]
}

export type CalendarResponse = { items: CalendarEntry[]; timeZone: string; from: string; to: string }

export type CalendarQuery = { as: MemberPerspective; from: string; to: string; personId?: string | null }

class CalendarLoadError extends Error {}

export const CALENDAR_QUERY_KEY = 'activities-member-calendar'

export function calendarUrl(query: CalendarQuery): string {
  const params = new URLSearchParams({ as: query.as, from: query.from, to: query.to })
  if (query.personId) params.set('personId', query.personId)
  return `/api/activities/calendar?${params.toString()}`
}

export function useMemberCalendar(query: CalendarQuery | null) {
  return useQuery({
    queryKey: [CALENDAR_QUERY_KEY, query?.as, query?.from, query?.to, query?.personId ?? null],
    enabled: query !== null,
    queryFn: async (): Promise<CalendarResponse> => {
      const call = await apiCall<CalendarResponse>(calendarUrl(query as CalendarQuery))
      if (!call.ok || !call.result) throw new CalendarLoadError(String(call.status))
      return call.result
    },
  })
}

export type SessionLoad = { status: 'ok'; entry: CalendarEntry & { timeZone: string } } | { status: 'not_found' }

export const SESSION_QUERY_KEY = 'activities-member-session'

export function useMemberSession(id: string, as: 'self' | 'guardian', personId: string | null) {
  return useQuery({
    queryKey: [SESSION_QUERY_KEY, id, as, personId],
    queryFn: async (): Promise<SessionLoad> => {
      const params = new URLSearchParams({ as })
      if (personId) params.set('personId', personId)
      const call = await apiCall<CalendarEntry & { timeZone: string }>(
        `/api/activities/calendar/${encodeURIComponent(id)}?${params.toString()}`,
      )
      if (call.status === 404 || call.status === 403) return { status: 'not_found' }
      if (!call.ok || !call.result) throw new CalendarLoadError(String(call.status))
      return { status: 'ok', entry: call.result }
    },
  })
}

// --- The coach's attendance list (`GET`, `PUT /api/activities/occurrences/{id}/attendance`, #33) ---

export type ActualValue = 'present' | 'absent' | 'late'
export const ACTUAL_VALUES: readonly ActualValue[] = ['present', 'absent', 'late']
export type Expectation = 'expected' | 'absent' | 'confirmed' | 'declined' | 'unanswered'
export type CheckOffWindow = 'open' | 'not_started' | 'not_planned'

export type AttendanceRow = {
  personId: string
  firstName: string | null
  lastName: string | null
  onRoster: boolean
  declared: DeclaredValue | null
  declarationStatus: DeclarationStatus | null
  expectation: Expectation
  actual: ActualValue | null
  markedByPersonId: string | null
  markedByName: string | null
  markedAsRole: string | null
}

export type AttendanceList = {
  occurrence: CalendarOccurrence
  declarationKind: DeclarationKind
  summary: CalendarSummary
  checkOff: CheckOffWindow
  actingRole: string
  timeZone: string
  rows: AttendanceRow[]
}

export type AttendanceListLoad =
  { status: 'ok'; list: AttendanceList } | { status: 'not_found' } | { status: 'forbidden' }

export const ATTENDANCE_LIST_QUERY_KEY = 'activities-attendance-list'

class AttendanceListLoadError extends Error {}

function attendanceUrl(id: string): string {
  return `/api/activities/occurrences/${encodeURIComponent(id)}/attendance`
}

export function useAttendanceList(id: string) {
  return useQuery({
    queryKey: [ATTENDANCE_LIST_QUERY_KEY, id],
    queryFn: async (): Promise<AttendanceListLoad> => {
      const call = await apiCall<AttendanceList>(attendanceUrl(id))
      if (call.status === 404) return { status: 'not_found' }
      if (call.status === 403) return { status: 'forbidden' }
      if (!call.ok || !call.result) throw new AttendanceListLoadError(String(call.status))
      return { status: 'ok', list: call.result }
    },
  })
}

/**
 * Saves the changed marks (and optionally closes the session) against the session version the page showed
 * (`lockToken` = the session's `updatedAt`): a save by another coach meanwhile answers 409.
 */
export async function saveAttendance(
  id: string,
  input: { entries: { personId: string; actual: ActualValue | null }[]; complete?: boolean },
  errorMessage: string,
  lockToken: string,
): Promise<void> {
  await withScopedApiRequestHeaders(buildOptimisticLockHeader(lockToken), () =>
    apiCallOrThrow(
      attendanceUrl(id),
      { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) },
      { errorMessage },
    ),
  )
}

/** The summary line of the coach's list per the kind (club spec AC-007). */
export function summaryLine(t: Translate, summary: CalendarSummary): string {
  return summary.kind === 'absence_only'
    ? t('activities.club.attendance.summaryAbsenceOnly', { expected: summary.expected, absent: summary.absent })
    : t('activities.club.attendance.summaryConfirm', {
        confirmed: summary.confirmed,
        declined: summary.declined,
        unanswered: summary.unanswered,
      })
}

// --- Writes ---

/**
 * Declares for one person; `lockToken` is the declaration's `updatedAt` the page showed (null for a first answer), so a
 * change made meanwhile by the ward or another guardian answers 409 instead of being overwritten.
 */
export async function declareAttendance(
  input: { occurrenceId: string; personId: string; declared: DeclaredValue },
  errorMessage: string,
  lockToken: string | null,
): Promise<void> {
  await withScopedApiRequestHeaders(buildOptimisticLockHeader(lockToken), () =>
    apiCallOrThrow(
      '/api/activities/attendance/declare',
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) },
      { errorMessage },
    ),
  )
}

/** Decides on the pending declaration the guardian saw (`lockToken` = its `updatedAt`; a re-declaration → 409). */
export async function decideDeclaration(
  attendanceId: string,
  approve: boolean,
  errorMessage: string,
  lockToken: string,
): Promise<void> {
  await withScopedApiRequestHeaders(buildOptimisticLockHeader(lockToken), () =>
    apiCallOrThrow(
      `/api/activities/attendance/${encodeURIComponent(attendanceId)}/guardian-decision`,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ approve }) },
      { errorMessage },
    ),
  )
}

export function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

// --- Labels and the mapping to `CalendarItem` ---

export function fullName(person: { firstName: string; lastName: string }): string {
  return `${person.firstName} ${person.lastName}`.trim()
}

/** The declaration that counts on the member side: the person's own row (a pending one shows as pending). */
export function declarationState(
  kind: DeclarationKind,
  declaration: CalendarDeclaration | null,
): { key: string; tone: CalendarBadgeTone } {
  if (declaration?.declarationStatus === 'pending_guardian') return { key: 'pending', tone: 'info' }
  if (declaration?.declarationStatus === 'rejected_by_guardian') return { key: 'rejected', tone: 'neutral' }
  const declared = declaration?.declared ?? 'unknown'
  if (kind === 'absence_only') {
    return declared === 'no' ? { key: 'absent', tone: 'warning' } : { key: 'expected', tone: 'neutral' }
  }
  if (declared === 'yes') return { key: 'attending', tone: 'success' }
  if (declared === 'no') return { key: 'notAttending', tone: 'warning' }
  return { key: 'noAnswer', tone: 'neutral' }
}

export function declarationLabel(t: Translate, kind: DeclarationKind, declaration: CalendarDeclaration | null): string {
  return t(`activities.club.declaration.${declarationState(kind, declaration).key}`)
}

/** The choices a person has for a session: "Report absence" (or withdraw it), or "Attending" / "Not attending". */
export function declarationChoices(
  kind: DeclarationKind,
  declaration: CalendarDeclaration | null,
): { declared: DeclaredValue; key: string; tone: CalendarItemAction['tone'] }[] {
  const current = declaration?.declarationStatus === 'final' ? declaration.declared : null
  if (kind === 'absence_only') {
    return current === 'no'
      ? [{ declared: 'unknown', key: 'withdrawAbsence', tone: 'default' }]
      : [{ declared: 'no', key: 'reportAbsence', tone: 'default' }]
  }
  return [
    { declared: 'yes', key: 'attending', tone: 'primary' },
    { declared: 'no', key: 'notAttending', tone: 'default' },
  ]
}

export const ACTION_SEPARATOR = '|'

export function actionId(personId: string, declared: DeclaredValue): string {
  return `${personId}${ACTION_SEPARATOR}${declared}`
}

export function parseActionId(id: string): { personId: string; declared: DeclaredValue } | null {
  const [personId, declared] = id.split(ACTION_SEPARATOR)
  if (!personId || (declared !== 'yes' && declared !== 'no' && declared !== 'unknown')) return null
  return { personId, declared }
}

/** One calendar entry as the shared list shows it (title, place, persons, statuses, declaration actions). */
export function toCalendarItem(entry: CalendarEntry, as: MemberPerspective, t: Translate): CalendarItem {
  const { occurrence } = entry
  const many = entry.persons.length > 1
  const badges: CalendarItemBadge[] = entry.persons.map((person) => {
    const state = declarationState(entry.declarationKind, person.declaration)
    const label = declarationLabel(t, entry.declarationKind, person.declaration)
    return {
      id: person.personId,
      label: many || as === 'guardian' ? `${person.firstName}: ${label}` : label,
      tone: state.tone,
    }
  })
  if (as === 'coach' && entry.summary)
    badges.push({ id: 'summary', label: summaryLine(t, entry.summary), tone: 'neutral' })
  if (occurrence.isDetached) badges.push({ id: 'moved', label: t('activities.occurrences.flags.moved'), tone: 'info' })
  const actions: CalendarItemAction[] = []
  if (entry.declarationsOpen && as !== 'coach') {
    for (const person of entry.persons) {
      if (!person.canDeclare) continue
      for (const choice of declarationChoices(entry.declarationKind, person.declaration)) {
        const label = t(`activities.club.actions.${choice.key}`)
        const current =
          person.declaration?.declarationStatus === 'final' && person.declaration.declared === choice.declared
        actions.push({
          id: actionId(person.personId, choice.declared),
          label: many || as === 'guardian' ? `${label} — ${person.firstName}` : label,
          tone: choice.tone,
          disabled: current,
        })
      }
    }
  }
  const title = [occurrence.activityName, occurrence.groupName].filter(Boolean).join(' · ')
  const subtitle =
    as === 'guardian' ? entry.persons.map((person) => person.firstName).join(', ') : (occurrence.sectionName ?? null)
  return {
    id: occurrence.id,
    title: title || t('activities.club.session.untitled'),
    startsAt: new Date(occurrence.startAt),
    endsAt: new Date(occurrence.endAt),
    status: occurrence.status,
    place: occurrence.placeName,
    placeAddress: occurrence.placeAddress,
    group: occurrence.sectionName,
    subtitle,
    href: as === 'coach' ? attendanceHref(occurrence.id) : sessionHref(occurrence.id, as),
    badges,
    actions,
  }
}

/** An OpenStreetMap link for a place with coordinates (D21: "an address without a map pin cost 30 minutes"). */
export function mapHref(lat: number | null, lng: number | null): string | null {
  if (lat === null || lng === null) return null
  return `https://www.openstreetmap.org/?mlat=${String(lat)}&mlon=${String(lng)}#map=17/${String(lat)}/${String(lng)}`
}
