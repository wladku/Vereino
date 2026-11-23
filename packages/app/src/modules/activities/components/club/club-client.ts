// Client pieces of the `activities` member pages (club spec UI rows `/club`, `/club/calendar`,
// `/club/occurrences/[id]`, `/club/occurrences/[id]/attendance`; REQ-006, REQ-007; #32, #33): the member profile read from `GET /api/people/me` (an HTTP read —
// `activities` never imports `people`; the query key and shape are the ones `people`'s member pages use, so both
// share one cache entry), the calendar queries, the declaration and decision writes, the coach's attendance list and
// its save, and the mapping of calendar
// entries to the shared `CalendarItem` (foundation II P-23). Authorization stays on the routes and commands. E10-S08
// (#273, REQ-A10): the section coordinator's perspective — the section calendar, the view lists and the Today counts
// read from the sessions list `GET /api/activities/occurrences`, and the coordinator's sections from `club_core`'s
// `GET /api/club_core/sections` (an HTTP read; `activities` never imports `club_core`).
import { useQuery } from '@tanstack/react-query'
import { apiCall, apiCallOrThrow, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { OWN_FORBIDDEN_STATE } from '../client-helpers'
import { calendarRangeRetry } from '../../lib/member-calendar'
import { coachBadge } from '../../lib/occurrence-list'
import { sectionSessionsUrl, type SectionListView } from '../../lib/coordinator-sessions'
import { cardMapHref } from '../../lib/venue'
import type {
  CalendarBadgeTone,
  CalendarItem,
  CalendarItemAction,
  CalendarItemBadge,
  CalendarItemLink,
  CalendarItemNote,
} from '@vereino/core'
import type { useT } from '@open-mercato/shared/lib/i18n/context'

export type Translate = ReturnType<typeof useT>

/** The member paths come from the one navigation definition of `@vereino/ui` (E06-S19 #101). */
export { BACKEND_HREF, CLUB_CALENDAR_HREF } from '@vereino/ui'

/** The perspectives a member page reads the calendar in (`GET /api/activities/calendar?as=`). */
export type MemberPerspective = 'self' | 'guardian' | 'coach' | 'coordinator'

/** The perspectives of the session page `/club/occurrences/[id]` (the coach's: E06-S15 #97; the coordinator's: #273). */
export type SessionPerspective = 'self' | 'guardian' | 'coach' | 'coordinator'

/** The staff perspectives: the session is read with its declaration summary and what the caller may do. */
export function isStaffPerspective(as: MemberPerspective): as is 'coach' | 'coordinator' {
  return as === 'coach' || as === 'coordinator'
}

export function sessionHref(id: string, as: SessionPerspective, personId?: string | null): string {
  const params = new URLSearchParams({ as })
  if (personId) params.set('personId', personId)
  return `/club/occurrences/${encodeURIComponent(id)}?${params.toString()}`
}

/**
 * The phone form that edits one session (`/club/occurrences/[id]/edit`, REQ-A08, #270); the coordinator's carries
 * `?as=coordinator` (#273), so the form reads the session and returns to it in that perspective.
 */
export function sessionEditHref(id: string, as: 'coach' | 'coordinator' = 'coach'): string {
  const path = `/club/occurrences/${encodeURIComponent(id)}/edit`
  return as === 'coordinator' ? `${path}?as=coordinator` : path
}

/**
 * The coach's "New event" form (#140); a caller may propose the date, the place or the group (the facility calendar's
 * "Book for group" of phase 5 opens it with a slot).
 */
export function newEventHref(proposed: { date?: string; placeId?: string; groupId?: string } = {}): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(proposed)) if (value) params.set(key, value)
  const query = params.toString()
  return query ? `/club/events/new?${query}` : '/club/events/new'
}

/**
 * "Message the group" (REQ-A13): the member inbox opening its composer addressed to the session's audience. The query
 * is `communication`'s URL contract (`composePreset`); `activities` never imports `communication`.
 */
export function composeForSessionHref(id: string): string {
  return `/club/messages?compose=${encodeURIComponent(`occurrence:${id}`)}`
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
  club: {
    shortName: string | null
    defaultLocale: string
    timezone: string
    logoUrl: string | null
    /** The club's colour and the text colour on it (#486); null uses the default. */
    accent: { color: string; foreground: '#000000' | '#ffffff' } | null
  }
  /** Whether the person holds `payments.view_own` and is an adult (payments R10): the Payments tab (#258). */
  paymentsVisible: boolean
  /** An active participant membership today: with the wards, the member side of the acting context (spec N). */
  isParticipant?: boolean
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

/** The club event a part session belongs to; `publicPath` is null until the event and the club page are public. */
export type ClubEventRef = { id: string; name: string; publicPath: string | null }

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
  /** The gathering instant before the start (club spec DD-43), or null. */
  gatheringAt: string | null
  /** The declaration deadline (REQ-A07), or null; only a `confirm` session carries one in the member reads. */
  confirmBy?: string | null
  /** True from the deadline until the start: members can no longer declare (DD-A02). */
  deadlinePassed?: boolean
  /** Null at a typed venue (REQ-A08), whose name and address then fill `placeName` and `placeAddress`. */
  placeId: string | null
  /** The typed venue (REQ-A08), or null at a club place. */
  venue?: { name: string; address: string } | null
  placeName: string | null
  placeAddress: string | null
  placeGeoLat: number | null
  placeGeoLng: number | null
  /** A place outside the club's own or a typed venue: the cards link its map (REQ-A13). */
  placeExternal?: boolean
  /** The activity is an away trip (REQ-A15: the club's team is `away` in the score). */
  isAway?: boolean
  /** The recorded score of a match or sparring (REQ-A15), or null. */
  score?: SessionScore | null
  coachPersonId: string | null
  coachName: string | null
  /** The session's own coach when the current coach is a substitute (E06-S13 #95), else null. */
  substituteForPersonId?: string | null
  substituteForName?: string | null
  opponentName: string | null
  invitedTeamNames: string[]
  /** The club event of a part session (club events spec REQ-T03): its name and, once published, its public page. */
  clubEvent?: ClubEventRef | null
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
  /** `as=coach` (#199): false when the club setting `coach_may_cancel` keeps this coach from cancelling. */
  mayCancel?: boolean
  /** `as=coach` (#270, DD-A05): the caller may edit the planned session (a coach: only a one-off event's session). */
  mayEdit?: boolean
  /** `as=coach` (REQ-A14, #272): a coach or assistant of the group may take over the session without a coach. */
  mayTakeOver?: boolean
  /** `as=coach` (REQ-A15): a started match or sparring takes a score. */
  mayScore?: boolean
  /** `as=coach|coordinator` (REQ-A10, #273): the caller may assign a substitute or change the coach. */
  mayAssign?: boolean
  /** `as=coach` (REQ-A13): the substitution history, oldest first. */
  substitutions?: SubstitutionHistoryEntry[]
}

export type SessionScore = { home: number; away: number; note: string | null }

export type SubstitutionHistoryEntry = {
  id: string
  kind: 'absence_reported' | 'substitute_assigned' | 'coach_restored'
  previousCoachName: string | null
  newCoachName: string | null
  decidedByName: string | null
  createdAt: string
}

export type CalendarResponse = { items: CalendarEntry[]; timeZone: string; from: string; to: string }

/** A calendar read as the page shows it: `trimmed` when the API refused the range and the trimmed one was read. */
export type CalendarLoad = CalendarResponse & { trimmed: boolean }

export type CalendarQuery = {
  as: MemberPerspective
  from: string
  to: string
  personId?: string | null
  /** `as=coordinator`: one of the coordinator's sections (#273). */
  sectionId?: string | null
}

class CalendarLoadError extends Error {}

export const CALENDAR_QUERY_KEY = 'activities-member-calendar'

export function calendarUrl(query: CalendarQuery): string {
  const params = new URLSearchParams({ as: query.as, from: query.from, to: query.to })
  if (query.personId) params.set('personId', query.personId)
  if (query.sectionId) params.set('sectionId', query.sectionId)
  return `/api/activities/calendar?${params.toString()}`
}

/**
 * Reads the range; a range the API refuses as longer than 62 days (400 `calendar_range_invalid`, README M-03) is read
 * again trimmed to 62 days from its start instead of failing (E06-S18).
 */
export async function readMemberCalendar(query: CalendarQuery): Promise<CalendarLoad> {
  const call = await apiCall<CalendarResponse & { code?: string }>(calendarUrl(query))
  if (call.ok && call.result) return { ...call.result, trimmed: false }
  const retry = calendarRangeRetry({ from: query.from, to: query.to }, call.status, call.result?.code)
  if (!retry) throw new CalendarLoadError(String(call.status))
  const again = await apiCall<CalendarResponse>(calendarUrl({ ...query, ...retry }))
  if (!again.ok || !again.result) throw new CalendarLoadError(String(again.status))
  return { ...again.result, trimmed: true }
}

export function useMemberCalendar(query: CalendarQuery | null) {
  return useQuery({
    queryKey: [
      CALENDAR_QUERY_KEY,
      query?.as,
      query?.from,
      query?.to,
      query?.personId ?? null,
      query?.sectionId ?? null,
    ],
    enabled: query !== null,
    queryFn: () => readMemberCalendar(query as CalendarQuery),
  })
}

export type SessionLoad =
  { status: 'ok'; entry: CalendarEntry & { timeZone: string } } | { status: 'not_found' } | { status: 'forbidden' }

export const SESSION_QUERY_KEY = 'activities-member-session'

/**
 * One session in a perspective. A member's 403 (a person not theirs) reads as "not found"; the coach's 403 is a
 * session of the club outside their groups — "This is not your session" (E06-S15 #97) — and the coordinator's one
 * outside their sections (#273). `enabled` false skips the read.
 */
export function useMemberSession(id: string, as: SessionPerspective, personId: string | null, enabled = true) {
  return useQuery({
    queryKey: [SESSION_QUERY_KEY, id, as, personId],
    enabled,
    queryFn: async (): Promise<SessionLoad> => {
      const params = new URLSearchParams({ as })
      if (personId) params.set('personId', personId)
      const call = await apiCall<CalendarEntry & { timeZone: string }>(
        `/api/activities/calendar/${encodeURIComponent(id)}?${params.toString()}`,
        OWN_FORBIDDEN_STATE,
      )
      if (call.status === 403 && isStaffPerspective(as)) return { status: 'forbidden' }
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
  /** `confirm`: the participants who have not answered (REQ-A07). */
  unansweredCount?: number
  checkOff: CheckOffWindow
  /** The instant the check-off opens: 30 minutes before the start (DD-A13). */
  checkOffOpensAt: string
  actingRole: string
  /** False when the club setting `coach_may_cancel` keeps the caller from cancelling (#199). */
  mayCancel: boolean
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
      const call = await apiCall<AttendanceList>(attendanceUrl(id), OWN_FORBIDDEN_STATE)
      if (call.status === 404) return { status: 'not_found' }
      if (call.status === 403) return { status: 'forbidden' }
      if (!call.ok || !call.result) throw new AttendanceListLoadError(String(call.status))
      return { status: 'ok', list: call.result }
    },
  })
}

/**
 * Saves the changed marks (and optionally closes the session) against the session version the page showed
 * (`lockToken` = the session's `updatedAt`): a save by another coach meanwhile answers 409. Returns the refreshed list.
 */
export async function saveAttendance(
  id: string,
  input: { entries: { personId: string; actual: ActualValue | null }[]; complete?: boolean },
  errorMessage: string,
  lockToken: string,
): Promise<AttendanceList | null> {
  const call = await withScopedApiRequestHeaders(buildOptimisticLockHeader(lockToken), () =>
    apiCallOrThrow<AttendanceList>(
      attendanceUrl(id),
      { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) },
      { errorMessage },
    ),
  )
  return call.result ?? null
}

// --- The consenting guardians' contacts (`GET /api/activities/occurrences/{id}/guardian-contacts`, #34) ---

export type GuardianContactPerson = { personId: string; firstName: string; lastName: string }

export type GuardianContact = GuardianContactPerson & {
  phone: string | null
  email: string | null
  wards: GuardianContactPerson[]
}

export type GuardianContactsLoad = { status: 'ok'; items: GuardianContact[] } | { status: 'forbidden' }

export const GUARDIAN_CONTACTS_QUERY_KEY = 'activities-guardian-contacts'

class GuardianContactsLoadError extends Error {}

/**
 * The contacts of one session, fetched only once the coach asks for them (`enabled`): every read is recorded, so the
 * page never reads them in the background or retries on its own, and nothing is cached — opening them again is a new,
 * logged read that reflects a withdrawn consent.
 */
export function useGuardianContacts(id: string, enabled: boolean) {
  return useQuery({
    queryKey: [GUARDIAN_CONTACTS_QUERY_KEY, id],
    enabled,
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async (): Promise<GuardianContactsLoad> => {
      const call = await apiCall<{ items: GuardianContact[] }>(
        `/api/activities/occurrences/${encodeURIComponent(id)}/guardian-contacts`,
        OWN_FORBIDDEN_STATE,
      )
      if (call.status === 403) return { status: 'forbidden' }
      if (!call.ok || !call.result) throw new GuardianContactsLoadError(String(call.status))
      return { status: 'ok', items: call.result.items }
    },
  })
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

/**
 * Cancels a session from the member page (E06-S15 #97) against the version the page showed (`lockToken` = the
 * session's `updatedAt`; a change meanwhile answers 409). Returns how many people the cancellation tells.
 */
export async function cancelSession(
  id: string,
  reason: string,
  errorMessage: string,
  lockToken: string,
): Promise<number> {
  const call = await withScopedApiRequestHeaders(buildOptimisticLockHeader(lockToken), () =>
    apiCallOrThrow<{ notified?: number }>(
      `/api/activities/occurrences/${encodeURIComponent(id)}/cancel`,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ reason }) },
      { errorMessage },
    ),
  )
  return call.result?.notified ?? 0
}

/**
 * A coach or assistant of the group takes over the session without a coach (REQ-A14, #272); no version is needed: the
 * server re-reads "no coach" under a row lock and answers 409 `occurrence_has_coach` when someone was faster.
 */
export async function takeOverSession(id: string, errorMessage: string): Promise<void> {
  await apiCallOrThrow(
    `/api/activities/occurrences/${encodeURIComponent(id)}/take-over`,
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' },
    { errorMessage },
  )
}

/** Records (or with both scores null clears) the score of a match or sparring against the session version (REQ-A15). */
export async function saveScore(
  id: string,
  input: { scoreHome: number | null; scoreAway: number | null; note: string | null },
  errorMessage: string,
  lockToken: string,
): Promise<{ score: SessionScore | null; updatedAt: string } | null> {
  const call = await withScopedApiRequestHeaders(buildOptimisticLockHeader(lockToken), () =>
    apiCallOrThrow<{ score: SessionScore | null; updatedAt: string }>(
      `/api/activities/occurrences/${encodeURIComponent(id)}/score`,
      { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) },
      { errorMessage },
    ),
  )
  return call.result ?? null
}

/**
 * The assigned coach reports they cannot run the session (E06-S13 #95), with an optional reason, against the
 * session's lock token.
 */
export async function reportAbsence(
  id: string,
  reason: string,
  errorMessage: string,
  lockToken: string,
): Promise<void> {
  await withScopedApiRequestHeaders(buildOptimisticLockHeader(lockToken), () =>
    apiCallOrThrow(
      `/api/activities/occurrences/${encodeURIComponent(id)}/absence`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() || null }),
      },
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

/**
 * The deadline lines of a session card (REQ-A07, M-02, M-03): "Confirm by {at}" before the deadline, then "Deadline
 * passed {at}" with the hint to write to the coach. Only a planned session that has not started and concerns the
 * viewer (a member perspective with persons) shows them; `formatAt` writes the instant in the club zone.
 */
export function deadlineNotes(
  entry: Pick<CalendarEntry, 'occurrence' | 'declarationsOpen' | 'persons'>,
  as: MemberPerspective,
  t: Translate,
  formatAt: (at: Date) => string,
): CalendarItemNote[] {
  const { occurrence } = entry
  if (isStaffPerspective(as) || !occurrence.confirmBy || !entry.declarationsOpen || entry.persons.length === 0) {
    return []
  }
  const at = formatAt(new Date(occurrence.confirmBy))
  if (!occurrence.deadlinePassed) return [{ id: 'deadline', text: t('activities.deadline.confirmBy', { at }) }]
  return [
    { id: 'deadline', text: t('activities.deadline.passed', { at }), tone: 'warning' },
    {
      id: 'deadline-hint',
      text: t(as === 'self' ? 'activities.deadline.passedHintSelf' : 'activities.deadline.passedHint'),
    },
  ]
}

/**
 * One calendar entry as the shared list shows it (title, section marker, place, coach, persons, statuses, declaration
 * actions). The coach is staff, so naming them shows no other family's data (R15).
 */
export function toCalendarItem(
  entry: CalendarEntry,
  as: MemberPerspective,
  t: Translate,
  formatAt: (at: Date) => string,
): CalendarItem {
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
  if (isStaffPerspective(as) && entry.summary)
    badges.push({ id: 'summary', label: summaryLine(t, entry.summary), tone: 'neutral' })
  if (occurrence.isDetached) badges.push({ id: 'moved', label: t('activities.occurrences.flags.moved'), tone: 'info' })
  // E06-S13 #95: a session without a coach, or led by a substitute.
  const coachMark = coachBadge(occurrence)
  if (coachMark === 'needs_coach') {
    badges.push({ id: 'needs-coach', label: t('activities.club.session.needsCoach'), tone: 'warning' })
  }
  // REQ-A13: a substitute reads "substitute: {name}" (M-02 `m.occCard.substitute`).
  if (coachMark === 'substitution' && occurrence.coachName) {
    badges.push({
      id: 'substitute',
      label: t('activities.club.session.substituteCoach', { name: occurrence.coachName }),
      tone: 'info',
    })
  }
  // REQ-A13 (M-02, M-03): the type badge, as the session page shows it.
  if (occurrence.activityType) {
    badges.unshift({ id: 'type', label: t(`activities.types.${occurrence.activityType}`), tone: 'neutral' })
  }
  const actions: CalendarItemAction[] = []
  if (entry.declarationsOpen && !isStaffPerspective(as)) {
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
  const subtitle = as === 'guardian' ? entry.persons.map((person) => person.firstName).join(', ') : null
  // REQ-A13: the coach's card opens the session page and carries "Attendance list" (M-02, M-03); so does the
  // coordinator's (REQ-A10, #273).
  const links: CalendarItemLink[] =
    isStaffPerspective(as) && occurrence.status !== 'cancelled'
      ? [{ id: 'attendance', label: t('activities.club.session.attendanceList'), href: attendanceHref(occurrence.id) }]
      : []
  return {
    id: occurrence.id,
    title: title || t('activities.club.session.untitled'),
    startsAt: new Date(occurrence.startAt),
    endsAt: new Date(occurrence.endAt),
    gatheringAt: occurrence.gatheringAt ? new Date(occurrence.gatheringAt) : null,
    status: occurrence.status,
    place: occurrence.placeName,
    placeAddress: occurrence.placeAddress,
    placeHref: cardMapHref({
      name: occurrence.placeName,
      address: occurrence.placeAddress,
      geoLat: occurrence.placeGeoLat,
      geoLng: occurrence.placeGeoLng,
      placeExternal: occurrence.placeExternal,
    }),
    section: occurrence.sectionName ? { id: occurrence.sectionId, label: occurrence.sectionName } : null,
    coach: occurrence.coachName,
    subtitle,
    // Club events spec REQ-T03 (M-02, M-03): the event's name, linked to its public page once it is published.
    partOf: occurrence.clubEvent ? { label: occurrence.clubEvent.name, href: occurrence.clubEvent.publicPath } : null,
    notes: deadlineNotes(entry, as, t, formatAt),
    href: sessionHref(occurrence.id, as),
    badges,
    actions,
    links,
  }
}

// --- The coordinator's section views and counts (`GET /api/activities/occurrences`, E10-S08 #273) ---

/** One row of the sessions list, as far as the phone's section views read it. */
export type SectionSessionRow = {
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
  gatheringAt: string | null
  confirmBy: string | null
  deadlinePassed: boolean
  placeId: string | null
  placeName?: string | null
  venue: { name: string; address: string } | null
  coachPersonId: string | null
  coachName?: string | null
  substituteForPersonId?: string | null
  substituteForName?: string | null
  status: string | null
  cancelReason: string | null
  isDetached: boolean
  needsReschedule: boolean
  updatedAt: string | null
}

type SectionSessionsPage = { items: SectionSessionRow[]; total: number }

class SectionSessionsLoadError extends Error {}

export const SECTION_SESSIONS_QUERY_KEY = 'activities-section-sessions'

async function readSectionSessions(url: string): Promise<SectionSessionsPage> {
  const call = await apiCall<SectionSessionsPage>(url)
  if (!call.ok || !call.result) throw new SectionSessionsLoadError(String(call.status))
  return call.result
}

/** The sessions of one section view (not "All"), by start time, in the sections the coordinator reads. */
export function useSectionSessions(view: SectionListView | null, today: string, sectionId: string | null) {
  return useQuery({
    queryKey: [SECTION_SESSIONS_QUERY_KEY, view, today, sectionId],
    enabled: view !== null,
    queryFn: () => readSectionSessions(sectionSessionsUrl(view as SectionListView, today, { sectionId })),
  })
}

/** How many sessions one view holds (`pageSize=1`, the list's `total`): a count of the Today tile (M-02). */
export function useSectionCount(view: SectionListView, today: string, enabled: boolean) {
  return useQuery({
    queryKey: [SECTION_SESSIONS_QUERY_KEY, 'count', view, today],
    enabled,
    queryFn: async () => (await readSectionSessions(sectionSessionsUrl(view, today, { pageSize: 1 }))).total,
  })
}

/**
 * A row of a section view as a calendar entry of the coordinator (no persons, no summary: the list does not read the
 * declarations), so the view shows the same cards as the section calendar.
 */
export function sectionSessionEntry(row: SectionSessionRow): CalendarEntry {
  return {
    occurrence: {
      id: row.id,
      activityId: row.activityId ?? '',
      activityName: row.activityName ?? null,
      activityType: row.activityType ?? null,
      groupId: row.groupId ?? '',
      groupName: row.groupName ?? null,
      sectionId: row.sectionId ?? '',
      sectionName: null,
      occurrenceDate: row.occurrenceDate ?? '',
      startAt: row.startAt ?? '',
      endAt: row.endAt ?? '',
      gatheringAt: row.gatheringAt,
      confirmBy: row.confirmBy,
      deadlinePassed: row.deadlinePassed,
      placeId: row.placeId,
      venue: row.venue,
      placeName: row.placeName ?? null,
      placeAddress: row.venue?.address ?? null,
      placeGeoLat: null,
      placeGeoLng: null,
      placeExternal: row.venue !== null,
      coachPersonId: row.coachPersonId,
      coachName: row.coachName ?? null,
      substituteForPersonId: row.substituteForPersonId ?? null,
      substituteForName: row.substituteForName ?? null,
      opponentName: null,
      invitedTeamNames: [],
      status: row.status === 'done' || row.status === 'cancelled' ? row.status : 'planned',
      cancelReason: row.cancelReason,
      isDetached: row.isDetached,
      needsReschedule: row.needsReschedule,
      updatedAt: row.updatedAt ?? '',
    },
    declarationKind: 'confirm',
    declarationsOpen: false,
    persons: [],
  }
}

export type SectionOption = { id: string; name: string }

/** The active sections the caller reads (a coordinator: theirs; the record scope narrows them), by name. */
export function useCoordinatorSections(enabled: boolean) {
  return useQuery({
    queryKey: ['activities-coordinator-sections'],
    enabled,
    queryFn: async (): Promise<SectionOption[]> => {
      const call = await apiCall<{ items: { id: string; name: string | null }[] }>(
        '/api/club_core/sections?isActive=true&sortField=name&pageSize=100',
      )
      if (!call.ok || !call.result) return []
      return call.result.items.map((item) => ({ id: item.id, name: item.name ?? '' }))
    },
  })
}
