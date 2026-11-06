// The `activities.publicSchedule` blocks of the public club pages (club spec DD-28, DD-29, REQ-025; #91). On a section
// page: for each public group, its regular days and times with the place (from the active series) and its next three
// sessions, a cancelled one marked as cancelled. On the club page: the upcoming one-off events of the public groups of
// the public sections (name, date, times, place, section, type). Pure: the service passes the rows, the place and
// section names and the club zone; no participant, roster or coach ever enters these blocks.
import { Recurrence, WEEKDAYS, type CalendarDate, type Weekday } from '@vereino/core'
import { localDateTime } from './activities-rules'

/** How many next sessions a group card shows (README P-02). */
export const UPCOMING_SESSIONS = 3

/** How many upcoming events the club page lists. */
export const UPCOMING_EVENTS = 10

/** A series of a public group as the service reads it. */
export type PublicSeriesRow = {
  id: string
  groupId: string
  recurrenceRule: string | null
  defaultStartTime: string
  defaultEndTime: string
  defaultPlaceId: string
}

/** A session of a public group or event as the service reads it, with its instants. */
export type PublicSessionRow = {
  activityId: string
  groupId: string
  startAt: Date
  endAt: Date
  placeId: string
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
    place: places.get(row.placeId) ?? null,
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
        place: places.get(row.defaultPlaceId) ?? null,
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

/** A one-off event as the service reads it: the activity and its section. */
export type PublicEventRow = { id: string; name: string; type: string; sectionId: string }

export type PublicEvent = PublicSession & {
  name: string
  type: string
  section: { name: string; slug: string }
}

export type PublicEventsBlock = { events: PublicEvent[] }

/**
 * The events block of the club page, or null without an upcoming event. `sessions` are the events' sessions in start
 * order (one each); an event of a section missing from `sections` (not public) is left out.
 */
export function publicEventsBlock(
  events: readonly PublicEventRow[],
  sessions: readonly PublicSessionRow[],
  sections: ReadonlyMap<string, { name: string; slug: string }>,
  places: ReadonlyMap<string, string>,
  timeZone: string,
): PublicEventsBlock | null {
  const byId = new Map(events.map((event) => [event.id, event]))
  const items: PublicEvent[] = []
  for (const session of sessions) {
    const event = byId.get(session.activityId)
    const section = event ? sections.get(event.sectionId) : undefined
    if (!event || !section || items.length >= UPCOMING_EVENTS) continue
    items.push({ ...publicSession(session, places, timeZone), name: event.name, type: event.type, section })
  }
  return items.length > 0 ? { events: items } : null
}
