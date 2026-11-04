// The views of the member calendar `/club/calendar` (club spec UI row "week/month calendar", REQ-006; README M-03;
// E06-S18, #100): the week (default) and the month list over an anchor date, the moves by whole weeks or months, a
// range opened from a link (`?from=&to=`), and the trimmed range the page asks for when the API refuses a range over
// 62 days (400 `calendar_range_invalid`) instead of failing. Pure: the page passes the club-zone "today".
import {
  calendarMonth,
  calendarWeek,
  isCalendarDate,
  trimCalendarRange,
  type CalendarDate,
  type DateWindow,
} from '@vereino/core'

export type CalendarView = 'week' | 'month'

export const CALENDAR_VIEWS: readonly CalendarView[] = ['week', 'month']

export function isCalendarView(value: unknown): value is CalendarView {
  return value === 'week' || value === 'month'
}

/** The Monday–Sunday week or the calendar month that holds `anchor`. */
export function calendarViewWindow(view: CalendarView, anchor: CalendarDate): DateWindow {
  return view === 'week' ? calendarWeek(anchor) : calendarMonth(anchor)
}

/** The first day of the week or month `step` weeks or months away from the one holding `anchor`. */
export function shiftCalendarAnchor(view: CalendarView, anchor: CalendarDate, step: number): CalendarDate {
  return (view === 'week' ? calendarWeek(anchor, step) : calendarMonth(anchor, step)).from
}

/** True when `date` falls in the window (both ends included). */
export function windowContains(window: DateWindow, date: CalendarDate): boolean {
  return window.from <= date && date <= window.to
}

/** The range a link asks for (`?from=YYYY-MM-DD&to=YYYY-MM-DD`), or null when either end is missing or not a date. */
export function requestedCalendarRange(from: string | null, to: string | null): DateWindow | null {
  return isCalendarDate(from) && isCalendarDate(to) ? { from, to } : null
}

export const CALENDAR_RANGE_INVALID = 'calendar_range_invalid'

/**
 * The range to ask for again after a refused read: the trimmed range when the API answered 400
 * `calendar_range_invalid` and trimming changes the range; null when the answer is another failure (or trimming cannot
 * help), so the page shows its error state.
 */
export function calendarRangeRetry(window: DateWindow, status: number, code: unknown): DateWindow | null {
  if (status !== 400 || code !== CALENDAR_RANGE_INVALID) return null
  const trimmed = trimCalendarRange(window)
  return trimmed.from === window.from && trimmed.to === window.to ? null : trimmed
}
