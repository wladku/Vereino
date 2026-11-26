// The range rules of every calendar a person browses (calendar range switch spec REQ-W01, DD-W02, DD-W03, DD-W04,
// DD-W08; D-040): a view is Day, Week or Month (plus a view's own extra tab, such as M-03's "upcoming" or B-15's
// "agenda"), built around an anchor date. The address carries both (`?range=&date=`), so a reload, a shared link and a
// QR code reopen the same view. A week runs Monday to Sunday, a month is the calendar month, and every date is a
// club-zone `YYYY-MM-DD`. Without `range` a phone opens on Day and a wider screen (from `md`, 768 px) on Week. Pure:
// the page passes the club-zone today and whether the screen is wide.
import {
  addCalendarDays,
  calendarMonth,
  calendarWeek,
  isCalendarDate,
  type CalendarDate,
  type DateWindow,
} from '@vereino/core'

export const CALENDAR_RANGES = ['day', 'week', 'month'] as const
export type CalendarRange = (typeof CALENDAR_RANGES)[number]

/** The address parameters of the switch: the view (`range`) and the anchor date (`date`). */
export const CALENDAR_RANGE_PARAM = 'range'
export const CALENDAR_DATE_PARAM = 'date'

/** The width from which a view opens on Week (Tailwind `md`), as a media query (A-W04). */
export const WIDE_CALENDAR_QUERY = '(min-width: 768px)'

/** The readable window of a view: no range may end before `min` or start after `max`. */
export type CalendarRangeLimits = { readonly min?: CalendarDate | null; readonly max?: CalendarDate | null }

export function isCalendarRange(value: unknown): value is CalendarRange {
  return CALENDAR_RANGES.includes(value as CalendarRange)
}

/** The default view without `range` in the address: Day on a phone, Week from `md` up (Q-W02, DD-W03). */
export function defaultCalendarRange(wide: boolean): CalendarRange {
  return wide ? 'week' : 'day'
}

/** What `parseCalendarRange` reads: anything with `get` (`URLSearchParams`, Next's `ReadonlyURLSearchParams`). */
export type CalendarRangeParams = { get(name: string): string | null }

export type ParsedCalendarRange<Extra extends string = never> = {
  range: CalendarRange | Extra
  anchor: CalendarDate
  /** Whether the address named the view; otherwise it follows the screen width (DD-W03). */
  explicit: boolean
}

/**
 * The view and the anchor of the address: a known `range` (or one of the view's `extra` tabs) and a valid `date`;
 * otherwise `fallback` (the screen's default) and today.
 */
export function parseCalendarRange<Extra extends string = never>(
  params: CalendarRangeParams,
  options: { today: CalendarDate; fallback: CalendarRange | Extra; extra?: readonly Extra[] },
): ParsedCalendarRange<Extra> {
  const requested = params.get(CALENDAR_RANGE_PARAM)
  const known = isCalendarRange(requested) || (options.extra ?? []).includes(requested as Extra)
  const date = params.get(CALENDAR_DATE_PARAM)
  return {
    range: known ? (requested as CalendarRange | Extra) : options.fallback,
    anchor: isCalendarDate(date) ? date : options.today,
    explicit: known,
  }
}

/** The dates a view shows around `anchor`: the day itself, its Monday–Sunday week or its calendar month. */
export function rangeOf(range: CalendarRange, anchor: CalendarDate): DateWindow {
  if (range === 'day') return { from: anchor, to: anchor }
  return range === 'week' ? calendarWeek(anchor) : calendarMonth(anchor)
}

/** Every date of the window, in order. */
export function datesOf(window: DateWindow): CalendarDate[] {
  const dates: CalendarDate[] = []
  for (let date = window.from; date <= window.to; date = addCalendarDays(date, 1)) dates.push(date)
  return dates
}

/** True when `date` falls in the window (both ends included). */
export function windowHolds(window: DateWindow, date: CalendarDate): boolean {
  return window.from <= date && date <= window.to
}

/**
 * The anchor one day, week or month away (`step` −1 or +1): the same weekday a week away and the same day of the month
 * a month away, clamped to the month's last day (31 January → 28 or 29 February).
 */
export function shiftRange(range: CalendarRange, anchor: CalendarDate, step: number): CalendarDate {
  if (range === 'day') return addCalendarDays(anchor, step)
  if (range === 'week') return addCalendarDays(anchor, step * 7)
  const month = calendarMonth(anchor, step)
  const day = Math.min(Number(anchor.slice(8, 10)), Number(month.to.slice(8, 10)))
  return `${month.from.slice(0, 8)}${String(day).padStart(2, '0')}`
}

/** Whether an arrow may move: the next range must not end before `min` nor start after `max`. */
export function canShiftRange(
  range: CalendarRange,
  anchor: CalendarDate,
  step: number,
  limits: CalendarRangeLimits = {},
): boolean {
  const next = rangeOf(range, shiftRange(range, anchor, step))
  if (limits.min && next.to < limits.min) return false
  return !(limits.max && next.from > limits.max)
}

/** The anchor kept inside the readable window (an old link to a day the view no longer reads). */
export function clampToWindow(anchor: CalendarDate, limits: CalendarRangeLimits = {}): CalendarDate {
  if (limits.min && anchor < limits.min) return limits.min
  if (limits.max && anchor > limits.max) return limits.max
  return anchor
}

/** The window a read asks for: the view's dates cut to the readable window. */
export function readableRange(window: DateWindow, limits: CalendarRangeLimits = {}): DateWindow {
  return {
    from: limits.min && window.from < limits.min ? limits.min : window.from,
    to: limits.max && window.to > limits.max ? limits.max : window.to,
  }
}

/** The texts of the switch (the `CalendarRangeSwitch` labels), by meaning. */
export type CalendarRangeTexts = {
  group: string
  day: string
  week: string
  month: string
  earlier: string
  later: string
  today: string
  previous: Record<CalendarRange, string>
  next: Record<CalendarRange, string>
}

/**
 * The switch's texts from a module catalog: `{prefix}.group`, `.day`, `.week`, `.month`, `.earlier`, `.later`,
 * `.today`, `.previous.{day|week|month}` and `.next.{day|week|month}` — the same keys in every module, so every
 * calendar says the same words (AC-W01).
 */
export function calendarRangeLabels(t: (key: string) => string, prefix: string): CalendarRangeTexts {
  const per = (kind: 'previous' | 'next') =>
    Object.fromEntries(CALENDAR_RANGES.map((range) => [range, t(`${prefix}.${kind}.${range}`)])) as Record<
      CalendarRange,
      string
    >
  return {
    group: t(`${prefix}.group`),
    day: t(`${prefix}.day`),
    week: t(`${prefix}.week`),
    month: t(`${prefix}.month`),
    earlier: t(`${prefix}.earlier`),
    later: t(`${prefix}.later`),
    today: t(`${prefix}.today`),
    previous: per('previous'),
    next: per('next'),
  }
}

const noon = (date: CalendarDate): Date => new Date(`${date}T12:00:00Z`)

/**
 * The range's heading: Day "środa, 26 listopada" / "Wednesday, November 26"; Week "24–30 listopada" (across months
 * "28 listopada – 4 grudnia", across years with the years); Month "listopad 2026" / "November 2026".
 */
export function formatRangeLabel(range: CalendarRange, anchor: CalendarDate, locale: string): string {
  if (range === 'day') {
    return new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(
      noon(anchor),
    )
  }
  if (range === 'month') {
    return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(noon(anchor))
  }
  const week = rangeOf('week', anchor)
  const options: Intl.DateTimeFormatOptions =
    week.from.slice(0, 4) === week.to.slice(0, 4)
      ? { day: 'numeric', month: 'long', timeZone: 'UTC' }
      : { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }
  return new Intl.DateTimeFormat(locale, options).formatRange(noon(week.from), noon(week.to))
}

/**
 * The address of a view: the page's other parameters kept, `range` and `date` set, and the parameters in `drop`
 * removed (an old `?month=` or `?from=&to=` that the new view replaces, DD-W08).
 */
export function calendarRangeHref(
  path: string,
  current: string | { toString(): string },
  range: string,
  anchor: CalendarDate,
  drop: readonly string[] = [],
): string {
  const params = new URLSearchParams(typeof current === 'string' ? current : current.toString())
  for (const name of drop) params.delete(name)
  params.set(CALENDAR_RANGE_PARAM, range)
  params.set(CALENDAR_DATE_PARAM, anchor)
  return `${path}?${params.toString()}`
}

/** A media-query store for `useSyncExternalStore`: whether the query matches, and its change subscription. */
export type MediaQueryWindow = {
  matchMedia(query: string): {
    matches: boolean
    addEventListener(type: 'change', listener: () => void): void
    removeEventListener(type: 'change', listener: () => void): void
  }
}

export type MediaQueryStore = {
  subscribe: (onChange: () => void) => () => void
  /** Whether the query matches; without a window (the server) a page renders the wide view (DD-W03). */
  getSnapshot: () => boolean
}

export function mediaQueryStore(query: string, target: MediaQueryWindow | undefined): MediaQueryStore {
  return {
    subscribe: (onChange) => {
      if (!target) return () => undefined
      const list = target.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => {
        list.removeEventListener('change', onChange)
      }
    },
    getSnapshot: () => (target ? target.matchMedia(query).matches : true),
  }
}
