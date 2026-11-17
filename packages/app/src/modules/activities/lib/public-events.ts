// The `activities.publicEvents` lists of the public Events page P-06 (navigation spec REQ-N13, mock-up
// `screenPublicEvents`; #263): the one-off activities (matches, sparrings, tournaments, camps) of public groups in public
// sections. "Upcoming": the event ends today or later, soonest first. "Past": it ended before today and started at most
// 60 days ago, newest first. Each event carries its club-zone dates and times, its place, a map link for an external
// venue, its section and its type. Pure: the service passes the rows, the places, the sections and the club day; no
// participant, roster or coach ever enters these lists.
import { addCalendarDays, type CalendarDate } from '@vereino/core'
import { localDateTime } from './activities-rules'
import { shortTime, type PublicSessionRow } from './public-schedule'
import { placeMapHref, venueLocation } from './venue'

/** How far back "Past" reaches (README P-06, "Past (last 60 days)"). */
export const PAST_EVENT_DAYS = 60

/** The most events one list carries. */
export const PUBLIC_EVENTS_LIMIT = 50

/** A one-off activity as the service reads it, with its section. */
export type PublicEventActivityRow = { id: string; name: string; type: string; sectionId: string }

/** A place as the service reads it: an external venue gets a map link (from its pin, else its address). */
export type PublicEventPlace = {
  name: string
  isExternal: boolean
  address: string | null
  geoLat: number | null
  geoLng: number | null
}

export type PublicEventItem = {
  name: string
  type: string
  /** Club-zone start and end dates (a camp ends days later) and `HH:mm` times. */
  date: CalendarDate
  endDate: CalendarDate
  startTime: string
  endTime: string
  place: string | null
  /** Only for an external venue with a pin or an address. */
  mapUrl: string | null
  cancelled: boolean
  past: boolean
  /** The public section's slug; `club_core` adds its name and logo. */
  sectionSlug: string
}

export type PublicEventLists = { upcoming: PublicEventItem[]; past: PublicEventItem[] }

/** The first day "Past" still shows: 60 days before the club day. */
export function pastEventsFrom(today: CalendarDate): CalendarDate {
  return addCalendarDays(today, -PAST_EVENT_DAYS)
}

/** An OpenStreetMap link to an external venue: its pin, else a search for its address; null for a club place. */
export function publicMapUrl(place: PublicEventPlace): string | null {
  if (!place.isExternal) return null
  if (place.geoLat !== null && place.geoLng !== null) {
    const lat = String(place.geoLat)
    const lng = String(place.geoLng)
    return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`
  }
  const address = place.address?.trim()
  return address ? `https://www.openstreetmap.org/search?query=${encodeURIComponent(address)}` : null
}

/**
 * The two lists of P-06. `sessions` are the events' sessions in start order (one each; a later one of the same event
 * is ignored); an event of a section missing from `sectionSlugs` (not public, or filtered out) is left out. Each list
 * keeps at most `PUBLIC_EVENTS_LIMIT` events.
 */
export function publicEventLists(
  events: readonly PublicEventActivityRow[],
  sessions: readonly PublicSessionRow[],
  sectionSlugs: ReadonlyMap<string, string>,
  places: ReadonlyMap<string, PublicEventPlace>,
  timeZone: string,
  today: CalendarDate,
): PublicEventLists {
  const byId = new Map(events.map((event) => [event.id, event]))
  const seen = new Set<string>()
  const upcoming: PublicEventItem[] = []
  const past: PublicEventItem[] = []
  const from = pastEventsFrom(today)
  for (const session of sessions) {
    const event = byId.get(session.activityId)
    const sectionSlug = event ? sectionSlugs.get(event.sectionId) : undefined
    if (!event || sectionSlug === undefined || seen.has(event.id)) continue
    seen.add(event.id)
    const start = localDateTime(session.startAt, timeZone)
    const end = localDateTime(session.endAt, timeZone)
    const isPast = end.date < today
    if (isPast && start.date < from) continue
    // REQ-A08: a typed venue is outside the club, so it always gets a map search by its name and address.
    const venue = session.venue ?? null
    const place = !venue && session.placeId ? places.get(session.placeId) : undefined
    const item: PublicEventItem = {
      name: event.name,
      type: event.type,
      date: start.date,
      endDate: end.date,
      startTime: shortTime(start.time),
      endTime: shortTime(end.time),
      place: venue?.name ?? place?.name ?? null,
      mapUrl: venue ? placeMapHref(venueLocation(venue)) : place ? publicMapUrl(place) : null,
      cancelled: session.status === 'cancelled',
      past: isPast,
      sectionSlug,
    }
    if (isPast) past.push(item)
    else upcoming.push(item)
  }
  return { upcoming: upcoming.slice(0, PUBLIC_EVENTS_LIMIT), past: past.reverse().slice(0, PUBLIC_EVENTS_LIMIT) }
}
