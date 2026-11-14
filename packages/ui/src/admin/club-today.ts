// The club's "today" in the browser (#231): club calendar dates (validity, payment and report dates) are days in the
// club time zone (S3.5), so a page compares them with the date of the current instant in that zone, never with the
// browser's local date — between 22:00 and 24:00 UTC a runner or a traveller is on another day than the club. Pure:
// the caller passes the instant and the zone; `useClubToday` (`club-today-context.tsx`) passes the zone the page
// provides.
import { calendarDateInZone, type CalendarDate } from '@vereino/core'

/** The browser's own IANA time zone, the fallback while a page provides no club zone. */
export function browserTimeZone(): string {
  return new Intl.DateTimeFormat().resolvedOptions().timeZone
}

/**
 * The calendar date of `now` in the club zone `timeZone`; in the browser's zone when the zone is missing or not a
 * zone the runtime knows (a page outside a club, or a stale setting), so the page still gets a date.
 */
export function clubToday(now: Date, timeZone: string | null): CalendarDate {
  if (timeZone) {
    try {
      return calendarDateInZone(now, timeZone)
    } catch {
      // An unknown zone falls through to the browser's.
    }
  }
  return calendarDateInZone(now, browserTimeZone())
}

/** The month (`YYYY-MM`) of a calendar date: the period a monthly form proposes for the club's today. */
export function monthOf(date: CalendarDate): string {
  return date.slice(0, 7)
}
