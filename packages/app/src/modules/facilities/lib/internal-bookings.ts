// Pure rules of the internal bookings (facilities spec glossary *Internal booking*, *Slot occupancy*, *External
// request*; REQ-023, DD-25, DD-46; club spec the `facilities.internal_bookings.create|cancel` row; #123): staff of any
// section book a free slot of any club place at once, in any zone, within the opening hours; the booking is
// `confirmed` from the start and only a cancellation ends it. A booking supersedes the external requests that hold the
// slot. The club administrator may also record a booking in the past, at most 92 days back, which supersedes nothing
// (facilities parity spec DD-R17; #281). Nothing here reads the database or the clock (S3.5): `now` is a parameter.
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

/** DD-R17: how many club-zone days back the club administrator may record a club booking (a quarter, the owner report). */
export const PAST_BOOKING_MAX_DAYS = 92

/** True when the booking starts at or before `now`: a past booking, which supersedes nothing (DD-R17). */
export function bookingInPast(startsAt: Date, now: Date): boolean {
  return startsAt.getTime() <= now.getTime()
}

/** The earliest club-zone day a past club booking may start on (DD-R17). */
export function earliestPastBookingDate(today: CalendarDate): CalendarDate {
  return addDays(today, -PAST_BOOKING_MAX_DAYS)
}

/**
 * Why a booking may not take this start, or null (DD-R17): a start after `now` is always allowed; a past start only for
 * the club administrator (422 `booking_start_past` for every other caller), and only on a club-zone day at most 92
 * days before today (422 `booking_too_old`).
 */
export function bookingStartProblem(
  startsAt: Date,
  now: Date,
  timeZone: string,
  clubAdmin: boolean,
): 'booking_start_past' | 'booking_too_old' | null {
  if (!bookingInPast(startsAt, now)) return null
  if (!clubAdmin) return 'booking_start_past'
  const today = calendarDateInZone(now, timeZone)
  return calendarDateInZone(startsAt, timeZone) < earliestPastBookingDate(today) ? 'booking_too_old' : null
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
