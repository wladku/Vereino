// The range rules of the public facility calendar P-04 (calendar range switch spec REQ-W04, DD-W03, DD-W07, DD-W08):
// which view and day the address opens — an old `?month=YYYY-MM` permalink (a QR code on a poster) opens that month,
// otherwise `?range=&date=` with Day on a phone and Week from `md` — kept inside the readable window (the month before
// the current one to twelve months ahead), and what the page reads for it: a month by `?month=`, a day or a week by
// `?from=&to=` of the whole week (a day is inside its week, so moving through a week's days reads nothing new). Pure:
// the page passes the club-zone today and whether the screen is wide.
import { addDays, calendarMonth, type CalendarDate } from '@vereino/core'
import {
  calendarRangeHref,
  clampToWindow,
  defaultCalendarRange,
  parseCalendarRange,
  rangeOf,
  readableRange,
  type CalendarRange,
  type CalendarRangeLimits,
  type CalendarRangeParams,
} from '@vereino/ui'
import { PUBLIC_MONTHS_AHEAD, PUBLIC_MONTHS_BACK } from './public-schedule'

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/

/** The days a guest may read: from the first day of the previous month to the last day twelve months ahead. */
export function publicReadableWindow(today: CalendarDate): Required<CalendarRangeLimits> {
  return {
    min: calendarMonth(today, -PUBLIC_MONTHS_BACK).from,
    max: calendarMonth(today, PUBLIC_MONTHS_AHEAD).to,
  }
}

/**
 * The window a browser may ask for when it knows only its own date: the server checks the club zone's today, which
 * can be a day ahead or behind. Starting a day later and ending a day earlier stays inside the server's window on
 * either side of midnight, so a visitor in another zone never gets a 400 at the window's edge.
 */
export function publicSafeWindow(browserToday: CalendarDate): Required<CalendarRangeLimits> {
  return {
    min: publicReadableWindow(addDays(browserToday, 1)).min,
    max: publicReadableWindow(addDays(browserToday, -1)).max,
  }
}

export type PublicRange = { range: CalendarRange; anchor: CalendarDate }

/**
 * The view and the anchor of the address: `?range=&date=`; without `range`, an old `?month=` opens that month and
 * anything else the screen's default (Day on a phone, Week from `md`). The anchor stays inside the safe window of the
 * browser's `today`.
 */
export function publicRangeOf(params: CalendarRangeParams, wide: boolean, today: CalendarDate): PublicRange {
  const limits = publicSafeWindow(today)
  const parsed = parseCalendarRange(params, { today, fallback: defaultCalendarRange(wide) })
  const month = params.get('month')
  if (!parsed.explicit && month && MONTH_PATTERN.test(month)) {
    return { range: 'month', anchor: clampToWindow(`${month}-01`, limits) }
  }
  return { range: parsed.range, anchor: clampToWindow(parsed.anchor, limits) }
}

/** What the page asks the public schedule read for. */
export type PublicScheduleRead = { month: string } | { from: CalendarDate; to: CalendarDate }

/** A month reads `?month=`; a day or a week reads its whole week, cut to the readable window (DD-W03, DD-W07). */
export function publicScheduleRead(
  range: CalendarRange,
  anchor: CalendarDate,
  today: CalendarDate,
): PublicScheduleRead {
  if (range === 'month') return { month: anchor.slice(0, 7) }
  return readableRange(rangeOf('week', anchor), publicSafeWindow(today))
}

/** The query string of a read: `?month=YYYY-MM` or `?from=…&to=…`. */
export function publicScheduleQuery(read: PublicScheduleRead): string {
  const params = new URLSearchParams('month' in read ? { month: read.month } : { from: read.from, to: read.to })
  return `?${params.toString()}`
}

/** The page's address of a view: the other parameters kept, an old `month` dropped (DD-W08). */
export function publicRangeHref(path: string, current: string | { toString(): string }, range: string, anchor: string) {
  return calendarRangeHref(path, current, range, anchor, ['month'])
}
