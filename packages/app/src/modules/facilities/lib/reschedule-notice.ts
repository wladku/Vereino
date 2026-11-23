// Who is told about the entries a closure or a maintenance window flagged "to be moved" (facilities parity spec
// REQ-R18, DD-R14, the `facilities.closure.created|updated` and `facilities.maintenance.scheduled` row of *Events*,
// J-R05; #287): a session → the coordinators of its section on its day and its coach; a club booking → its booker; a
// rental → the club administrators (the renter gets an e-mail of their own). One message per person and cause, listing
// that person's entries the cause newly flagged (`announcedBefore`); a person with a rental among them gets the administrators' message, which links
// to B-24 "Do przeniesienia". Pure: the service reads the entries and people and dispatches the plan.
import type { CalendarDate } from '@vereino/core'

export type RescheduleCauseKind = 'closure' | 'maintenance'

/** A cause's window before a save moved it: the place and the times. */
export type CauseWindow = { placeId: string; start: Date; end: Date }

/**
 * The closure or maintenance window that flagged the entries; its `updatedAt` makes a moved window a new message.
 * `previous` is the window before this save moved it (null for a new cause): entries under it were announced then.
 */
export type RescheduleCause = { kind: RescheduleCauseKind; id: string; updatedAt: Date; previous: CauseWindow | null }

/** The places a window covers: sessions on the place and its sub-places, rentals and bookings on its ancestors too. */
export type WindowPlaces = { sessionPlaceIds: ReadonlySet<string>; familyIds: ReadonlySet<string> }

/**
 * Whether the cause announced `entry` already, before this save: it lay under the cause's previous window. The
 * entries a cause lists are the flagged ones under its window that are new to it — so a moved window announces only
 * what it adds, and a second cause over the same entries announces them again as its own.
 */
export function announcedBefore(
  entry: Pick<RescheduleEntry, 'kind' | 'placeId' | 'startsAt' | 'endsAt'>,
  previous: (WindowPlaces & { start: Date; end: Date }) | null,
): boolean {
  if (!previous) return false
  const places = entry.kind === 'session' ? previous.sessionPlaceIds : previous.familyIds
  return places.has(entry.placeId) && entry.startsAt < previous.end && entry.endsAt > previous.start
}

export type RescheduleEntryKind = 'session' | 'booking' | 'rental'

/** A flagged entry as the message lists it: its kind, place, time and — for a session — the group's or activity's name. */
export type RescheduleEntry = {
  kind: RescheduleEntryKind
  id: string
  placeId: string
  startsAt: Date
  endsAt: Date
  label: string | null
}

export type FlaggedSession = RescheduleEntry & {
  kind: 'session'
  sectionId: string | null
  coachPersonId: string | null
}
export type FlaggedBooking = RescheduleEntry & { kind: 'booking'; bookedByPersonId: string }
export type FlaggedRental = RescheduleEntry & { kind: 'rental' }

/** `staff`: sessions and club bookings only (link to the place's day); `admin`: a rental among them (link to B-24). */
export type RescheduleAudience = 'staff' | 'admin'

/**
 * One person's message. `coordinatedSectionIds`: the sections of its sessions the person is told about as a
 * coordinator (by first appearance) — their link opens the "Needs a new time" view of the section calendar (AC-R14).
 */
export type RescheduleNotice = {
  personId: string
  audience: RescheduleAudience
  entries: RescheduleEntry[]
  coordinatedSectionIds: string[]
}

/** The idempotency key of one person's message about one cause (renter: the rental id in place of the person). */
export function rescheduleNoticeKey(cause: RescheduleCause, recipientId: string): string {
  return `facilities:reschedule:${cause.id}:${String(cause.updatedAt.getTime())}:${recipientId}`
}

/**
 * The messages of one cause, one per person, entries by start. `coordinatorsOf(sectionId, date)` names the section's
 * coordinators on the session's day, `dayOf` gives an instant's day in the club zone.
 */
export function planRescheduleNotices(input: {
  sessions: readonly FlaggedSession[]
  bookings: readonly FlaggedBooking[]
  rentals: readonly FlaggedRental[]
  admins: readonly string[]
  coordinatorsOf: (sectionId: string, date: CalendarDate) => readonly string[]
  dayOf: (instant: Date) => CalendarDate
}): RescheduleNotice[] {
  const byPerson = new Map<
    string,
    { audience: RescheduleAudience; entries: Map<string, RescheduleEntry>; sections: Set<string> }
  >()
  const add = (personId: string, entry: RescheduleEntry, coordinatedSectionId: string | null = null) => {
    const notice = byPerson.get(personId) ?? {
      audience: 'staff' as RescheduleAudience,
      entries: new Map(),
      sections: new Set<string>(),
    }
    if (entry.kind === 'rental') notice.audience = 'admin'
    notice.entries.set(`${entry.kind}:${entry.id}`, entry)
    if (coordinatedSectionId) notice.sections.add(coordinatedSectionId)
    byPerson.set(personId, notice)
  }
  for (const session of input.sessions) {
    const coordinators = session.sectionId ? input.coordinatorsOf(session.sectionId, input.dayOf(session.startsAt)) : []
    for (const personId of coordinators) add(personId, entryOf(session), session.sectionId)
    if (session.coachPersonId) add(session.coachPersonId, entryOf(session))
  }
  for (const booking of input.bookings) add(booking.bookedByPersonId, entryOf(booking))
  for (const rental of input.rentals) {
    for (const personId of input.admins) add(personId, entryOf(rental))
  }
  return [...byPerson.entries()].map(([personId, notice]) => ({
    personId,
    audience: notice.audience,
    entries: [...notice.entries.values()].sort(byStart),
    coordinatedSectionIds: [...notice.sections],
  }))
}

/** The most entries one message lists; a longer list ends with "and K more" (the e-mail template's params cap). */
export const RESCHEDULE_ENTRY_LIMIT = 500

/** The first `limit` entries of a message (already by start) and how many it leaves out. */
export function limitNoticeEntries<T>(
  entries: readonly T[],
  limit: number = RESCHEDULE_ENTRY_LIMIT,
): { shown: T[]; more: number } {
  return { shown: entries.slice(0, limit), more: Math.max(0, entries.length - limit) }
}

/** The sections whose coordinators a plan needs, with each session's day (all pairs read in one directory call, #394). */
export function sectionDays(
  sessions: readonly FlaggedSession[],
  dayOf: (instant: Date) => CalendarDate,
): Array<{ sectionId: string; date: CalendarDate }> {
  const pairs = new Map<string, { sectionId: string; date: CalendarDate }>()
  for (const session of sessions) {
    if (!session.sectionId) continue
    const date = dayOf(session.startsAt)
    pairs.set(`${session.sectionId}:${date}`, { sectionId: session.sectionId, date })
  }
  return [...pairs.values()]
}

function entryOf(entry: RescheduleEntry): RescheduleEntry {
  return {
    kind: entry.kind,
    id: entry.id,
    placeId: entry.placeId,
    startsAt: entry.startsAt,
    endsAt: entry.endsAt,
    label: entry.label,
  }
}

function byStart(a: RescheduleEntry, b: RescheduleEntry): number {
  return a.startsAt.getTime() - b.startsAt.getTime() || a.id.localeCompare(b.id)
}

/** B-24 "Do przeniesienia", the administrators' link. */
export const RENTALS_TO_MOVE_HREF = '/backend/facilities/rentals?view=to_move'

/**
 * The staff message's fallback link (AC-R14): the place's day on M-11 filtered "Do przeniesienia" — for a coach or a
 * booker, who have no "Needs a new time" view of their own.
 */
export function placeDayToMoveHref(placeId: string, date: CalendarDate): string {
  return `/club/places/${encodeURIComponent(placeId)}?date=${date}&view=to_move`
}

/**
 * The staff message's link (AC-R14): a section coordinator's opens the groups and activities spec's "Needs a new time"
 * view of the section calendar (REQ-A10, `/club/calendar?as=coordinator&view=reschedule`), narrowed to the section
 * when the message names only one; anyone else's the place's day on M-11 (`placeDayToMoveHref`).
 */
export function rescheduleStaffHref(link: {
  placeId: string
  date: CalendarDate
  coordinatedSectionIds?: readonly string[]
}): string {
  const sections = link.coordinatedSectionIds ?? []
  if (sections.length === 0) return placeDayToMoveHref(link.placeId, link.date)
  // The activities module's `sectionCalendarHref('reschedule', section)` URL; a module may not import another's code
  // (eslint boundaries), so it is built here and `TEST-R18-reschedule-notices` opens it.
  const params = new URLSearchParams({ as: 'coordinator', view: 'reschedule' })
  if (sections.length === 1) params.set('section', sections[0])
  return `/club/calendar?${params.toString()}`
}

/** M-11's "Do przeniesienia" filter in the address (`view=to_move`). */
export function isToMoveView(view: string | null): boolean {
  return view === 'to_move'
}
