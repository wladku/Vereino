import { describe, expect, it } from '@jest/globals'
import {
  INTERNAL_BOOKING_STATUSES,
  MAX_CALENDAR_DAYS,
  OCCUPYING_BOOKING_STATUSES,
  PURPOSE_MAX_LENGTH,
  PURPOSE_MIN_LENGTH,
  bookingCancellable,
  bookingPeriodProblem,
  bookingStartAllowed,
  calendarDatesOf,
  calendarWindowProblem,
  internalBookingTransitions,
  supersededRequests,
  type RequestHold,
} from '../internal-bookings'

const at = (iso: string) => new Date(iso)

describe('internal bookings (REQ-023, DD-25, DD-46)', () => {
  it('is confirmed from the start and only a cancellation ends it', () => {
    expect(INTERNAL_BOOKING_STATUSES).toEqual(['confirmed', 'cancelled'])
    expect(OCCUPYING_BOOKING_STATUSES).toEqual(['confirmed'])
    expect(internalBookingTransitions.isEntry('confirmed')).toBe(true)
    expect(internalBookingTransitions.canTransition('confirmed', 'cancelled')).toBe(true)
    expect(internalBookingTransitions.canTransition('cancelled', 'confirmed')).toBe(false)
    expect(internalBookingTransitions.isTerminal('cancelled')).toBe(true)
  })

  it('bounds the purpose at 3–120 characters (M-11)', () => {
    expect([PURPOSE_MIN_LENGTH, PURPOSE_MAX_LENGTH]).toEqual([3, 120])
  })

  it('requires the end after the start', () => {
    const start = at('2026-11-14T08:00:00Z')
    expect(bookingPeriodProblem(start, at('2026-11-14T11:00:00Z'))).toBeNull()
    expect(bookingPeriodProblem(start, start)).toBe('inverted')
    expect(bookingPeriodProblem(at('x'), start)).toBe('malformed')
    expect(bookingPeriodProblem(start, at('x'))).toBe('malformed')
  })

  it('refuses a start that is not in the future', () => {
    const now = at('2026-11-10T12:00:00Z')
    expect(bookingStartAllowed(at('2026-11-10T12:00:01Z'), now)).toBe(true)
    expect(bookingStartAllowed(now, now)).toBe(false)
  })
})

describe('supersession of external requests (glossary *External request*)', () => {
  const now = at('2026-11-10T12:00:00Z')
  const window = { start: at('2026-11-14T08:00:00Z'), end: at('2026-11-14T11:00:00Z') }
  const request = (overrides: Partial<RequestHold>): RequestHold => ({
    id: 'r',
    status: 'pending_approval',
    start: at('2026-11-14T09:00:00Z'),
    end: at('2026-11-14T10:30:00Z'),
    holdExpiresAt: at('2026-11-11T12:00:00Z'),
    ...overrides,
  })

  it('takes the pending requests with a valid hold that overlap the window', () => {
    const requests = [
      request({ id: 'held' }),
      request({ id: 'lapsed', holdExpiresAt: now }),
      request({ id: 'no-hold', holdExpiresAt: null }),
      request({ id: 'approved', status: 'requested' }),
      request({ id: 'later', start: at('2026-11-14T11:00:00Z'), end: at('2026-11-14T12:30:00Z') }),
    ]
    expect(supersededRequests(requests, window, now).map((item) => item.id)).toEqual(['held'])
  })
})

describe('staff calendar window', () => {
  it('spans at most 31 days and ends after it starts', () => {
    const from = at('2026-11-01T00:00:00Z')
    expect(MAX_CALENDAR_DAYS).toBe(31)
    expect(calendarWindowProblem(from, at('2026-12-02T00:00:00Z'))).toBeNull()
    expect(calendarWindowProblem(from, at('2026-12-02T00:00:01Z'))).toBe('too_long')
    expect(calendarWindowProblem(from, from)).toBe('inverted')
  })

  it('lists the club-zone dates the window touches', () => {
    // 2026-11-13 23:00 UTC is 14 November in Warsaw; the window ends at midnight Warsaw of the 16th.
    expect(calendarDatesOf(at('2026-11-13T23:00:00Z'), at('2026-11-15T23:00:00Z'), 'Europe/Warsaw')).toEqual([
      '2026-11-14',
      '2026-11-15',
    ])
    expect(calendarDatesOf(at('2026-11-14T08:00:00Z'), at('2026-11-14T09:00:00Z'), 'Europe/Warsaw')).toEqual([
      '2026-11-14',
    ])
  })
})

describe('who may cancel a booking', () => {
  const booking = { sectionId: 'football', bookedByPersonId: 'wojtek' }
  const nobody = { personId: null, coordinatedSectionIds: [], clubAdmin: false }

  it('lets the booker, the section coordinator and the administrator cancel', () => {
    expect(bookingCancellable(booking, { ...nobody, personId: 'wojtek' })).toBe(true)
    expect(bookingCancellable(booking, { ...nobody, coordinatedSectionIds: ['football'] })).toBe(true)
    expect(bookingCancellable(booking, { ...nobody, clubAdmin: true })).toBe(true)
  })

  it('refuses an unrelated coach and a caller without a person', () => {
    expect(bookingCancellable(booking, { ...nobody, personId: 'marek', coordinatedSectionIds: ['zumba'] })).toBe(false)
    expect(bookingCancellable(booking, nobody)).toBe(false)
  })
})
