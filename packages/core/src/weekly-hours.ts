// Weekly wall-clock windows and a place's opening hours (facilities spec DD-41, REQ-029): shared by `club_core`, which
// stores and validates `club_core_places.opening_hours`, and `facilities`, which checks zone rules and bookings against
// them. Times are wall-clock `HH:MM` in the club time zone, weekdays ISO (1 = Monday … 7 = Sunday), seasons `MM-DD`
// ranges that may wrap the year end. Everything here is pure (S3.5): dates are calendar dates the caller computed.
import { isCalendarDate, type CalendarDate } from '#src/calendar-date'

/** A wall-clock time `HH:MM` (00:00–24:00; `24:00` closes a window at midnight). */
export type WallTime = string

/** An ISO weekday: 1 = Monday … 7 = Sunday. */
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7

export const ISO_WEEKDAYS: readonly IsoWeekday[] = [1, 2, 3, 4, 5, 6, 7]

/** One window on a weekday, `from` < `to`. */
export type WeeklyWindow = { readonly weekday: number; readonly from: WallTime; readonly to: WallTime }

/** A season of opening hours: `from`–`to` as `MM-DD` (inclusive; `from` > `to` wraps the year end). */
export type OpeningSeason = { readonly from: string; readonly to: string; readonly windows: readonly WeeklyWindow[] }

/** `club_core_places.opening_hours` (DD-41). */
export type OpeningHours = { readonly seasons: readonly OpeningSeason[] }

/** Why a value is not valid opening hours. */
export type OpeningHoursProblem = 'malformed' | 'window_inverted' | 'window_overlap' | 'season_overlap'

const WALL_TIME_PATTERN = /^(?:([01]\d|2[0-3]):([0-5]\d)|24:00)$/
const MONTH_DAY_PATTERN = /^(\d{2})-(\d{2})$/
/** Days per month in a leap year, so `02-29` is a valid season bound. */
const MONTH_LENGTHS = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

export function isWallTime(value: unknown): value is WallTime {
  return typeof value === 'string' && WALL_TIME_PATTERN.test(value)
}

/** Minutes since midnight of a wall time (`24:00` = 1440). */
export function minutesOfDay(time: WallTime): number {
  const [hours, minutes] = time.split(':')
  return Number(hours) * 60 + Number(minutes)
}

export function isIsoWeekday(value: unknown): value is IsoWeekday {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 7
}

/** True for a real `MM-DD` day of a (leap) year. */
export function isMonthDay(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const match = MONTH_DAY_PATTERN.exec(value)
  if (!match) return false
  const month = Number(match[1])
  const day = Number(match[2])
  return month >= 1 && month <= 12 && day >= 1 && day <= (MONTH_LENGTHS[month - 1] as number)
}

/** The ISO weekday of a calendar date. */
export function isoWeekdayOf(date: CalendarDate): IsoWeekday {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay()
  return (day === 0 ? 7 : day) as IsoWeekday
}

/** The calendar date `days` after `date` (negative goes back). */
export function addDays(date: CalendarDate, days: number): CalendarDate {
  const probe = new Date(`${date}T00:00:00Z`)
  probe.setUTCDate(probe.getUTCDate() + days)
  return probe.toISOString().slice(0, 10)
}

/** True when the season covers the `MM-DD` of a date (inclusive; a wrapping season covers both ends of the year). */
export function seasonCovers(season: Pick<OpeningSeason, 'from' | 'to'>, date: CalendarDate): boolean {
  const monthDay = date.slice(5)
  if (season.from <= season.to) return season.from <= monthDay && monthDay <= season.to
  return monthDay >= season.from || monthDay <= season.to
}

/** True when two windows on the same weekday share at least a minute. */
export function windowsOverlap(a: WeeklyWindow, b: WeeklyWindow): boolean {
  return (
    a.weekday === b.weekday && minutesOfDay(a.from) < minutesOfDay(b.to) && minutesOfDay(b.from) < minutesOfDay(a.to)
  )
}

function isWindow(value: unknown): value is WeeklyWindow {
  if (value === null || typeof value !== 'object') return false
  const { weekday, from, to } = value as Record<string, unknown>
  return isIsoWeekday(weekday) && isWallTime(from) && isWallTime(to)
}

function isSeason(value: unknown): value is OpeningSeason {
  if (value === null || typeof value !== 'object') return false
  const { from, to, windows } = value as Record<string, unknown>
  return isMonthDay(from) && isMonthDay(to) && Array.isArray(windows) && windows.every(isWindow)
}

/** The `MM-DD` days of a season, in a leap year so every bound is a real day. */
function seasonDays(season: Pick<OpeningSeason, 'from' | 'to'>): Set<string> {
  const days = new Set<string>()
  for (let date = '2028-01-01'; date <= '2028-12-31'; date = addDays(date, 1)) {
    if (seasonCovers(season, date)) days.add(date.slice(5))
  }
  return days
}

/**
 * The first problem of a stored or submitted opening-hours value, or null when it is valid (DD-41): every window ends
 * after it starts, the windows of one weekday within a season do not overlap, and no date is covered by two seasons.
 */
export function openingHoursProblem(value: unknown): OpeningHoursProblem | null {
  if (value === null || typeof value !== 'object') return 'malformed'
  const { seasons } = value as { seasons?: unknown }
  if (!Array.isArray(seasons) || !seasons.every(isSeason)) return 'malformed'
  for (const season of seasons) {
    if (season.windows.some((window) => minutesOfDay(window.from) >= minutesOfDay(window.to))) return 'window_inverted'
    const overlapping = season.windows.some((window, index) =>
      season.windows.slice(index + 1).some((other) => windowsOverlap(window, other)),
    )
    if (overlapping) return 'window_overlap'
  }
  const covered = new Set<string>()
  for (const season of seasons) {
    for (const day of seasonDays(season)) {
      if (covered.has(day)) return 'season_overlap'
      covered.add(day)
    }
  }
  return null
}

/** The opening hours of a stored value, or null when it is empty or invalid (an invalid value never limits). */
export function readOpeningHours(value: unknown): OpeningHours | null {
  return value !== null && value !== undefined && openingHoursProblem(value) === null ? (value as OpeningHours) : null
}

/**
 * The opening windows of a date: null when the place has no opening hours (no limit), an empty list when no season
 * covers the date (closed).
 */
export function openingWindowsOn(hours: OpeningHours | null, date: CalendarDate): WeeklyWindow[] | null {
  if (!hours) return null
  const season = hours.seasons.find((entry) => seasonCovers(entry, date))
  const weekday = isoWeekdayOf(date)
  return season ? season.windows.filter((window) => window.weekday === weekday) : []
}

/** True when `from`–`to` lies inside one of the windows. */
export function withinWindows(windows: readonly WeeklyWindow[], from: WallTime, to: WallTime): boolean {
  const start = minutesOfDay(from)
  const end = minutesOfDay(to)
  return windows.some((window) => minutesOfDay(window.from) <= start && end <= minutesOfDay(window.to))
}

/**
 * Whether a weekly window fits the opening hours over a validity period (REQ-029): on every date of the period with
 * that weekday that a season covers, the window lies inside an opening window, and at least one such date exists.
 * Dates no season covers are skipped (the place is closed then and the window has no effect). Without opening hours
 * every window fits. An open-ended period is checked for one year from its start.
 */
export function windowFitsOpeningHours(
  hours: OpeningHours | null,
  window: WeeklyWindow,
  period: { readonly validFrom: CalendarDate; readonly validTo: CalendarDate | null },
): boolean {
  if (!hours) return true
  if (!isCalendarDate(period.validFrom)) return false
  const lastDay = addDays(period.validFrom, 365)
  const until = period.validTo !== null && period.validTo < lastDay ? period.validTo : lastDay
  let checked = false
  for (let date = period.validFrom; date <= until; date = addDays(date, 1)) {
    if (isoWeekdayOf(date) !== window.weekday) continue
    const season = hours.seasons.find((entry) => seasonCovers(entry, date))
    if (!season) continue
    const windows = season.windows.filter((entry) => entry.weekday === window.weekday)
    if (!withinWindows(windows, window.from, window.to)) return false
    checked = true
  }
  return checked
}
