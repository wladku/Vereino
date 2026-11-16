// The staff view of a place's occupancy (facilities spec `/club/places`, M-11, the `GET /api/facilities/calendar` row;
// REQ-023; #123): the planned sessions, the rentals that hold their slot, the external requests holding it until a
// decision, the confirmed internal bookings and the closures on a set of places in a window, each with the label staff
// see — the activity, the renter, the booking's purpose and booker, the closure reason. The internal-booking command
// reads the same entries under the occupancy lock for its 409 list ("with names, since this is staff") and for the
// requests it supersedes. Encrypted columns are read with `findWithDecryption`. The facilities parity spec (#275) adds the
// place facts, the entry's place name, a session's group and coach, a rental's status, and the renter's contact for a
// caller who manages the rentals of the place (DD-R18).
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { openingWindowsOn, type CalendarDate, type Scope } from '@vereino/core'
import { zoneRuleShapeOf } from '../commands/zone-rules'
import { Closure, InternalBooking, MaintenanceTask, Rental, ZoneRule } from '../data/entities'
import { OCCUPYING_BOOKING_STATUSES, bookingCancellable, calendarDatesOf } from '../lib/internal-bookings'
import { inPlaces } from '../lib/place-scope'
import { OCCUPYING_RENTAL_STATUSES, type RentalStatus } from '../lib/rentals'
import { dayZoneSegments, type Zone } from '../lib/zones'
import {
  clubTimeZone,
  findPlaces,
  openingHours,
  personNames,
  placeOptions,
  plannedSessions,
  type FacilitiesScope,
} from './directory'
import type { PlaceOption } from '../../club_core/services/directory'
import { placeFamilyIds } from './occupancy'

export type CalendarEntryKind = 'session' | 'rental' | 'request' | 'booking' | 'closure' | 'maintenance'

export type CalendarEntry = {
  id: string
  kind: CalendarEntryKind
  placeId: string
  start: Date
  end: Date
  /** The activity, the renter, the booking's purpose, the closure reason or the maintenance kind. */
  label: string | null
  needsReschedule: boolean
  /** A session's group, its name and the coach (#275). */
  groupId: string | null
  groupName: string | null
  coachPersonId: string | null
  /** A rental's or a request's status and its contact (#275). */
  status: RentalStatus | null
  contactName: string | null
  contactPhone: string | null
  /** An internal booking's section, booker and booker's name; a maintenance task's planner and name (#128). */
  sectionId: string | null
  bookedByPersonId: string | null
  bookedByName: string | null
  /** A request's hold (the supersession and the expiry read it). */
  holdExpiresAt: Date | null
  /** The version of an internal booking or a maintenance task (its change sends it as the lock token). */
  updatedAt: Date | null
}

type Window = { start: Date; end: Date }

const EMPTY = {
  needsReschedule: false,
  groupId: null,
  groupName: null,
  coachPersonId: null,
  status: null,
  contactName: null,
  contactPhone: null,
  sectionId: null,
  bookedByPersonId: null,
  bookedByName: null,
  holdExpiresAt: null,
  updatedAt: null,
} as const

/**
 * Every entry on `placeIds` overlapping the window, by start, read with `em` (the caller's transactional EntityManager
 * under the occupancy lock, or a fork for a read). A `pending_approval` request counts only while its hold is valid at
 * `now`; it occupies the slot for other external requests only, so the occupancy checks leave it out (`kind: 'request'`).
 */
export async function calendarEntries(
  container: AwilixContainer,
  em: EntityManager,
  scope: FacilitiesScope,
  placeIds: readonly string[],
  window: Window,
  now: Date,
): Promise<CalendarEntry[]> {
  if (placeIds.length === 0) return []
  const ids = [...new Set(placeIds)]
  const where = {
    ...scope,
    deletedAt: null,
    placeId: { $in: ids },
    startsAt: { $lt: window.end },
    endsAt: { $gt: window.start },
  }
  // One query after the other: a transactional EntityManager runs on one connection.
  const sessions = await plannedSessions(container, scope, ids, window, em)
  const rentals = await findWithDecryption(
    em,
    Rental,
    {
      ...where,
      $or: [
        { status: { $in: [...OCCUPYING_RENTAL_STATUSES] } },
        { status: 'pending_approval', holdExpiresAt: { $gt: now } },
      ],
    },
    {},
    scope,
  )
  const bookings = await findWithDecryption(
    em,
    InternalBooking,
    { ...where, status: { $in: [...OCCUPYING_BOOKING_STATUSES] } },
    {},
    scope,
  )
  const closures = await em.find(Closure, where)
  // A planned maintenance window (#128): the kind of work and who planned it, as staff see it.
  const works = await em.find(MaintenanceTask, { ...where, status: 'planned' })
  const bookers = await personNames(
    container,
    scope,
    [...bookings.map((row) => row.bookedByPersonId), ...works.map((row) => row.plannedByPersonId)],
    em,
  )
  const entries: CalendarEntry[] = [
    ...sessions.map((row) => ({
      ...EMPTY,
      id: row.id,
      kind: 'session' as const,
      placeId: row.placeId,
      start: row.startAt,
      end: row.endAt,
      label: row.activityName,
      needsReschedule: row.needsReschedule,
      groupId: row.groupId,
      groupName: row.groupName,
      coachPersonId: row.coachPersonId,
    })),
    ...rentals.map((row) => ({
      ...EMPTY,
      id: row.id,
      kind: row.status === 'pending_approval' ? ('request' as const) : ('rental' as const),
      placeId: row.placeId,
      start: row.startsAt,
      end: row.endsAt,
      label: row.renterDisplayName,
      needsReschedule: row.needsReschedule,
      holdExpiresAt: row.holdExpiresAt ?? null,
      status: row.status,
      contactName: row.contactName ?? null,
      contactPhone: row.contactPhone ?? null,
    })),
    ...bookings.map((row) => ({
      ...EMPTY,
      id: row.id,
      kind: 'booking' as const,
      placeId: row.placeId,
      start: row.startsAt,
      end: row.endsAt,
      label: row.purpose,
      needsReschedule: row.needsReschedule,
      sectionId: row.sectionId,
      bookedByPersonId: row.bookedByPersonId,
      bookedByName: bookers.get(row.bookedByPersonId) ?? null,
      updatedAt: row.updatedAt,
    })),
    ...closures.map((row) => ({
      ...EMPTY,
      id: row.id,
      kind: 'closure' as const,
      placeId: row.placeId,
      start: row.startsAt,
      end: row.endsAt,
      label: row.reason,
    })),
    ...works.map((row) => ({
      ...EMPTY,
      id: row.id,
      kind: 'maintenance' as const,
      placeId: row.placeId,
      start: row.startsAt as Date,
      end: row.endsAt as Date,
      label: row.kind,
      bookedByPersonId: row.plannedByPersonId,
      bookedByName: bookers.get(row.plannedByPersonId) ?? null,
      updatedAt: row.updatedAt,
    })),
  ]
  return entries.sort((a, b) => a.start.getTime() - b.start.getTime() || a.id.localeCompare(b.id))
}

/** A conflicting entry with the label staff see (the shape of the internal booking's 409 list). */
export type LabelledConflict = {
  kind: 'session' | 'rental' | 'booking' | 'closure' | 'maintenance'
  id: string
  placeId?: string
  start: string
  end: string
  label: string | null
}

/** "Purpose · Booker" for a booking or a maintenance window with a known planner, the entry's label otherwise. */
export function staffEntryLabel(entry: Pick<CalendarEntry, 'label' | 'bookedByName'>): string | null {
  return entry.bookedByName && entry.label ? `${entry.label} · ${entry.bookedByName}` : entry.label
}

/**
 * The conflicts of a refused rental with their places and the labels staff see (facilities parity spec, the
 * `facilities.rentals.create` row: "409 `rental_conflict` carries `conflicts[]` labelled for staff", #277), read with
 * the caller's EntityManager over the place family and the conflicts' span. A conflict the read no longer finds keeps
 * its times and has no label.
 */
export async function labelConflicts(
  container: AwilixContainer,
  em: EntityManager,
  scope: FacilitiesScope,
  placeId: string,
  conflicts: ReadonlyArray<{ kind: LabelledConflict['kind']; id: string; start: string; end: string }>,
  now: Date,
): Promise<LabelledConflict[]> {
  if (conflicts.length === 0) return []
  const start = new Date(Math.min(...conflicts.map((conflict) => Date.parse(conflict.start))))
  const end = new Date(Math.max(...conflicts.map((conflict) => Date.parse(conflict.end))))
  const placeIds = await placeFamilyIds(container, scope, placeId, em)
  const entries = new Map(
    (await calendarEntries(container, em, scope, placeIds, { start, end }, now)).map((entry) => [entry.id, entry]),
  )
  return conflicts.map((conflict) => {
    const entry = entries.get(conflict.id)
    return {
      kind: conflict.kind,
      id: conflict.id,
      start: conflict.start,
      end: conflict.end,
      ...(entry ? { placeId: entry.placeId } : {}),
      label: entry ? staffEntryLabel(entry) : null,
    }
  })
}

/** A place as the calendar shows it; the place facts of the cards and the axis (#275). */
export type CalendarPlace = {
  id: string
  name: string
  parentId: string | null
  parentName: string | null
  isLeaf: boolean
  kind: string | null
  surface: string | null
  isExternal: boolean
  capacityGroups: number
  acceptsOnlineRequests: boolean
}

/** A day of the one-place timeline: the opening windows (null = no limit) and the effective zones. */
export type CalendarDay = {
  date: CalendarDate
  opening: Array<{ from: string; to: string }> | null
  zones: Array<{ from: string; to: string; zone: Zone }>
}

export type CalendarEntryView = {
  id: string
  kind: CalendarEntryKind
  placeId: string
  start: string
  end: string
  label: string | null
  /** The name of the entry's place (#275). */
  placeName: string | null
  needsReschedule: boolean
  groupId: string | null
  /** A session's group and coach (#275). */
  groupName: string | null
  coachName: string | null
  /** A rental's or a request's status (#275). */
  status: RentalStatus | null
  /** A rental's or a request's contact, only for a caller who manages the rentals of the place (DD-R18, #275). */
  contact: { name: string | null; phone: string | null } | null
  /** A rental or a request the caller may open (the rental list's scope, #275). */
  canOpen: boolean
  sectionId: string | null
  bookedByName: string | null
  /** An internal booking the caller made. */
  own: boolean
  /** An internal booking the caller may cancel (the booker, the section's coordinator, the administrator). */
  canCancel: boolean
  /** An internal booking's version, the lock token of its cancellation. */
  updatedAt: string | null
}

/**
 * Who reads the calendar (#128, DD-36, Q-043): staff with `facilities.view` read the club with names; a maintainer
 * holding only `facilities.maintenance.manage` reads the places assigned to them with the public calendar's
 * redaction — no renter, person or group names — and the maintenance details. `canPlan` and `planPlaceIds` tell the
 * page where "Plan maintenance" applies (null = every place). A facility attendant reads with names, but only the
 * places of their grant (`placeIds`, #126; absent or null = every place).
 */
export type CalendarAccess = {
  redacted: boolean
  canPlan: boolean
  planPlaceIds: string[] | null
  placeIds?: string[] | null
  /** The places whose rentals the caller manages (DD-R18, #275): null = every place; absent = none. */
  rentalPlaceIds?: string[] | null
}

export type StaffCalendar = {
  timeZone: string
  /** The caller's maintenance access (#128). */
  maintenance: CalendarAccess
  places: CalendarPlace[]
  /** One place only: its days in the window. */
  days: CalendarDay[]
  entries: CalendarEntryView[]
}

/**
 * `GET /api/facilities/calendar` (M-11): with `placeId`, the place's timeline — every day of the window with its
 * opening windows and zones, and the entries on the place, its ancestors and descendants; without it, every live
 * active place of the club with the entries on it (the cards of `/club/places`). Staff read the whole club.
 */
export async function staffCalendar(
  container: AwilixContainer,
  scope: FacilitiesScope,
  grants: Scope,
  query: { placeId?: string; from: Date; to: Date },
  now: Date,
  access: CalendarAccess = { redacted: false, canPlan: false, planPlaceIds: null },
): Promise<StaffCalendar | null | 'forbidden'> {
  // A redacted reader sees only the places assigned to them, an attendant only their places (403 for any other place).
  const visibleIds = access.redacted ? (access.planPlaceIds ?? []) : (access.placeIds ?? null)
  const visible = visibleIds ? new Set(visibleIds) : null
  if (visible && query.placeId && !visible.has(query.placeId)) return 'forbidden'
  const em = container.resolve<EntityManager>('em').fork()
  const timeZone = await clubTimeZone(container, scope)
  const window = { start: query.from, end: query.to }
  const options = await placeOptions(container, scope)
  let places: CalendarPlace[]
  let entryPlaceIds: string[]
  let days: CalendarDay[] = []
  if (query.placeId) {
    const place = (await findPlaces(container, scope, [query.placeId], em)).get(query.placeId)
    if (!place) return null
    const option = options.find((candidate) => candidate.id === place.id)
    places = [
      option
        ? calendarPlaceOf(option)
        : {
            // An inactive place: the directory's facts, without the option-only ones.
            id: place.id,
            name: place.name,
            parentId: place.parentPlaceId,
            parentName: null,
            isLeaf: true,
            kind: null,
            surface: null,
            isExternal: place.isExternal,
            capacityGroups: place.capacityGroups,
            acceptsOnlineRequests: false,
          },
    ]
    entryPlaceIds = await placeFamilyIds(container, scope, place.id, em)
    const hours = (await openingHours(container, scope, [place.id], em)).get(place.id) ?? null
    const rules = (await em.find(ZoneRule, { ...scope, deletedAt: null, placeId: place.id })).map(zoneRuleShapeOf)
    days = calendarDatesOf(query.from, query.to, timeZone).map((date) => ({
      date,
      opening: openingWindowsOn(hours, date)?.map((window) => ({ from: window.from, to: window.to })) ?? null,
      zones: dayZoneSegments(rules, date).map((segment) => ({
        from: segment.from,
        to: segment.to,
        zone: segment.zone,
      })),
    }))
  } else {
    places = options.filter((option) => !visible || visible.has(option.id)).map(calendarPlaceOf)
    entryPlaceIds = places.map((place) => place.id)
  }
  const caller = {
    personId: grants.find((grant) => grant.kind === 'self')?.ids?.[0] ?? null,
    coordinatedSectionIds: grants.flatMap((grant) => (grant.kind === 'coordinator' ? [...(grant.ids ?? [])] : [])),
    clubAdmin: grants.some((grant) => grant.kind === 'club_admin'),
  }
  const entries = await calendarEntries(container, em, scope, entryPlaceIds, window, now)
  const placeNames = new Map(options.map((option) => [option.id, option.name]))
  const unnamed = [...new Set(entries.map((entry) => entry.placeId))].filter((id) => !placeNames.has(id))
  for (const [id, place] of await findPlaces(container, scope, unnamed, em)) placeNames.set(id, place.name)
  const coaches = access.redacted
    ? new Map<string, string>()
    : await personNames(
        container,
        scope,
        entries.flatMap((entry) => (entry.coachPersonId ? [entry.coachPersonId] : [])),
        em,
      )
  const rentalPlaces = access.rentalPlaceIds === undefined ? [] : access.rentalPlaceIds
  return {
    timeZone,
    maintenance: { redacted: access.redacted, canPlan: access.canPlan, planPlaceIds: access.planPlaceIds },
    places,
    days,
    entries: entries.map((entry) => {
      if (access.redacted && entry.kind !== 'maintenance') {
        // The public calendar's redaction: what occupies the slot, never who.
        return {
          id: entry.id,
          kind: entry.kind,
          placeId: entry.placeId,
          start: entry.start.toISOString(),
          end: entry.end.toISOString(),
          label: null,
          placeName: null,
          needsReschedule: entry.needsReschedule,
          groupId: null,
          groupName: null,
          coachName: null,
          status: null,
          contact: null,
          canOpen: false,
          sectionId: null,
          bookedByName: null,
          own: false,
          canCancel: false,
          updatedAt: null,
        }
      }
      const booking =
        entry.kind === 'booking' && entry.sectionId && entry.bookedByPersonId
          ? { sectionId: entry.sectionId, bookedByPersonId: entry.bookedByPersonId }
          : null
      const rental = entry.kind === 'rental' || entry.kind === 'request'
      const managed = rental && inPlaces(rentalPlaces, entry.placeId)
      return {
        id: entry.id,
        kind: entry.kind,
        placeId: entry.placeId,
        start: entry.start.toISOString(),
        end: entry.end.toISOString(),
        label: entry.label,
        placeName: placeNames.get(entry.placeId) ?? null,
        needsReschedule: entry.needsReschedule,
        groupId: entry.groupId,
        groupName: entry.groupName,
        coachName: entry.coachPersonId ? (coaches.get(entry.coachPersonId) ?? null) : null,
        status: entry.status,
        contact: managed ? { name: entry.contactName, phone: entry.contactPhone } : null,
        canOpen: managed,
        sectionId: entry.sectionId,
        bookedByName: entry.bookedByName,
        own: booking !== null && caller.personId === booking.bookedByPersonId,
        canCancel: booking !== null && bookingCancellable(booking, caller),
        updatedAt: entry.updatedAt?.toISOString() ?? null,
      }
    }),
  }
}

/** A place option as the calendar lists it (#275). */
function calendarPlaceOf(option: PlaceOption): CalendarPlace {
  return {
    id: option.id,
    name: option.name,
    parentId: option.parentId,
    parentName: option.parentName,
    isLeaf: option.isLeaf,
    kind: option.kind,
    surface: option.surface,
    isExternal: option.isExternal,
    capacityGroups: option.capacityGroups,
    acceptsOnlineRequests: option.acceptsOnlineRequests,
  }
}
