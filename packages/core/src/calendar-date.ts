// Calendar dates (`YYYY-MM-DD`, engineering standards S6.5) as plain strings. The caller converts an
// instant to a date in the club time zone; everything here compares dates only (S3.5: time is a parameter).

/** A calendar date `YYYY-MM-DD`. ISO dates of equal length order lexicographically, so `<` compares them. */
export type CalendarDate = string

const CALENDAR_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

/** True when `value` is a real calendar date written as `YYYY-MM-DD` (rejects `2026-02-30`). */
export function isCalendarDate(value: unknown): value is CalendarDate {
  if (typeof value !== 'string') return false
  const match = CALENDAR_DATE_PATTERN.exec(value)
  if (!match) return false
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const probe = new Date(Date.UTC(year, month - 1, day))
  return probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day
}

/** Throws a `RangeError` naming `label` unless `value` is a calendar date. */
export function assertCalendarDate(value: unknown, label: string): asserts value is CalendarDate {
  if (!isCalendarDate(value)) throw new RangeError(`[internal] ${label} must be a YYYY-MM-DD calendar date`)
}

/**
 * The calendar date (`YYYY-MM-DD`) of the instant `now` in the IANA time zone `timeZone` — the club's "today" (S3.5:
 * the caller passes the instant). Shared by `people` and `groups`.
 */
export function calendarDateInZone(now: Date, timeZone: string): CalendarDate {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const byType = Object.fromEntries(parts.map((entry) => [entry.type, entry.value])) as Record<string, string>
  return `${String(byType.year)}-${String(byType.month)}-${String(byType.day)}`
}
