// Pure rules of the facility zones and the bulk booking availability (facilities spec glossary *Zone*, *Booking
// availability*; REQ-013, REQ-029; #121). A zone rule is a weekly wall-clock window on a place with a zone, a priority
// and a validity period; overlapping rules are resolved by the higher priority, and two rules of equal priority may not
// overlap (409). Booking availability is a `reservable_paid` rule with source `availability` and priority 3, written in
// bulk. Nothing here reads the database or the clock (S3.5): dates are club-zone calendar dates the caller computed.
import {
  addDays,
  calendarDateInZone,
  isWallTime,
  minutesOfDay,
  periodsOverlap,
  isoWeekdayOf,
  windowFitsOpeningHours,
  type CalendarDate,
  type OpeningHours,
  type Validity,
  type WeeklyWindow,
} from '@vereino/core'

export const ZONES = ['public_free', 'club_training', 'reservable_paid', 'closed'] as const
export type Zone = (typeof ZONES)[number]

export const ZONE_SOURCES = ['regulations', 'availability'] as const
export type ZoneSource = (typeof ZONE_SOURCES)[number]

/** The priority of booking availability: above the rules derived from the facility regulations (1–2). */
export const AVAILABILITY_PRIORITY = 3

/** The shortest window an external renter can book: one 90-minute unit (§3 sec. 2). */
export const MIN_AVAILABILITY_MINUTES = 90

export const MAX_ZONE_PRIORITY = 9

/** The fields of a zone rule the rules below read. */
export type ZoneRuleShape = {
  readonly id?: string
  readonly placeId: string
  readonly weekdays: readonly number[]
  readonly timeFrom: string
  readonly timeTo: string
  readonly zone: Zone
  readonly priority: number
  readonly source: ZoneSource
  readonly validFrom: CalendarDate
  readonly validTo: CalendarDate | null
}

/** `HH:MM` of a stored `time` value (`HH:MM:SS` from the database). */
export function wallTimeOf(value: string): string {
  return value.slice(0, 5)
}

function periodOf(rule: Pick<ZoneRuleShape, 'validFrom' | 'validTo'>): Validity {
  return { validFrom: rule.validFrom, validTo: rule.validTo }
}

/** True when two rules share a place, a weekday, a minute of the day and a day of validity. */
export function zoneRulesOverlap(a: ZoneRuleShape, b: ZoneRuleShape): boolean {
  if (a.placeId !== b.placeId) return false
  if (!a.weekdays.some((weekday) => b.weekdays.includes(weekday))) return false
  const overlapInDay =
    minutesOfDay(wallTimeOf(a.timeFrom)) < minutesOfDay(wallTimeOf(b.timeTo)) &&
    minutesOfDay(wallTimeOf(b.timeFrom)) < minutesOfDay(wallTimeOf(a.timeTo))
  return overlapInDay && periodsOverlap(periodOf(a), periodOf(b))
}

/** The existing rule a candidate may not overlap (equal priority), or null (409 `zone_rule_overlap`). */
export function conflictingZoneRule<T extends ZoneRuleShape>(
  candidate: ZoneRuleShape,
  existing: readonly T[],
): T | null {
  return (
    existing.find(
      (rule) => rule.id !== candidate.id && rule.priority === candidate.priority && zoneRulesOverlap(candidate, rule),
    ) ?? null
  )
}

/** Why a zone rule's times or weekdays are not valid, or null (422 `zone_rule_times_invalid`). */
export function zoneRuleShapeProblem(rule: Pick<ZoneRuleShape, 'weekdays' | 'timeFrom' | 'timeTo'>): string | null {
  if (rule.weekdays.length === 0) return 'weekdays_empty'
  if (!isWallTime(wallTimeOf(rule.timeFrom)) || !isWallTime(wallTimeOf(rule.timeTo))) return 'time_malformed'
  if (minutesOfDay(wallTimeOf(rule.timeFrom)) >= minutesOfDay(wallTimeOf(rule.timeTo))) return 'time_inverted'
  return null
}

/** True when the rule is in force on a date (validity and weekday). */
export function ruleAppliesOn(rule: ZoneRuleShape, date: CalendarDate): boolean {
  return (
    rule.validFrom <= date &&
    (rule.validTo === null || date <= rule.validTo) &&
    rule.weekdays.includes(isoWeekdayOf(date))
  )
}

/** A stretch of one day with one effective zone (the week preview, the public calendar later). */
export type ZoneSegment = {
  readonly from: string
  readonly to: string
  readonly zone: Zone
  readonly ruleId: string | null
}

function timeOfMinutes(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

/**
 * The effective zones of a place on a date: at every minute the rule in force with the highest priority wins; adjacent
 * stretches of the same rule are merged; minutes no rule covers are absent. Equal priorities cannot overlap (409 on
 * save), so ties never decide.
 */
export function dayZoneSegments(rules: readonly ZoneRuleShape[], date: CalendarDate): ZoneSegment[] {
  const active = rules.filter((rule) => ruleAppliesOn(rule, date))
  const bounds = [
    ...new Set(
      active.flatMap((rule) => [minutesOfDay(wallTimeOf(rule.timeFrom)), minutesOfDay(wallTimeOf(rule.timeTo))]),
    ),
  ].sort((a, b) => a - b)
  const segments: ZoneSegment[] = []
  for (let index = 0; index < bounds.length - 1; index += 1) {
    const start = bounds[index]
    const end = bounds[index + 1]
    const winner = active
      .filter(
        (rule) => minutesOfDay(wallTimeOf(rule.timeFrom)) <= start && end <= minutesOfDay(wallTimeOf(rule.timeTo)),
      )
      .sort((a, b) => b.priority - a.priority)
      .at(0)
    if (!winner) continue
    const previous = segments.at(-1)
    if (previous && previous.to === timeOfMinutes(start) && previous.ruleId === (winner.id ?? null)) {
      segments[segments.length - 1] = { ...previous, to: timeOfMinutes(end) }
    } else {
      segments.push({
        from: timeOfMinutes(start),
        to: timeOfMinutes(end),
        zone: winner.zone,
        ruleId: winner.id ?? null,
      })
    }
  }
  return segments
}

/** The seven dates of the ISO week (Monday first) that contains `date`. */
export function weekDates(date: CalendarDate): CalendarDate[] {
  const monday = addDays(date, 1 - isoWeekdayOf(date))
  return [0, 1, 2, 3, 4, 5, 6].map((offset) => addDays(monday, offset))
}

// --- Bulk booking availability (REQ-029) ---

export type AvailabilityWindowProblem = 'time_order' | 'too_short' | 'outside_opening_hours'

/**
 * Why one window of a bulk availability cannot be saved for a place (422 per day): "to" not after "from", shorter than
 * 90 minutes, or outside the place's opening hours over the period.
 */
export function availabilityWindowProblem(
  window: WeeklyWindow,
  hours: OpeningHours | null,
  period: Validity,
): AvailabilityWindowProblem | null {
  const start = minutesOfDay(window.from)
  const end = minutesOfDay(window.to)
  if (end <= start) return 'time_order'
  if (end - start < MIN_AVAILABILITY_MINUTES) return 'too_short'
  if (!windowFitsOpeningHours(hours, window, period)) return 'outside_opening_hours'
  return null
}

/** The rules a bulk availability creates for one place: one per distinct `from`–`to`, with the weekdays that share it. */
export function availabilityRules(
  placeId: string,
  windows: readonly WeeklyWindow[],
  period: Validity,
): ZoneRuleShape[] {
  const byTimes = new Map<string, number[]>()
  for (const window of windows) {
    const key = `${window.from}-${window.to}`
    const weekdays = byTimes.get(key) ?? []
    if (!weekdays.includes(window.weekday)) weekdays.push(window.weekday)
    byTimes.set(key, weekdays)
  }
  return [...byTimes.entries()].map(([key, weekdays]) => {
    const [timeFrom, timeTo] = key.split('-') as [string, string]
    return {
      placeId,
      weekdays: [...weekdays].sort((a, b) => a - b),
      timeFrom,
      timeTo,
      zone: 'reservable_paid',
      priority: AVAILABILITY_PRIORITY,
      source: 'availability',
      validFrom: period.validFrom,
      validTo: period.validTo,
    }
  })
}

/** What "replace" does to one existing availability rule: keep it, or remove it and write the fragments instead. */
export type ReplacePlan =
  { readonly replaced: false } | { readonly replaced: true; readonly fragments: ZoneRuleShape[] }

/**
 * "Replace" mode on one existing availability rule (REQ-029): the selected weekdays are removed from it for the days the
 * new period covers. The rule is split into the part before the period (all its weekdays), the overlapping part
 * without the selected weekdays, and the part after the period (all its weekdays); empty parts are dropped. A rule of
 * another source, on other weekdays or outside the period is kept.
 */
export function replaceAvailabilityPlan(
  rule: ZoneRuleShape,
  weekdays: readonly number[],
  period: Validity,
): ReplacePlan {
  if (rule.source !== 'availability') return { replaced: false }
  if (!rule.weekdays.some((weekday) => weekdays.includes(weekday))) return { replaced: false }
  if (!periodsOverlap(periodOf(rule), period)) return { replaced: false }
  const fragments: ZoneRuleShape[] = []
  const base = { ...rule, id: undefined }
  if (rule.validFrom < period.validFrom) {
    fragments.push({ ...base, validTo: addDays(period.validFrom, -1) })
  }
  const remaining = rule.weekdays.filter((weekday) => !weekdays.includes(weekday))
  if (remaining.length > 0) {
    const from = rule.validFrom > period.validFrom ? rule.validFrom : period.validFrom
    const to =
      rule.validTo === null
        ? period.validTo
        : period.validTo === null || rule.validTo < period.validTo
          ? rule.validTo
          : period.validTo
    fragments.push({ ...base, weekdays: remaining, validFrom: from, validTo: to })
  }
  if (period.validTo !== null && (rule.validTo === null || rule.validTo > period.validTo)) {
    fragments.push({ ...base, validFrom: addDays(period.validTo, 1) })
  }
  return { replaced: true, fragments }
}

/** A session as the availability warning reads it: its club-zone date and wall times. */
export type LocalSession = { readonly date: CalendarDate; readonly from: string; readonly to: string }

/** How many sessions fall into the new availability windows on their weekday within the period (a warning only). */
export function sessionsInWindows(
  sessions: readonly LocalSession[],
  windows: readonly WeeklyWindow[],
  period: Validity,
): number {
  return sessions.filter((session) => {
    if (session.date < period.validFrom || (period.validTo !== null && session.date > period.validTo)) return false
    const weekday = isoWeekdayOf(session.date)
    return windows.some(
      (window) =>
        window.weekday === weekday &&
        minutesOfDay(session.from) < minutesOfDay(window.to) &&
        minutesOfDay(window.from) < minutesOfDay(session.to),
    )
  }).length
}

/** The wall time `HH:MM` an instant shows in a time zone. */
function wallTimeInZone(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant)
  const byType = Object.fromEntries(parts.map((entry) => [entry.type, entry.value])) as Record<string, string>
  return `${byType.hour}:${byType.minute}`
}

/**
 * A session's club-zone date and wall times, for `sessionsInWindows`. A session that ends on a later day (past
 * midnight) counts until the end of its first day.
 */
export function localSessionOf(startAt: Date, endAt: Date, timeZone: string): LocalSession {
  const date = calendarDateInZone(startAt, timeZone)
  const sameDay = calendarDateInZone(endAt, timeZone) === date
  return { date, from: wallTimeInZone(startAt, timeZone), to: sameDay ? wallTimeInZone(endAt, timeZone) : '24:00' }
}
