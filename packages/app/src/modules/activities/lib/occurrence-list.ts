// The sessions list `/backend/activities/occurrences` (README B-15; club spec UI table, REQ-006; E06-S12, #94): the
// perspectives All / Canceled / Calendar in the URL (`?perspective=`), the default window of 7 days back through 14
// days ahead, the row actions a session offers (Cancel for a future planned session, Attendance list for a started
// one), the cancellation reason rule and the date range the coordinator's calendar reads for the shown grid. Pure:
// the page passes "today" and "now".
import { addCalendarDays, trimCalendarRange, type CalendarDate, type DateWindow } from '@vereino/core'

export const OCCURRENCE_PERSPECTIVES = ['all', 'cancelled', 'calendar'] as const

export type OccurrencePerspective = (typeof OCCURRENCE_PERSPECTIVES)[number]

/** The perspective a `?perspective=` value names; anything else is "All". */
export function perspectiveOf(value: string | null | undefined): OccurrencePerspective {
  return value === 'cancelled' || value === 'calendar' ? value : 'all'
}

/** The list URL of a perspective ("All" keeps the bare path). */
export function perspectiveHref(path: string, perspective: OccurrencePerspective): string {
  return perspective === 'all' ? path : `${path}?perspective=${perspective}`
}

/** The status a list perspective pins (Canceled lists cancelled sessions only). */
export function perspectiveStatus(perspective: OccurrencePerspective): 'cancelled' | undefined {
  return perspective === 'cancelled' ? 'cancelled' : undefined
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
 * The actions of one list row besides "Open": Cancel for a planned session that has not started yet, Attendance list
 * for a session that has started and is not cancelled. Both need `activities.coach` (the record page's gate); the
 * server still decides the scope.
 */
export function sessionRowActions(
  row: { status: string | null; startAt: string | null },
  now: Date,
  canCoach: boolean,
): SessionRowAction[] {
  if (!canCoach || !row.startAt) return []
  const startsAt = Date.parse(row.startAt)
  if (Number.isNaN(startsAt)) return []
  const started = startsAt <= now.getTime()
  if (!started) return row.status === 'planned' ? ['cancel'] : []
  return row.status === 'cancelled' ? [] : ['attendance']
}

/** The calendar date of an instant in the browser's zone (the schedule grid buckets its days there). */
export function localCalendarDate(date: Date): CalendarDate {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${String(date.getFullYear())}-${month}-${day}`
}

/** The dates the coordinator's calendar reads for the grid's range, trimmed to the 62 days the API serves. */
export function scheduleRangeWindow(range: { start: Date; end: Date }): DateWindow {
  return trimCalendarRange({ from: localCalendarDate(range.start), to: localCalendarDate(range.end) })
}
