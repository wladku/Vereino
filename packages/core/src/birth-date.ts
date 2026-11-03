// Birth-date checks for the person form: a real calendar date, not after today and not more than MAX_AGE_YEARS
// ago. `today` is the caller's calendar date (S3.5: time is a parameter).
import { assertCalendarDate, isCalendarDate, type CalendarDate } from '#src/calendar-date'

export const MAX_AGE_YEARS = 120

export type BirthDateProblem = 'malformed' | 'future' | 'too_old'

export type BirthDateBounds = { readonly min: CalendarDate; readonly max: CalendarDate }

/** The earliest and latest birth date accepted on `today`; 29 February falls back to 28 February. */
export function birthDateBounds(today: CalendarDate): BirthDateBounds {
  assertCalendarDate(today, 'today')
  const year = String(Number(today.slice(0, 4)) - MAX_AGE_YEARS).padStart(4, '0')
  const sameDay = `${year}${today.slice(4)}`
  return { min: isCalendarDate(sameDay) ? sameDay : `${year}-02-28`, max: today }
}

/** Why `value` is not an acceptable birth date on `today`, or `null` when it is. An empty value is not checked here. */
export function birthDateProblem(value: string, today: CalendarDate): BirthDateProblem | null {
  if (!isCalendarDate(value)) return 'malformed'
  const { min, max } = birthDateBounds(today)
  if (value > max) return 'future'
  if (value < min) return 'too_old'
  return null
}
