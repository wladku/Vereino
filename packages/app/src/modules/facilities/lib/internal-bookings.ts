// Pure rules of the internal bookings (facilities spec glossary *Internal booking*, *Slot occupancy*, *External
// request*; REQ-023, DD-25, DD-46; club spec the `facilities.internal_bookings.create|cancel` row; #123): staff of any
// section book a free slot of any club place at once, in any zone, within the opening hours; the booking is
// `confirmed` from the start and only a cancellation ends it. A booking supersedes the external requests that hold the
// slot. Nothing here reads the database or the clock (S3.5): `now` is a parameter.
import { addDays, calendarDateInZone, defineTransitions, intervalsOverlap, type CalendarDate } from '@vereino/core'
import type { RentalStatus } from './rentals'

export const INTERNAL_BOOKING_STATUSES = ['confirmed', 'cancelled'] as const
export type InternalBookingStatus = (typeof INTERNAL_BOOKING_STATUSES)[number]

/** DD-46: an internal booking is created `confirmed` and only a cancellation ends it. */
export const internalBookingTransitions = defineTransitions({
  states: INTERNAL_BOOKING_STATUSES,
  entry: ['confirmed'],
  transitions: [['confirmed', 'cancelled']],
  terminal: ['cancelled'],
})

/** M-11 validation: a general-purpose booking names its purpose in 3–120 characters. */
export const PURPOSE_MIN_LENGTH = 3
export const PURPOSE_MAX_LENGTH = 120

/** The bookings that occupy their slot (glossary *Slot occupancy*: a `confirmed` internal booking). */
export const OCCUPYING_BOOKING_STATUSES: readonly InternalBookingStatus[] = ['confirmed']

/** Why the booking's period is not valid (422 `booking_period_invalid`), or null. */
export function bookingPeriodProblem(startsAt: Date, endsAt: Date): 'malformed' | 'inverted' | null {
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) return 'malformed'
  return endsAt.getTime() > startsAt.getTime() ? null : 'inverted'
}

/** True when a booking may take this start: it lies after `now` (422 `booking_start_past` otherwise). */
export function bookingStartAllowed(startsAt: Date, now: Date): boolean {
  return startsAt.getTime() > now.getTime()
}

/** An external request as the supersession reads it. */
export type RequestHold = {
  readonly id: string
  readonly status: RentalStatus
  readonly start: Date
  readonly end: Date
  readonly holdExpiresAt: Date | null
}

/**
 * The external requests a club booking of `window` supersedes (glossary *External request*: "an internal booking can
 * override it"): `pending_approval` requests whose hold is still valid at `now` and whose slot overlaps the window.
 * A request whose hold has lapsed is left to the expiry job.
 */
export function supersededRequests<T extends RequestHold>(
  requests: readonly T[],
  window: { start: Date; end: Date },
  now: Date,
): T[] {
  return requests.filter(
    (request) =>
      request.status === 'pending_approval' &&
      request.holdExpiresAt !== null &&
      request.holdExpiresAt.getTime() > now.getTime() &&
      intervalsOverlap(request, window),
  )
}

/** The longest window the staff calendar answers (`GET /api/facilities/calendar`, 400 beyond it). */
export const MAX_CALENDAR_DAYS = 31

const DAY_MS = 24 * 60 * 60 * 1000

/** Why a calendar window is not valid (400), or null: it must end after it starts and span at most 31 days. */
export function calendarWindowProblem(from: Date, to: Date): 'inverted' | 'too_long' | null {
  if (to.getTime() <= from.getTime()) return 'inverted'
  return to.getTime() - from.getTime() > MAX_CALENDAR_DAYS * DAY_MS ? 'too_long' : null
}

/** The club-zone calendar dates a window touches, from the date of `from` to the date of its last instant. */
export function calendarDatesOf(from: Date, to: Date, timeZone: string): CalendarDate[] {
  const first = calendarDateInZone(from, timeZone)
  const last = calendarDateInZone(new Date(to.getTime() - 1), timeZone)
  const dates: CalendarDate[] = []
  for (let date = first; date <= last; date = addDays(date, 1)) dates.push(date)
  return dates
}

/**
 * The entries staff see as their own booking and may cancel: a booking the caller made, one of a section the caller
 * coordinates, or any booking for the club administrator (the cancel command decides with the same rule).
 */
export function bookingCancellable(
  booking: { sectionId: string; bookedByPersonId: string },
  caller: { personId: string | null; coordinatedSectionIds: readonly string[]; clubAdmin: boolean },
): boolean {
  return (
    caller.clubAdmin ||
    (caller.personId !== null && caller.personId === booking.bookedByPersonId) ||
    caller.coordinatedSectionIds.includes(booking.sectionId)
  )
}
