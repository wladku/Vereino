// Pure rules of the external rentals (facilities spec glossary *Booking (external rental)*, *Rental statuses*,
// *Slot occupancy*; REQ-013, R05, DD-46; #122): 90-minute units (1–4 for a staff entry), free cancellation up to 24 h
// before the start, a payment deadline N days before the start, the amount from the rate, the status table, and the
// checks a rental makes against the zones, the opening hours and the occupancy of its place. Nothing here reads the
// database or the clock (S3.5): `now` and the club time zone are parameters.
import {
  defineTransitions,
  intervalsOverlap,
  minutesOfDay,
  openingWindowsOn,
  withinWindows,
  type CalendarDate,
  type OpeningHours,
} from '@vereino/core'
import { localSessionOf, type ZoneSegment } from './zones'

export const RENTAL_STATUSES = [
  'pending_verification',
  'pending_approval',
  'requested',
  'confirmed',
  'done',
  'rejected',
  'expired',
  'superseded',
  'cancelled_free',
  'cancelled_late',
  'no_show',
] as const
export type RentalStatus = (typeof RENTAL_STATUSES)[number]

export const RENTER_TYPES = ['institution', 'person', 'unregistered'] as const
export type RenterType = (typeof RENTER_TYPES)[number]

export const REQUESTED_VIA = ['phone', 'email', 'in_person', 'online_form'] as const
export type RequestedVia = (typeof REQUESTED_VIA)[number]

/** How staff take a rental (an online form is E08-S05's request). */
export const STAFF_REQUESTED_VIA = ['phone', 'email', 'in_person'] as const satisfies readonly RequestedVia[]

/**
 * The rental status table (DD-46, glossary *Rental statuses*): an online request is verified and then decided; a staff
 * entry starts at `requested` (entry by staff = approval); a payment or a manual confirmation confirms it; the
 * lifecycle job closes it as `done` after its end; a cancellation is free or late by the deadline; the attendant
 * records a no-show.
 */
export const rentalTransitions = defineTransitions({
  states: RENTAL_STATUSES,
  entry: ['pending_verification', 'requested'],
  transitions: [
    ['pending_verification', 'pending_approval'],
    ['pending_approval', 'requested'],
    ['pending_approval', 'rejected'],
    ['pending_approval', 'expired'],
    ['pending_approval', 'superseded'],
    ['requested', 'confirmed'],
    ['requested', 'cancelled_free'],
    ['requested', 'cancelled_late'],
    ['requested', 'no_show'],
    ['confirmed', 'done'],
    ['confirmed', 'cancelled_free'],
    ['confirmed', 'cancelled_late'],
    ['confirmed', 'no_show'],
  ],
  terminal: ['done', 'rejected', 'expired', 'superseded', 'cancelled_free', 'cancelled_late', 'no_show'],
})

/** Statuses in which a rental occupies its slot (glossary *Slot occupancy*). */
export const OCCUPYING_RENTAL_STATUSES: readonly RentalStatus[] = ['requested', 'confirmed']

/** Statuses a rental can still be moved or have its reschedule flag set in. */
export const MOVABLE_RENTAL_STATUSES: readonly RentalStatus[] = ['requested', 'confirmed']

/** B-24 tabs: the statuses each lists ("All" lists every status). */
export const RENTAL_TABS = {
  active: ['requested', 'confirmed'],
  awaiting_approval: ['pending_approval'],
} as const satisfies Record<string, readonly RentalStatus[]>

/** One unit of a rental (§3 sec. 2). */
export const RENTAL_UNIT_MINUTES = 90
export const MIN_RENTAL_UNITS = 1
export const MAX_RENTAL_UNITS = 4

/** Free cancellation up to 24 h before the start (§3 sec. 4, R05). */
export const FREE_CANCELLATION_HOURS = 24

/**
 * Days before the start the rental is to be paid (§3 sec. 3). The management agreement that names N
 * (`club_core_contracts`, kind `facility_management`) is not built yet and the pilot club's rules are open (Q04, D30),
 * so the example club's default applies.
 */
export const DEFAULT_PAYMENT_DEADLINE_DAYS = 3

const MINUTE_MS = 60_000
const HOUR_MS = 60 * MINUTE_MS
const DAY_MS = 24 * HOUR_MS

/** True when `units` is a whole number of 90-minute units a staff entry may book (1–4); else 422. */
export function unitsAllowed(units: number): boolean {
  return Number.isInteger(units) && units >= MIN_RENTAL_UNITS && units <= MAX_RENTAL_UNITS
}

/** True when a staff entry or a move may take this start: it lies after `now` (422 `rental_start_past` otherwise). */
export function startAllowed(startsAt: Date, now: Date): boolean {
  return startsAt.getTime() > now.getTime()
}

/** True when a no-show may be recorded: the rental has started (409 `rental_not_started` otherwise). */
export function noShowAllowed(startsAt: Date, now: Date): boolean {
  return now.getTime() >= startsAt.getTime()
}

/** The end of a rental of `units` 90-minute units. */
export function rentalEnd(startsAt: Date, units: number): Date {
  return new Date(startsAt.getTime() + units * RENTAL_UNIT_MINUTES * MINUTE_MS)
}

/** The last instant a cancellation is free: 24 h before the start. */
export function cancellationDeadline(startsAt: Date): Date {
  return new Date(startsAt.getTime() - FREE_CANCELLATION_HOURS * HOUR_MS)
}

/** N days before the start, but never before the entry itself (a rental taken late is payable at once). */
export function paymentDeadline(startsAt: Date, now: Date, days: number = DEFAULT_PAYMENT_DEADLINE_DAYS): Date {
  return new Date(Math.max(now.getTime(), startsAt.getTime() - days * DAY_MS))
}

/** The amount of a rental in minor units: the rate per 90 minutes times the units. */
export function rentalAmount(pricePer90: number, units: number): number {
  return pricePer90 * units
}

/** The status a cancellation leads to: free up to the deadline (inclusive), late after it (charge forfeited). */
export function cancellationOutcome(now: Date, deadline: Date): 'cancelled_free' | 'cancelled_late' {
  return now.getTime() <= deadline.getTime() ? 'cancelled_free' : 'cancelled_late'
}

/**
 * A rental slot in the club zone: its date and wall times (`to` is `24:00` when it ends at or past midnight) and
 * whether it runs past midnight (such a slot fits no zone or opening window).
 */
export type LocalSlot = {
  readonly date: CalendarDate
  readonly from: string
  readonly to: string
  readonly pastMidnight: boolean
}

export function localSlotOf(startsAt: Date, endsAt: Date, timeZone: string): LocalSlot {
  const local = localSessionOf(startsAt, endsAt, timeZone)
  const minutes = (endsAt.getTime() - startsAt.getTime()) / MINUTE_MS
  return { ...local, pastMidnight: minutesOfDay(local.from) + minutes > 24 * 60 }
}

/**
 * True when every minute of the slot lies in the `reservable_paid` zone of its day (409 `zone_not_reservable`
 * otherwise): the segments are the effective zones of the date (`dayZoneSegments`), and the slot may span adjacent
 * segments of that zone.
 */
export function slotReservable(segments: readonly ZoneSegment[], slot: LocalSlot): boolean {
  if (slot.pastMidnight) return false
  let cursor = minutesOfDay(slot.from)
  const end = minutesOfDay(slot.to)
  for (const segment of segments) {
    if (segment.zone !== 'reservable_paid') continue
    const from = minutesOfDay(segment.from)
    const to = minutesOfDay(segment.to)
    if (from <= cursor && cursor < to) cursor = to
  }
  return cursor >= end
}

/**
 * True when the slot lies inside the place's opening hours on its date (409 `place_closed` otherwise). No opening
 * hours on the place chain means no limit; a date no season covers is closed; a slot past midnight never fits.
 */
export function slotWithinOpeningHours(hours: OpeningHours | null, slot: LocalSlot): boolean {
  if (slot.pastMidnight) return false
  const windows = openingWindowsOn(hours, slot.date)
  return windows === null || withinWindows(windows, slot.from, slot.to)
}

/**
 * An occupying entry on a place (a session, a rental, an internal booking, a closure, a planned maintenance window —
 * #128) as the occupancy check reads it.
 */
export type OccupancyEntry = {
  readonly id: string
  readonly kind: 'session' | 'rental' | 'booking' | 'closure' | 'maintenance'
  readonly placeId: string
  readonly start: Date
  readonly end: Date
}

/** The entries overlapping the window, except the ignored ids (the rental being moved), by start. */
export function overlappingEntries<T extends OccupancyEntry>(
  entries: readonly T[],
  window: { start: Date; end: Date },
  ignoreIds: readonly string[] = [],
): T[] {
  return entries
    .filter((entry) => !ignoreIds.includes(entry.id) && intervalsOverlap(entry, window))
    .sort((a, b) => a.start.getTime() - b.start.getTime())
}

/**
 * The code a rental save answers for the overlapping entries, or null when the slot is free: a closure closes the
 * place (409 `place_closed`), a planned maintenance window blocks it (409 `maintenance_scheduled`, #128), any other
 * entry is a conflict (409 `rental_conflict`).
 */
export function occupancyConflictCode(
  entries: readonly OccupancyEntry[],
): 'place_closed' | 'maintenance_scheduled' | 'rental_conflict' | null {
  if (entries.length === 0) return null
  if (entries.some((entry) => entry.kind === 'closure')) return 'place_closed'
  return entries.some((entry) => entry.kind === 'maintenance') ? 'maintenance_scheduled' : 'rental_conflict'
}

/** Who an entry ban names: a registered renter (an institution or a person). */
export const ENTRY_BAN_SUBJECT_TYPES = ['institution', 'person'] as const
export type EntryBanSubjectType = (typeof ENTRY_BAN_SUBJECT_TYPES)[number]

/** An entry ban as the rental check reads it. */
export type EntryBanShape = {
  readonly startsOn: CalendarDate
  readonly endsOn: CalendarDate | null
  readonly revokedAt: Date | null
}

/** True when the ban is in force on the date: not revoked, started, and not ended (`ends_on` inclusive). */
export function banActiveOn(ban: EntryBanShape, date: CalendarDate): boolean {
  if (ban.revokedAt !== null) return false
  return ban.startsOn <= date && (ban.endsOn === null || date <= ban.endsOn)
}

/** The deadlines and amount a quote shows and a staff entry stores. */
export type RentalQuote = {
  readonly endsAt: Date
  readonly amount: number
  readonly cancellationDeadline: Date
  readonly paymentDeadline: Date
}

export function quoteRental(startsAt: Date, units: number, pricePer90: number, now: Date): RentalQuote {
  return {
    endsAt: rentalEnd(startsAt, units),
    amount: rentalAmount(pricePer90, units),
    cancellationDeadline: cancellationDeadline(startsAt),
    paymentDeadline: paymentDeadline(startsAt, now),
  }
}
