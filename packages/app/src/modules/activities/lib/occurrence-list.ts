// The sessions list `/backend/activities/occurrences` (README B-15; club spec UI table, REQ-006; E06-S12, #94): the
// views Upcoming ("all") / Needing a coach / Needs a new time / Unsettled / Canceled / Calendar in the URL (`?view=`,
// DD-A11 of the groups and activities parity spec, #268; `?perspective=` stays accepted for links already sent; E06-S13
// #95 added the two coach views), the scope to one activity (`?activity=`), the default window of each (7 days back
// through 14 days ahead; from today for 14 days for "Needing a coach"; none for "Unsettled" and "Needs a new time"), the
// row actions a session offers (Cancel for a future planned session,
// Attendance list for a started one, Assign substitute / Change coach for a planned one), the coach badges, the
// cancellation reason rule and the date range the coordinator's calendar reads for the shown grid. Pure: the page
// passes "today" and "now".
import { addCalendarDays, type CalendarDate, type DateWindow } from '@vereino/core'

export const OCCURRENCE_PERSPECTIVES = [
  'all',
  'unassigned',
  'reschedule',
  'unsettled',
  'cancelled',
  'calendar',
] as const

export type OccurrencePerspective = (typeof OCCURRENCE_PERSPECTIVES)[number]

/** The view a `?view=` (or the older `?perspective=`) value names; anything else is "all" (labelled "Upcoming"). */
export function perspectiveOf(value: string | null | undefined): OccurrencePerspective {
  return (OCCURRENCE_PERSPECTIVES as readonly string[]).includes(value ?? '') ? (value as OccurrencePerspective) : 'all'
}

/** The search parameters of the list URL. */
type ListParams = { get(name: string): string | null }

/** The view of the list URL: `?view=` first, then the alias `?perspective=` (DD-A11). */
export function viewOfParams(params: ListParams): OccurrencePerspective {
  return perspectiveOf(params.get('view') ?? params.get('perspective'))
}

/** The activity the list URL scopes the sessions to (`?activity=`), or null. */
export function activityOfParams(params: ListParams): string | null {
  const value = params.get('activity')?.trim()
  return value ? value : null
}

/** The list URL of a view ("all" keeps the bare path), optionally scoped to one activity. */
export function perspectiveHref(path: string, perspective: OccurrencePerspective, activityId?: string | null): string {
  const query = new URLSearchParams()
  if (perspective !== 'all') query.set('view', perspective)
  if (activityId) query.set('activity', activityId)
  const suffix = query.toString()
  return suffix ? `${path}?${suffix}` : path
}

/** The status a list perspective pins (Canceled lists cancelled sessions only). */
export function perspectiveStatus(perspective: OccurrencePerspective): 'cancelled' | undefined {
  return perspective === 'cancelled' ? 'cancelled' : undefined
}

/**
 * The list query a view pins: Canceled its status, "Needing a coach" `unassigned=1` (planned, no coach), "Needs a new
 * time" planned sessions with `needs_reschedule`, "Unsettled" `unsettled=1` (planned, ended 24 hours ago or more).
 */
export function perspectiveQuery(perspective: OccurrencePerspective): Record<string, string> {
  if (perspective === 'unassigned') return { unassigned: '1' }
  if (perspective === 'reschedule') return { status: 'planned', needsReschedule: 'true' }
  if (perspective === 'unsettled') return { unsettled: '1' }
  const status = perspectiveStatus(perspective)
  return status ? { status } : {}
}

/** The days "Needing a coach" looks ahead from today (README B-15, B-01 widget). */
export const NEEDING_COACH_DAYS_AHEAD = 14

/**
 * The slot-date window a view opens with: from today for 14 days for "Needing a coach", none for "Unsettled" (an
 * unsettled session stays listed until it is closed) and "Needs a new time" (a flagged session stays listed until it is
 * moved or cancelled), 7 days back through 14 days ahead otherwise.
 */
export function perspectiveWindow(perspective: OccurrencePerspective, today: CalendarDate): DateWindow | null {
  if (perspective === 'unsettled' || perspective === 'reschedule') return null
  if (perspective === 'unassigned') return { from: today, to: addCalendarDays(today, NEEDING_COACH_DAYS_AHEAD) }
  return defaultSessionWindow(today)
}

export const SESSION_WINDOW_DAYS_BACK = 7
export const SESSION_WINDOW_DAYS_AHEAD = 14

/** The list's default slot-date window: 7 days back through 14 days ahead of `today`. */
export function defaultSessionWindow(today: CalendarDate): DateWindow {
  return {
    from: addCalendarDays(today, -SESSION_WINDOW_DAYS_BACK),
    to: addCalendarDays(today, SESSION_WINDOW_DAYS_AHEAD),
  }
}

export const CANCEL_REASON_MIN_LENGTH = 3
export const CANCEL_REASON_MAX_LENGTH = 500

/** A cancellation reason the dialog accepts: at least 3 characters once trimmed. */
export function isCancelReasonValid(reason: string): boolean {
  return reason.trim().length >= CANCEL_REASON_MIN_LENGTH
}

export type SessionRowAction = 'cancel' | 'attendance'

/**
 * The actions of one list row besides "Open": Cancel for a planned session that has not started yet and that the
 * caller may cancel (`mayCancel` of the list, #215 — the club setting `coach_may_cancel` may forbid a coach), Attendance
 * list for a session that has started and is not cancelled. Both need `activities.coach` (the record page's gate); the
 * server still decides the scope.
 */
export function sessionRowActions(
  row: { status: string | null; startAt: string | null; mayCancel?: boolean },
  now: Date,
  canCoach: boolean,
): SessionRowAction[] {
  if (!canCoach || !row.startAt) return []
  const startsAt = Date.parse(row.startAt)
  if (Number.isNaN(startsAt)) return []
  const started = startsAt <= now.getTime()
  if (!started) return row.status === 'planned' && row.mayCancel === true ? ['cancel'] : []
  return row.status === 'cancelled' ? [] : ['attendance']
}

/**
 * The coach action of a list row (E06-S13 #95): "Assign substitute" for a planned session without a coach, "Change
 * coach" for a planned one with a coach; none otherwise or without `activities.manage`. The server still decides scope.
 */
export function coachRowAction(
  row: { status: string | null; coachPersonId: string | null },
  canManage: boolean,
): 'assign' | 'change' | null {
  if (!canManage || row.status !== 'planned') return null
  return row.coachPersonId ? 'change' : 'assign'
}

/** "Move" for a planned session and a planner (`activities.manage`; the move command refuses other statuses). */
export function mayMoveRow(row: { status: string | null }, canManage: boolean): boolean {
  return canManage && row.status === 'planned'
}

export type SessionInlineAction = 'assign' | 'change' | 'move' | SessionRowAction

/**
 * The buttons of one list row in the order B-15 shows them (#268): Assign substitute (the row's primary action) or
 * Change coach, Move, then Cancel or Attendance list. The same items fill the row menu under 1024 px.
 */
export function sessionInlineActions(
  row: { status: string | null; startAt: string | null; coachPersonId: string | null; mayCancel?: boolean },
  now: Date,
  features: { manage: boolean; coach: boolean },
): SessionInlineAction[] {
  const actions: SessionInlineAction[] = []
  const coach = coachRowAction(row, features.manage)
  if (coach) actions.push(coach)
  if (mayMoveRow(row, features.manage)) actions.push('move')
  actions.push(...sessionRowActions(row, now, features.coach))
  return actions
}

/**
 * The badge next to a session's coach (README B-15, M-03, M-04): "Needs a coach" for a planned session without one,
 * "(substitution)" when the coach stands in for the session's own coach; none otherwise.
 */
export function coachBadge(row: {
  status: string | null
  coachPersonId: string | null
  substituteForPersonId?: string | null
}): 'needs_coach' | 'substitution' | null {
  if (row.status === 'planned' && !row.coachPersonId) return 'needs_coach'
  return row.coachPersonId && row.substituteForPersonId ? 'substitution' : null
}

/** The calendar date of an instant in the browser's zone (the schedule grid buckets its days there). */
export function localCalendarDate(date: Date): CalendarDate {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${String(date.getFullYear())}-${month}-${day}`
}
