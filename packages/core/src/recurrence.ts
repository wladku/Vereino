// P-24 Recurrence (foundation II DD-G01…DD-G03): the RRULE subset a club needs — `FREQ=WEEKLY`, `INTERVAL`, `BYDAY`,
// `UNTIL` / `COUNT`, `WKST=MO`, plus an `EXDATE` line — parsed from and serialised to the standard text, expanded into
// sessions at the club's wall time, and the series-edit plan that never moves a session the club has already acted on.
// Pure: the caller passes the club zone, the window and "today" (S3.5).
import { formatInTimeZone } from 'date-fns-tz'
import { isCalendarDate, type CalendarDate } from '#src/calendar-date'

/** RFC 5545 weekdays, Monday first (`WKST=MO`). */
export const WEEKDAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const
export type Weekday = (typeof WEEKDAYS)[number]

/** The supported subset: a weekly rule with an interval, weekdays, an inclusive end date or a count, and exceptions. */
export type Recurrence = {
  readonly freq: 'WEEKLY'
  /** Every n-th week, counted from the Monday of the first day's week. */
  readonly interval: number
  /** Weekdays in `WEEKDAYS` order, never empty. */
  readonly byDay: readonly Weekday[]
  /** The last day a session may fall on (club-zone date, inclusive); null when open-ended or counted. */
  readonly until: CalendarDate | null
  /** The number of generated instances, counted before exceptions are removed (RFC 5545); null when not counted. */
  readonly count: number | null
  /** Days without a session, sorted. */
  readonly exdates: readonly CalendarDate[]
}

/** Why a rule is not accepted: a part outside the subset, or a malformed value. */
export type RecurrenceInvalidReason =
  | 'malformed'
  | 'duplicate_part'
  | 'freq_missing'
  | 'interval'
  | 'count'
  | 'until'
  | 'until_and_count'
  | 'byday'
  | 'byday_empty'
  | 'exdate'
  | 'until_before_start'
  | 'no_occurrences'

export type RecurrenceError =
  | { readonly code: 'recurrence_unsupported'; readonly part: string }
  | { readonly code: 'recurrence_invalid'; readonly reason: RecurrenceInvalidReason }

export type RecurrenceResult =
  { readonly ok: true; readonly value: Recurrence } | { readonly ok: false; readonly error: RecurrenceError }

/** The standard text of a rule: the RRULE value and, when there are exceptions, an `EXDATE` line. */
export type SerializedRecurrence = { readonly rrule: string; readonly exdates: string | null }

const MAX_INTERVAL = 52
const MAX_COUNT = 1000
const COMPACT_DATE = /^(\d{4})(\d{2})(\d{2})$/
const ORDINAL_WEEKDAY = /^[+-]?\d{1,2}(MO|TU|WE|TH|FR|SA|SU)$/
const POSITIVE_INT = /^[1-9]\d*$/
/** A property line (`NAME:` or `NAME;`); an RRULE value starts with `NAME=` instead. */
const PROPERTY_LINE = /^[A-Z-]+[:;]/

const invalid = (reason: RecurrenceInvalidReason): RecurrenceResult => ({
  ok: false,
  error: { code: 'recurrence_invalid', reason },
})

const unsupported = (part: string): RecurrenceResult => ({ ok: false, error: { code: 'recurrence_unsupported', part } })

/** `20270630` → `2027-06-30`, or null when it is not a real date. */
function fromCompactDate(value: string): CalendarDate | null {
  const match = COMPACT_DATE.exec(value)
  if (!match) return null
  const date = `${String(match[1])}-${String(match[2])}-${String(match[3])}`
  return isCalendarDate(date) ? date : null
}

function toCompactDate(date: CalendarDate): string {
  return date.replaceAll('-', '')
}

function positiveInt(value: string, max: number): number | null {
  if (!POSITIVE_INT.test(value)) return null
  const parsed = Number(value)
  return parsed <= max ? parsed : null
}

/** Splits a stored text into its RRULE value and its EXDATE values; null when a line is not part of the subset. */
function splitLines(text: string): { rrule: string; exdates: string[] } | { unsupportedLine: string } {
  let rrule = ''
  const exdates: string[] = []
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (line.length === 0) continue
    const upper = line.toUpperCase()
    if (upper.startsWith('EXDATE')) {
      exdates.push(...line.slice(line.indexOf(':') + 1).split(','))
    } else if (upper.startsWith('RRULE:')) {
      rrule = line.slice('RRULE:'.length)
    } else if (PROPERTY_LINE.test(upper)) {
      // Another iCalendar property (`DTSTART:…`, `RDATE:…`): outside the subset.
      return { unsupportedLine: upper.split(/[:;]/)[0] as string }
    } else {
      rrule = line
    }
  }
  return { rrule, exdates }
}

function parseByDay(value: string): readonly Weekday[] | RecurrenceResult {
  const days = new Set<Weekday>()
  for (const token of value.split(',')) {
    const day = token.trim().toUpperCase()
    if (day.length === 0) continue
    if ((WEEKDAYS as readonly string[]).includes(day)) days.add(day as Weekday)
    else if (ORDINAL_WEEKDAY.test(day)) return unsupported('BYDAY')
    else return invalid('byday')
  }
  return WEEKDAYS.filter((day) => days.has(day))
}

function parseExdates(values: readonly string[], extra: readonly string[]): readonly CalendarDate[] | null {
  const dates = new Set<CalendarDate>()
  for (const raw of values) {
    const value = raw.trim()
    if (value.length === 0) continue
    const date = fromCompactDate(value)
    if (!date) return null
    dates.add(date)
  }
  for (const date of extra) {
    if (!isCalendarDate(date)) return null
    dates.add(date)
  }
  return [...dates].sort()
}

/**
 * Parses a stored rule: an RRULE value (optionally prefixed with `RRULE:`) and an optional `EXDATE:yyyymmdd,…` line,
 * plus exception dates (`YYYY-MM-DD`) given separately. A part outside the subset answers `recurrence_unsupported`
 * naming the part; a malformed value `recurrence_invalid` with its reason.
 */
function parse(text: string, exdates: readonly string[] = []): RecurrenceResult {
  const lines = splitLines(text)
  if ('unsupportedLine' in lines) return unsupported(lines.unsupportedLine)
  const parts = new Map<string, string>()
  for (const token of lines.rrule.split(';')) {
    if (token.trim().length === 0) continue
    const separator = token.indexOf('=')
    if (separator <= 0) return invalid('malformed')
    const name = token.slice(0, separator).trim().toUpperCase()
    if (parts.has(name)) return invalid('duplicate_part')
    parts.set(
      name,
      token
        .slice(separator + 1)
        .trim()
        .toUpperCase(),
    )
  }
  for (const [name, value] of parts) {
    if (name === 'FREQ' && value !== 'WEEKLY') return unsupported(`FREQ=${value}`)
    if (name === 'WKST' && value !== 'MO') return unsupported(`WKST=${value}`)
    if (!['FREQ', 'INTERVAL', 'BYDAY', 'UNTIL', 'COUNT', 'WKST'].includes(name)) return unsupported(name)
  }
  if (!parts.has('FREQ')) return invalid('freq_missing')
  const intervalText = parts.get('INTERVAL')
  const interval = intervalText === undefined ? 1 : positiveInt(intervalText, MAX_INTERVAL)
  if (interval === null) return invalid('interval')
  const countText = parts.get('COUNT')
  const count = countText === undefined ? null : positiveInt(countText, MAX_COUNT)
  if (count === null && countText !== undefined) return invalid('count')
  const untilText = parts.get('UNTIL')
  const until = untilText === undefined ? null : fromCompactDate(untilText)
  if (until === null && untilText !== undefined) return invalid('until')
  if (until !== null && count !== null) return invalid('until_and_count')
  const byDay = parseByDay(parts.get('BYDAY') ?? '')
  if (!Array.isArray(byDay)) return byDay as RecurrenceResult
  if (byDay.length === 0) return invalid('byday_empty')
  const exceptions = parseExdates(lines.exdates, exdates)
  if (!exceptions) return invalid('exdate')
  return { ok: true, value: { freq: 'WEEKLY', interval, byDay, until, count, exdates: exceptions } }
}

/** The standard text of a rule; `parse(toText(rule))` returns the same rule. */
function serialize(rule: Recurrence): SerializedRecurrence {
  const parts = [
    'FREQ=WEEKLY',
    ...(rule.interval > 1 ? [`INTERVAL=${String(rule.interval)}`] : []),
    `BYDAY=${rule.byDay.join(',')}`,
    ...(rule.until ? [`UNTIL=${toCompactDate(rule.until)}`] : []),
    ...(rule.count !== null ? [`COUNT=${String(rule.count)}`] : []),
  ]
  const exdates = rule.exdates.length > 0 ? `EXDATE:${rule.exdates.map(toCompactDate).join(',')}` : null
  return { rrule: parts.join(';'), exdates }
}

/** The single stored text: the RRULE value and the `EXDATE` line on a second line when there are exceptions. */
function toText(rule: Recurrence): string {
  const { rrule, exdates } = serialize(rule)
  return exdates ? `${rrule}\n${exdates}` : rrule
}

/** `recurrence_invalid` when the rule's end lies before its first day; null when the rule can start on `startsOn`. */
function checkStart(rule: Recurrence, startsOn: CalendarDate): RecurrenceError | null {
  if (rule.until !== null && rule.until < startsOn) return { code: 'recurrence_invalid', reason: 'until_before_start' }
  return null
}

export const Recurrence = { parse, serialize, toText, checkStart } as const

// --- Calendar arithmetic on `YYYY-MM-DD` (UTC midnight, so the host zone never matters) ---

const DAY_MS = 86_400_000

function utcOf(date: CalendarDate): number {
  return Date.parse(`${date}T00:00:00Z`)
}

/** The calendar date `days` after `date` (negative for before). */
export function addCalendarDays(date: CalendarDate, days: number): CalendarDate {
  return new Date(utcOf(date) + days * DAY_MS).toISOString().slice(0, 10)
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function calendarDaysBetween(from: CalendarDate, to: CalendarDate): number {
  return Math.round((utcOf(to) - utcOf(from)) / DAY_MS)
}

/** The RFC weekday of a calendar date. */
export function weekdayOf(date: CalendarDate): Weekday {
  // getUTCDay: 0 = Sunday; WEEKDAYS starts on Monday.
  return WEEKDAYS[(new Date(utcOf(date)).getUTCDay() + 6) % 7] as Weekday
}

/** The Monday of the week `date` falls in (`WKST=MO`). */
export function mondayOf(date: CalendarDate): CalendarDate {
  return addCalendarDays(date, -WEEKDAYS.indexOf(weekdayOf(date)))
}

// --- Wall time in the club zone ---

/** A local wall time `HH:mm` or `HH:mm:ss` (Postgres `time` reads back with seconds). */
export type LocalTime = string

const LOCAL_TIME = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/

export function isLocalTime(value: unknown): value is LocalTime {
  return typeof value === 'string' && LOCAL_TIME.test(value)
}

/** `17:00` → `17:00:00`; throws a `RangeError` on anything that is not a wall time. */
export function normalizeLocalTime(value: string): LocalTime {
  const match = LOCAL_TIME.exec(value)
  if (!match) throw new RangeError('[internal] a local time must be HH:mm or HH:mm:ss')
  return `${String(match[1])}:${String(match[2])}:${match[3] ?? '00'}`
}

/**
 * The instant of a wall time on a club-zone date (DD-G02). As RFC 5545 §3.3.5 reads local times: a wall time that
 * occurs twice on the autumn DST day is its first occurrence, and one that does not exist on the spring day is read
 * with the offset before the shift, so it moves forward by the gap (02:30 → 03:30 in `Europe/Warsaw`).
 */
export function zonedInstant(date: CalendarDate, time: LocalTime, timeZone: string): Date {
  const wall = Date.parse(`${date}T${normalizeLocalTime(time)}Z`)
  const offsetBefore = zoneOffset(timeZone, wall - 12 * 3_600_000)
  const offsetAfter = zoneOffset(timeZone, wall + 12 * 3_600_000)
  const readings = [wall - offsetBefore, wall - offsetAfter].filter(
    (instant) => zoneOffset(timeZone, instant) === wall - instant,
  )
  return new Date(readings.length > 0 ? Math.min(...readings) : wall - offsetBefore)
}

/**
 * The zone's UTC offset at an instant, in milliseconds, read from the wall time the zone shows then. (The library's
 * own `getTimezoneOffset` answers the pre-shift offset for the first hour after a spring shift.)
 */
function zoneOffset(timeZone: string, instant: number): number {
  return Date.parse(`${formatInTimeZone(instant, timeZone, "yyyy-MM-dd'T'HH:mm:ss")}Z`) - instant
}

// --- Expansion ---

export type ExpansionAnchor = {
  /** The first day of the series (club-zone date). */
  readonly startsOn: CalendarDate
  readonly startTime: LocalTime
  readonly endTime: LocalTime
  /** The club's IANA zone. */
  readonly timeZone: string
}

/** An inclusive window of club-zone dates. */
export type DateWindow = { readonly from: CalendarDate; readonly to: CalendarDate }

export type ExpandedOccurrence = { readonly date: CalendarDate; readonly startAt: Date; readonly endAt: Date }

/**
 * The session dates of a rule inside `window`: every `interval`-th week counted from the Monday of `startsOn`'s week
 * (`WKST=MO`), on the rule's weekdays, from `startsOn` to the inclusive `until`; `count` counts generated instances
 * from `startsOn` before the exceptions are removed (RFC 5545).
 */
export function occurrenceDates(rule: Recurrence, startsOn: CalendarDate, window: DateWindow): CalendarDate[] {
  const weekStart = mondayOf(startsOn)
  const last = rule.until !== null && rule.until < window.to ? rule.until : window.to
  const exceptions = new Set(rule.exdates)
  const dates: CalendarDate[] = []
  let generated = 0
  for (let date = startsOn; date <= last; date = addCalendarDays(date, 1)) {
    if (Math.floor(calendarDaysBetween(weekStart, date) / 7) % rule.interval !== 0) continue
    if (!rule.byDay.includes(weekdayOf(date))) continue
    if (rule.count !== null && generated >= rule.count) break
    generated += 1
    if (!exceptions.has(date) && date >= window.from) dates.push(date)
  }
  return dates
}

/** The instants of one session on a club-zone date; an end time not after the start ends on the next day. */
export function sessionInstants(
  date: CalendarDate,
  startTime: LocalTime,
  endTime: LocalTime,
  timeZone: string,
): ExpandedOccurrence {
  const endDate = normalizeLocalTime(endTime) > normalizeLocalTime(startTime) ? date : addCalendarDays(date, 1)
  return {
    date,
    startAt: zonedInstant(date, startTime, timeZone),
    endAt: zonedInstant(endDate, endTime, timeZone),
  }
}

/** The sessions of a rule inside `window`, at the anchor's wall times in the club zone (DD-G02). */
export function expandOccurrences(rule: Recurrence, anchor: ExpansionAnchor, window: DateWindow): ExpandedOccurrence[] {
  return occurrenceDates(rule, anchor.startsOn, window).map((date) =>
    sessionInstants(date, anchor.startTime, anchor.endTime, anchor.timeZone),
  )
}

// --- Series edits (DD-G03) ---

/** A stored session as the series-edit plan needs it. */
export type SeriesSession = {
  readonly id: string
  /** The series slot the session was generated for (club-zone date); a moved session keeps its slot. */
  readonly date: CalendarDate
  /** Moved or edited by hand: the series never changes it again. */
  readonly isDetached: boolean
  /**
   * The club has acted on the session — it is cancelled or done, or carries attendance or a substitution — so the
   * series never changes it.
   */
  readonly pinned: boolean
}

export type SeriesUpsert<T> = { readonly occurrence: ExpandedOccurrence; readonly existing: T | null }

export type SeriesEditPlan<T> = {
  /** Sessions left exactly as they are: past, detached or pinned. */
  readonly keep: readonly T[]
  /** Generated sessions to create (`existing` null) or to update in place, by slot date. */
  readonly upsert: readonly SeriesUpsert<T>[]
  /** Future generated sessions the rule no longer produces. */
  readonly remove: readonly T[]
}

/**
 * What a change of the series does to its stored sessions (DD-G03): past, detached and pinned sessions are kept and
 * their slot is not generated again; every other session is updated in place when the rule still produces its slot,
 * otherwise removed; slots without a session are created. `generated` holds the rule's sessions from `today` on.
 */
export function seriesEditPlan<T extends SeriesSession>(
  existing: readonly T[],
  generated: readonly ExpandedOccurrence[],
  today: CalendarDate,
): SeriesEditPlan<T> {
  const keep: T[] = []
  const movable = new Map<CalendarDate, T>()
  const extra: T[] = []
  for (const session of existing) {
    if (session.date < today || session.isDetached || session.pinned) keep.push(session)
    else if (movable.has(session.date)) extra.push(session)
    else movable.set(session.date, session)
  }
  const keptSlots = new Set(keep.map((session) => session.date))
  const upsert: SeriesUpsert<T>[] = []
  for (const occurrence of generated) {
    if (occurrence.date < today || keptSlots.has(occurrence.date)) continue
    upsert.push({ occurrence, existing: movable.get(occurrence.date) ?? null })
    movable.delete(occurrence.date)
  }
  return { keep, upsert, remove: [...movable.values(), ...extra] }
}
