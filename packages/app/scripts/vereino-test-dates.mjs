// Date-safe days for the integration tests (merge throughput spec MT-D05, MT-TEST-04; lesson
// `integration-tests-pick-days-two-days-ahead`). The app reads the real clock, so a test that declares on today's
// session, books a slot tomorrow or cancels a rental inside its 24-hour deadline passes or fails with the hour of the
// run (TEST-L03, #390: a Wednesday 17:00 session declared on after 17:00 answered 409 `declaration_closed`). A day at
// least two calendar days ahead starts more than 24 hours after any moment of today, whatever the hour or time zone.
// Pure calendar arithmetic on `YYYY-MM-DD` strings; the fixture `safeDay` in `.ai/qa/tests/_fixtures/activities.ts`
// passes the club's today (`calendarDate()`).

export const WEEKDAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']
export const MIN_DAYS_AHEAD = 2

const DAY_MS = 86_400_000
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

/**
 * True when `value` is a real calendar date written as `YYYY-MM-DD` (rejects `2026-02-30`).
 * @param {unknown} value
 * @returns {boolean}
 */
export function isCalendarDate(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false
  const parsed = Date.parse(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed) && new Date(parsed).toISOString().slice(0, 10) === value
}

/**
 * `date` plus `days` calendar days (no time zone involved).
 * @param {string} date
 * @param {number} days
 * @returns {string}
 */
export function shiftDate(date, days) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10)
}

/**
 * The weekday code (`MO` … `SU`) of `date`.
 * @param {string} date
 * @returns {string}
 */
export function weekdayCodeOf(date) {
  return WEEKDAY_CODES[new Date(`${date}T00:00:00Z`).getUTCDay()]
}

/**
 * The first day at least `minDaysAhead` days after `today`, on `weekday` when given — never today or tomorrow.
 * @param {string} today the club's calendar date, `YYYY-MM-DD`
 * @param {string} [weekday] a weekday code (`MO` … `SU`)
 * @param {number} [minDaysAhead] whole days, at least 2
 * @returns {string}
 */
export function safeDayAfter(today, weekday, minDaysAhead = MIN_DAYS_AHEAD) {
  if (!isCalendarDate(today)) throw new RangeError(`[test] today must be a YYYY-MM-DD date: ${String(today)}`)
  if (weekday !== undefined && !WEEKDAY_CODES.includes(weekday)) {
    throw new RangeError(`[test] unknown weekday code: ${String(weekday)}`)
  }
  if (!Number.isInteger(minDaysAhead) || minDaysAhead < MIN_DAYS_AHEAD) {
    throw new RangeError(`[test] minDaysAhead must be a whole number of at least ${String(MIN_DAYS_AHEAD)}`)
  }
  let day = shiftDate(today, minDaysAhead)
  if (weekday !== undefined) while (weekdayCodeOf(day) !== weekday) day = shiftDate(day, 1)
  return day
}
