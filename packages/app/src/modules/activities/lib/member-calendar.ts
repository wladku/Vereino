// The views of the member calendar `/club/calendar` (club spec UI row "week/month calendar", REQ-006; README M-03;
// E06-S18, #100): the upcoming list (the default since E20-S14, #493, R01.7: today and the next 13 days), the week
// and the month list over an anchor date, the moves by whole weeks or months, a
// range opened from a link (`?from=&to=`), and the trimmed range the page asks for when the API refuses a range over
// 62 days (400 `calendar_range_invalid`) instead of failing. Pure: the page passes the club-zone "today".
import {
  addCalendarDays,
  calendarMonth,
  calendarWeek,
  isCalendarDate,
  trimCalendarRange,
  type CalendarDate,
  type DateWindow,
} from '@vereino/core'

export type CalendarView = 'upcoming' | 'week' | 'month'

/** The views in the order of the page's tabs; the first is the default on a phone (R01.7). */
export const CALENDAR_VIEWS: readonly CalendarView[] = ['upcoming', 'week', 'month']

/** How many days the upcoming list covers, today included. */
export const UPCOMING_DAYS = 14

export function isCalendarView(value: unknown): value is CalendarView {
  return CALENDAR_VIEWS.includes(value as CalendarView)
}

/** The upcoming list from `anchor`, or the Monday–Sunday week or the calendar month that holds `anchor`. */
export function calendarViewWindow(view: CalendarView, anchor: CalendarDate): DateWindow {
  if (view === 'upcoming') return { from: anchor, to: addCalendarDays(anchor, UPCOMING_DAYS - 1) }
  return view === 'week' ? calendarWeek(anchor) : calendarMonth(anchor)
}

/**
 * The first day of the list, week or month `step` lists, weeks or months away from the one holding `anchor` (the
 * upcoming list moves by its own length).
 */
export function shiftCalendarAnchor(view: CalendarView, anchor: CalendarDate, step: number): CalendarDate {
  if (view === 'upcoming') return addCalendarDays(anchor, step * UPCOMING_DAYS)
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

/** A session of the member calendar with the perspective (`as`) it was read in, and so opens in. */
export type PerspectiveEntry<T, P extends string> = { entry: T; as: P }

/**
 * The one list of the member context (spec N, *Business rules* → calendar in the member context): the reads of each
 * perspective merged by start time. A session found by more than one read appears once, in the perspective of the
 * later list — the coach's, so a shared session opens with `?as=coach`.
 */
export function mergeCalendarEntries<T extends { occurrence: { id: string; startAt: string } }, P extends string>(
  lists: readonly (readonly PerspectiveEntry<T, P>[])[],
): PerspectiveEntry<T, P>[] {
  const byId = new Map<string, PerspectiveEntry<T, P>>()
  for (const list of lists) for (const item of list) byId.set(item.entry.occurrence.id, item)
  const startOf = (item: PerspectiveEntry<T, P>) => Date.parse(item.entry.occurrence.startAt)
  return [...byId.values()].sort((a, b) => startOf(a) - startOf(b))
}
