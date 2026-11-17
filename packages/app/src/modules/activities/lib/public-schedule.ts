// The `activities.publicSchedule` block of a public section page (club spec DD-28, DD-29, REQ-025; #91): for each
// public group, its regular days and times with the place (from the active series) and its next three sessions, a
// cancelled one marked as cancelled. The club's one-off events moved to their own page P-06 (`public-events.ts`, #263).
// Pure: the service passes the rows, the place names and the club zone; no participant, roster or coach ever enters
// this block.
import { Recurrence, WEEKDAYS, type CalendarDate, type Weekday } from '@vereino/core'
import { localDateTime } from './activities-rules'
import type { TypedVenue } from './venue'

/** How many next sessions a group card shows (README P-02). */
export const UPCOMING_SESSIONS = 3

/** A series of a public group as the service reads it. */
export type PublicSeriesRow = {
  id: string
  groupId: string
  recurrenceRule: string | null
  defaultStartTime: string
  defaultEndTime: string
  /** A series always has a club place; null only for a one-off at a typed venue (REQ-A08). */
  defaultPlaceId: string | null
}

/** A session of a public group or event as the service reads it, with its instants. */
export type PublicSessionRow = {
  activityId: string
  groupId: string
  startAt: Date
  endAt: Date
  /** Null at a typed venue (REQ-A08). */
  placeId: string | null
  /** The typed venue of a one-off event (REQ-A08); absent or null at a club place. */
  venue?: TypedVenue | null
  status: string
}

export type PublicSeries = { weekdays: Weekday[]; startTime: string; endTime: string; place: string | null }

export type PublicSession = {
  date: CalendarDate
  startTime: string
  endTime: string
  place: string | null
  cancelled: boolean
}

export type PublicGroupSchedule = { groupId: string; series: PublicSeries[]; upcoming: PublicSession[] }

export type PublicScheduleBlock = { groups: PublicGroupSchedule[] }

/** `HH:mm` of a stored `HH:mm[:ss]` time. */
export function shortTime(time: string): string {
  return time.slice(0, 5)
}

/** The weekdays of a stored rule in `WEEKDAYS` order; none for a one-off activity or an unreadable rule. */
export function seriesWeekdays(rule: string | null): Weekday[] {
  if (!rule) return []
  const parsed = Recurrence.parse(rule)
  if (!parsed.ok) return []
  return WEEKDAYS.filter((day) => parsed.value.byDay.includes(day))
}

/** The name a guest sees for a session's location: its typed venue, else its club place; null when unknown. */
export function sessionPlaceName(row: PublicSessionRow, places: ReadonlyMap<string, string>): string | null {
  if (row.venue) return row.venue.name
  return row.placeId ? (places.get(row.placeId) ?? null) : null
}

/** A session as a guest sees it: the club-zone date, times and place, and whether it is cancelled. */
export function publicSession(
  row: PublicSessionRow,
  places: ReadonlyMap<string, string>,
  timeZone: string,
): PublicSession {
  const start = localDateTime(row.startAt, timeZone)
  const end = localDateTime(row.endAt, timeZone)
  return {
    date: start.date,
    startTime: shortTime(start.time),
    endTime: shortTime(end.time),
    place: sessionPlaceName(row, places),
    cancelled: row.status === 'cancelled',
  }
}

/** Series in week order: by their first weekday, then by their start time. */
function bySeriesOrder(a: PublicSeries, b: PublicSeries): number {
  return WEEKDAYS.indexOf(a.weekdays[0]) - WEEKDAYS.indexOf(b.weekdays[0]) || a.startTime.localeCompare(b.startTime)
}

/**
 * The schedule block of a section page, or null when no public group has a series or an upcoming session. `groupIds`
 * are the public groups in page order; `sessions` are their future sessions of those series, in start order.
 */
export function publicScheduleBlock(
  groupIds: readonly string[],
  series: readonly PublicSeriesRow[],
  sessions: readonly PublicSessionRow[],
  places: ReadonlyMap<string, string>,
  timeZone: string,
): PublicScheduleBlock | null {
  const groups: PublicGroupSchedule[] = []
  for (const groupId of groupIds) {
    const own = series
      .filter((row) => row.groupId === groupId)
      .map((row) => ({
        weekdays: seriesWeekdays(row.recurrenceRule),
        startTime: shortTime(row.defaultStartTime),
        endTime: shortTime(row.defaultEndTime),
        place: row.defaultPlaceId ? (places.get(row.defaultPlaceId) ?? null) : null,
      }))
      .filter((row) => row.weekdays.length > 0)
      .sort(bySeriesOrder)
    const upcoming = sessions
      .filter((row) => row.groupId === groupId)
      .slice(0, UPCOMING_SESSIONS)
      .map((row) => publicSession(row, places, timeZone))
    if (own.length > 0 || upcoming.length > 0) groups.push({ groupId, series: own, upcoming })
  }
  return groups.length > 0 ? { groups } : null
}
