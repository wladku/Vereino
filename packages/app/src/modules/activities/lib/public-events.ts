// The `activities.publicEvents` lists of the public Events page P-06 (navigation spec REQ-N13, mock-up
// `screenPublicEvents`; #263): the one-off activities (matches, sparrings, tournaments, camps) of public groups in public
// sections. "Upcoming": the event ends today or later, soonest first. "Past": it ended before today and started at most
// 60 days ago, newest first. Each event carries its club-zone dates and times, its place, a map link for an external
// venue, its section and its type. A published club event with a live part is one entry of its own (club events spec
// REQ-T10, DD-T12; #381): its name, the span of its parts, its place, the number of its parts and its poster; its parts
// are never listed one by one. Pure: the service passes the rows, the places, the sections and the club day; no
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
  kind: 'event' | 'club_event'
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
  /** The public section's slug; `club_core` adds its name and logo. Null: the club's (a whole-club event). */
  sectionSlug: string | null
  /** A club event's public slug, its number of live parts and its poster file; null for a one-off event. */
  clubEventSlug: string | null
  partsCount: number | null
  posterFileId: string | null
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
      kind: 'event',
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
      clubEventSlug: null,
      partsCount: null,
      posterFileId: null,
    }
    if (isPast) past.push(item)
    else upcoming.push(item)
  }
  return { upcoming: upcoming.slice(0, PUBLIC_EVENTS_LIMIT), past: past.reverse().slice(0, PUBLIC_EVENTS_LIMIT) }
}

// --- Club events on P-06 (club events spec REQ-T10, DD-T12, TEST-T10; #381) ---

/** A published club event as the service reads it. */
export type PublicClubEventRow = {
  id: string
  name: string
  slug: string
  /** Null: a whole-club event. */
  sectionId: string | null
  placeId: string
  status: string
}

/** One live part of a club event: its span (its session's, or an open part's own) and its group (null: open part). */
export type PublicClubEventSpan = { clubEventId: string; startAt: Date; endAt: Date; groupId: string | null }

export type PublicClubEventEntryInput = {
  events: readonly PublicClubEventRow[]
  spans: readonly PublicClubEventSpan[]
  /** The live poster file of each event, by event id. */
  posters: ReadonlyMap<string, string>
  /** The public sections the page shows: id → slug. */
  sectionSlugs: ReadonlyMap<string, string>
  /** The public groups of those sections. */
  publicGroupIds: ReadonlySet<string>
  /** Whether `?section=` narrowed the page to one section. */
  filtered: boolean
  places: ReadonlyMap<string, PublicEventPlace>
  timeZone: string
  today: CalendarDate
}

/**
 * The section slug a club event's entry carries, or undefined when the page leaves it out: an event of a section shown
 * on the page carries its slug; unfiltered, an event of a section that is not public and a whole-club event carry null
 * (the club's); filtered, an event of another section is left out and a whole-club event is listed only when one of
 * its parts is a public group of the shown section.
 */
function clubEventSection(
  event: PublicClubEventRow,
  spans: readonly PublicClubEventSpan[],
  input: PublicClubEventEntryInput,
): string | null | undefined {
  if (event.sectionId) {
    const slug = input.sectionSlugs.get(event.sectionId)
    if (slug !== undefined) return slug
    return input.filtered ? undefined : null
  }
  if (!input.filtered) return null
  return spans.some((span) => span.groupId !== null && input.publicGroupIds.has(span.groupId)) ? null : undefined
}

/**
 * One entry per published club event with at least one live part: the span from its first part's start to its last
 * part's end, "past" once that end is before today and kept while the first part started at most 60 days ago (the
 * rule of a single event); the place with a map link only for an external one; cancelled with the event.
 */
export function publicClubEventItems(input: PublicClubEventEntryInput): PublicEventItem[] {
  const from = pastEventsFrom(input.today)
  const items: PublicEventItem[] = []
  for (const event of input.events) {
    const spans = input.spans.filter((span) => span.clubEventId === event.id)
    if (spans.length === 0) continue
    const sectionSlug = clubEventSection(event, spans, input)
    if (sectionSlug === undefined) continue
    const startAt = new Date(Math.min(...spans.map((span) => span.startAt.getTime())))
    const endAt = new Date(Math.max(...spans.map((span) => span.endAt.getTime())))
    const start = localDateTime(startAt, input.timeZone)
    const end = localDateTime(endAt, input.timeZone)
    const isPast = end.date < input.today
    if (isPast && start.date < from) continue
    const place = input.places.get(event.placeId)
    items.push({
      kind: 'club_event',
      name: event.name,
      type: 'club_event',
      date: start.date,
      endDate: end.date,
      startTime: shortTime(start.time),
      endTime: shortTime(end.time),
      place: place?.name ?? null,
      mapUrl: place ? publicMapUrl(place) : null,
      cancelled: event.status === 'cancelled',
      past: isPast,
      sectionSlug,
      clubEventSlug: event.slug,
      partsCount: spans.length,
      posterFileId: input.posters.get(event.id) ?? null,
    })
  }
  return items
}

const startKey = (item: PublicEventItem): string => `${item.date} ${item.startTime}`

/**
 * The one-off events' lists with the club event entries added: "Upcoming" soonest first, "Past" newest first (a tie
 * keeps the one-off event first), each at most `PUBLIC_EVENTS_LIMIT` long.
 */
export function withClubEvents(lists: PublicEventLists, clubEvents: readonly PublicEventItem[]): PublicEventLists {
  const upcoming = [...lists.upcoming, ...clubEvents.filter((item) => !item.past)].sort((a, b) =>
    startKey(a).localeCompare(startKey(b)),
  )
  const past = [...lists.past, ...clubEvents.filter((item) => item.past)].sort((a, b) =>
    startKey(b).localeCompare(startKey(a)),
  )
  return { upcoming: upcoming.slice(0, PUBLIC_EVENTS_LIMIT), past: past.slice(0, PUBLIC_EVENTS_LIMIT) }
}
