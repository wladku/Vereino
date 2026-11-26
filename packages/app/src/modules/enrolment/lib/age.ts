// The age rules of an application (sign-up form spec DD-J03, DD-J04, BR-J2, REQ-J05, REQ-J06; #799): the reference
// date a day's applications count ages on, the hard limits of the form and the age fit of the chosen group. Pure and
// client-safe: the form computes its hint in the browser with this code and the server checks it again.
import { addDays, ageOn, fitsRule, isCalendarDate, type CalendarDate, type FitRule } from '@vereino/core'
import type { AgeFit, ApplicationKind } from './states'

/** The default reference day of a club (`MM-DD`, 1 September). */
export const DEFAULT_REFERENCE_DAY = '09-01'

/** Applications count for the coming season this many days ahead (DD-J03, Q-J02). */
export const REFERENCE_LOOKAHEAD_DAYS = 60

/** A child is 3–17 on the reference date; an adult 18 or older (BR-J2). */
export const CHILD_AGE_RANGE = { min: 3, max: 17 } as const
export const ADULT_MIN_AGE = 18

const MONTH_DAY_PATTERN = /^(\d{2})-(\d{2})$/

/** The stored reference day when it is a real `MM-DD` (29 February allowed), else null. */
export function parseReferenceDay(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const match = MONTH_DAY_PATTERN.exec(value)
  if (!match) return null
  return isCalendarDate(`2000-${value}`) ? value : null
}

/** The reference day's date in `year`; 29 February falls back to 28 February in a common year. */
function onYear(year: number, monthDay: string): CalendarDate {
  const date = `${String(year).padStart(4, '0')}-${monthDay}`
  return isCalendarDate(date) ? date : `${String(year).padStart(4, '0')}-02-28`
}

/**
 * DD-J03: the latest occurrence of the club's reference day (`MM-DD`, an invalid value reads as 1 September) on or
 * before `day` + 60 days.
 */
export function ageReferenceDate(day: CalendarDate, referenceDay: string): CalendarDate {
  const monthDay = parseReferenceDay(referenceDay) ?? DEFAULT_REFERENCE_DAY
  const limit = addDays(day, REFERENCE_LOOKAHEAD_DAYS)
  const year = Number(limit.slice(0, 4))
  const candidate = onYear(year, monthDay)
  return candidate <= limit ? candidate : onYear(year - 1, monthDay)
}

export type AgeLimitIssue = 'birth_date_future' | 'age_out_of_bounds'

/**
 * BR-J2: a birth date in the future, or a participant outside the kind's ages (a child 3–17 on the reference date; an
 * adult 18 or older on the reference date and on `today`); null when the birth date passes.
 */
export function ageLimitIssue(
  kind: ApplicationKind,
  birthDate: CalendarDate,
  referenceDate: CalendarDate,
  today: CalendarDate,
): AgeLimitIssue | null {
  if (birthDate > today) return 'birth_date_future'
  const age = ageOn(birthDate, referenceDate)
  if (kind === 'child') {
    return age >= CHILD_AGE_RANGE.min && age <= CHILD_AGE_RANGE.max ? null : 'age_out_of_bounds'
  }
  return age >= ADULT_MIN_AGE && ageOn(birthDate, today) >= ADULT_MIN_AGE ? null : 'age_out_of_bounds'
}

/**
 * The age fit of a group (REQ-J05/REQ-J06): `fits` or `outside` by the group's rule on the reference date; `unknown`
 * for "choose a group for us" (no rule) or a group without one.
 */
export function ageFitOf(birthDate: CalendarDate, referenceDate: CalendarDate, rule: FitRule | null): AgeFit {
  const fits = fitsRule(birthDate, referenceDate, rule)
  if (fits === null) return 'unknown'
  return fits ? 'fits' : 'outside'
}

/** The age in full years on the reference date, as the form and the coordinator show it. */
export function ageOnReference(birthDate: CalendarDate, referenceDate: CalendarDate): number {
  return ageOn(birthDate, referenceDate)
}
