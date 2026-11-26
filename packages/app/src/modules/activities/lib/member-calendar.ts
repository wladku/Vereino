// The views of the member calendar `/club/calendar` (club spec UI row "week/month calendar", REQ-006; README M-03;
// E06-S18, #100; calendar range switch spec REQ-W06, #784): the upcoming list (E20-S14, #493, R01.7: today and the
// next 13 days) as its own tab before the shared Day / Week / Month, the view and its anchor date in the address
// (`?range=&date=`; without `range` a phone opens on Day and a wider screen on Week), a range opened from a link
// (`?from=&to=`, which a `range` overrides), and the trimmed range the page asks for when the API refuses a range over
// 62 days (400 `calendar_range_invalid`) instead of failing. Pure: the page passes the club-zone "today".
import { addCalendarDays, isCalendarDate, trimCalendarRange, type CalendarDate, type DateWindow } from '@vereino/core'
import {
  calendarRangeHref,
  defaultCalendarRange,
  parseCalendarRange,
  rangeOf,
  type CalendarRange,
  type CalendarRangeParams,
} from '@vereino/ui'

/** The member calendar's own tab before Day / Week / Month. */
export const UPCOMING_VIEW = 'upcoming'

export type CalendarView = typeof UPCOMING_VIEW | CalendarRange

/** How many days the upcoming list covers, today included. */
export const UPCOMING_DAYS = 14

/** The parameters a view change replaces: a link's `from`/`to` (#493). */
const REPLACED = ['from', 'to'] as const

export type MemberCalendarState = {
  view: CalendarView
  anchor: CalendarDate
  /** The range a link opened (`?from=&to=` without `range`); null otherwise. */
  link: DateWindow | null
}

/** The view, anchor and link range of the address; without a view, Day on a phone and Week from `md` (Q-W02). */
export function memberCalendarState(
  params: CalendarRangeParams,
  wide: boolean,
  today: CalendarDate,
): MemberCalendarState {
  const parsed = parseCalendarRange(params, {
    today,
    fallback: defaultCalendarRange(wide),
    extra: [UPCOMING_VIEW] as const,
  })
  const link = parsed.explicit ? null : requestedCalendarRange(params.get('from'), params.get('to'))
  return { view: parsed.range, anchor: parsed.anchor, link }
}

/** The dates a view reads: the upcoming list from today, or the day, week or month of the anchor. */
export function memberCalendarWindow(view: CalendarView, anchor: CalendarDate, today: CalendarDate): DateWindow {
  if (view === UPCOMING_VIEW) return { from: today, to: addCalendarDays(today, UPCOMING_DAYS - 1) }
  return rangeOf(view, anchor)
}

/** The address of a view on `path`: the page's other parameters kept, a link's `from`/`to` dropped. */
export function memberCalendarHref(
  path: string,
  current: string | { toString(): string },
  view: string,
  anchor: CalendarDate,
): string {
  return calendarRangeHref(path, current, view, anchor, REPLACED)
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
