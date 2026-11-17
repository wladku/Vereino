import { describe, expect, it } from '@jest/globals'
import {
  DEFAULT_PAYMENT_DEADLINE_DAYS,
  ENTRY_BAN_SUBJECT_TYPES,
  EXPIRING_CHARGE_STATES,
  UNPAID_EXPIRY_REASON,
  MOVABLE_RENTAL_STATUSES,
  OCCUPYING_RENTAL_STATUSES,
  RENTAL_STATUSES,
  RENTAL_TABS,
  STAFF_REQUESTED_VIA,
  banActiveOn,
  cancellationDeadline,
  cancellationOutcome,
  expiresUnpaid,
  expiryApplies,
  localSlotOf,
  noShowAllowed,
  occupancyConflictCode,
  overlappingEntries,
  paymentDeadline,
  paymentDeadlineDays,
  quoteRental,
  rentalAmount,
  rentalEnd,
  rentalTransitions,
  slotReservable,
  slotWithinOpeningHours,
  startAllowed,
  unitsAllowed,
  type OccupancyEntry,
  type UnpaidRentalShape,
} from '../rentals'
import type { ZoneSegment } from '../zones'

const WARSAW = 'Europe/Warsaw'
// Wednesday 2026-11-11 19:30 in Warsaw (UTC+1).
const START = new Date('2026-11-11T18:30:00Z')

describe('rental statuses (DD-46)', () => {
  it('lets a staff entry start at requested and an online request at pending verification', () => {
    expect(rentalTransitions.isEntry('requested')).toBe(true)
    expect(rentalTransitions.isEntry('pending_verification')).toBe(true)
    expect(rentalTransitions.isEntry('confirmed')).toBe(false)
  })

  it('moves forward only', () => {
    expect(rentalTransitions.canTransition('requested', 'confirmed')).toBe(true)
    expect(rentalTransitions.canTransition('confirmed', 'done')).toBe(true)
    expect(rentalTransitions.canTransition('requested', 'cancelled_late')).toBe(true)
    expect(rentalTransitions.canTransition('confirmed', 'no_show')).toBe(true)
    expect(rentalTransitions.canTransition('requested', 'done')).toBe(false)
    expect(rentalTransitions.canTransition('cancelled_free', 'requested')).toBe(false)
    for (const state of ['done', 'rejected', 'expired', 'superseded', 'cancelled_free', 'cancelled_late', 'no_show']) {
      expect(rentalTransitions.isTerminal(state)).toBe(true)
    }
  })

  it('names the occupying, movable and listed statuses', () => {
    expect(RENTAL_STATUSES).toHaveLength(11)
    expect(OCCUPYING_RENTAL_STATUSES).toEqual(['requested', 'confirmed'])
    expect(MOVABLE_RENTAL_STATUSES).toEqual(['requested', 'confirmed'])
    expect(RENTAL_TABS).toEqual({ active: ['requested', 'confirmed'], awaiting_approval: ['pending_approval'] })
    expect(STAFF_REQUESTED_VIA).toEqual(['phone', 'email', 'in_person'])
    expect(ENTRY_BAN_SUBJECT_TYPES).toEqual(['institution', 'person'])
  })
})

describe('units, amount and deadlines (R05)', () => {
  it('allows 1–4 whole units', () => {
    expect(unitsAllowed(1)).toBe(true)
    expect(unitsAllowed(4)).toBe(true)
    expect(unitsAllowed(0)).toBe(false)
    expect(unitsAllowed(5)).toBe(false)
    expect(unitsAllowed(1.5)).toBe(false)
  })

  it('takes only future starts and records a no-show only after the start', () => {
    expect(startAllowed(START, new Date('2026-11-11T18:29:00Z'))).toBe(true)
    expect(startAllowed(START, START)).toBe(false)
    expect(noShowAllowed(START, new Date('2026-11-11T18:29:00Z'))).toBe(false)
    expect(noShowAllowed(START, START)).toBe(true)
  })

  it('ends after units × 90 minutes and multiplies the rate', () => {
    expect(rentalEnd(START, 2).toISOString()).toBe('2026-11-11T21:30:00.000Z')
    expect(rentalAmount(15_000, 2)).toBe(30_000)
  })

  it('allows a free cancellation up to 24 h before, inclusive', () => {
    const deadline = cancellationDeadline(START)
    expect(deadline.toISOString()).toBe('2026-11-10T18:30:00.000Z')
    expect(cancellationOutcome(new Date('2026-11-09T12:00:00Z'), deadline)).toBe('cancelled_free')
    expect(cancellationOutcome(deadline, deadline)).toBe('cancelled_free')
    expect(cancellationOutcome(new Date('2026-11-11T08:30:00Z'), deadline)).toBe('cancelled_late')
  })

  it('sets the payment deadline N days before, never before the entry', () => {
    expect(DEFAULT_PAYMENT_DEADLINE_DAYS).toBe(3)
    const early = new Date('2026-11-01T10:00:00Z')
    expect(paymentDeadline(START, early).toISOString()).toBe('2026-11-08T18:30:00.000Z')
    const late = new Date('2026-11-10T10:00:00Z')
    expect(paymentDeadline(START, late).toISOString()).toBe(late.toISOString())
    expect(paymentDeadline(START, early, 7).toISOString()).toBe('2026-11-04T18:30:00.000Z')
  })

  it('quotes the end, the amount and both deadlines together', () => {
    const now = new Date('2026-11-01T10:00:00Z')
    expect(quoteRental(START, 2, 15_000, now)).toEqual({
      endsAt: rentalEnd(START, 2),
      amount: 30_000,
      cancellationDeadline: cancellationDeadline(START),
      paymentDeadline: paymentDeadline(START, now),
    })
    expect(quoteRental(START, 2, 15_000, now, 5).paymentDeadline.toISOString()).toBe('2026-11-06T18:30:00.000Z')
  })
})

describe('the management agreement terms (facilities parity DD-R10, DD-R11; #284)', () => {
  const now = new Date('2026-11-01T10:00:00Z')

  it('takes the payment days from the agreement: 0, 5, unset and no agreement', () => {
    const zero = { paymentDeadlineDays: 0, autoExpireUnpaid: false }
    const five = { paymentDeadlineDays: 5, autoExpireUnpaid: true }
    const unset = { paymentDeadlineDays: null, autoExpireUnpaid: true }
    expect(paymentDeadlineDays(zero)).toBe(0)
    expect(paymentDeadlineDays(five)).toBe(5)
    expect(paymentDeadlineDays(unset)).toBe(3)
    expect(paymentDeadlineDays(null)).toBe(3)
    expect(paymentDeadline(START, now, paymentDeadlineDays(zero)).toISOString()).toBe(START.toISOString())
    expect(paymentDeadline(START, now, paymentDeadlineDays(five)).toISOString()).toBe('2026-11-06T18:30:00.000Z')
    expect(paymentDeadline(START, now, paymentDeadlineDays(null)).toISOString()).toBe('2026-11-08T18:30:00.000Z')
  })

  const expiring = { paymentDeadlineDays: 5, autoExpireUnpaid: true }
  const rental: UnpaidRentalShape = {
    status: 'requested',
    startsAt: START,
    paymentDeadline: new Date('2026-11-06T18:30:00Z'),
    cancellationDeadline: cancellationDeadline(START),
  }
  const after = new Date('2026-11-07T00:00:00Z')

  it('lets a rental expire only when the agreement turns expiry on and the deadline precedes free cancellation', () => {
    expect(expiryApplies(rental, expiring)).toBe(true)
    expect(expiryApplies(rental, { ...expiring, autoExpireUnpaid: false })).toBe(false)
    expect(expiryApplies(rental, null)).toBe(false)
    expect(expiryApplies({ ...rental, paymentDeadline: null }, expiring)).toBe(false)
    // A 0-day deadline (the start) lies after the free cancellation deadline: no expiry.
    expect(expiryApplies({ ...rental, paymentDeadline: START }, expiring)).toBe(false)
    expect(expiryApplies({ ...rental, paymentDeadline: cancellationDeadline(START) }, expiring)).toBe(false)
    // A row without a stored cancellation deadline reads it from the start.
    expect(expiryApplies({ ...rental, cancellationDeadline: null }, expiring)).toBe(true)
  })

  it('expires an unpaid requested rental past its deadline with no charge or an open one', () => {
    expect(UNPAID_EXPIRY_REASON).toBe('unpaid_after_deadline')
    expect(EXPIRING_CHARGE_STATES).toEqual(['none', 'open'])
    expect(expiresUnpaid(rental, 'none', expiring, after)).toBe(true)
    expect(expiresUnpaid(rental, 'open', expiring, after)).toBe(true)
    expect(expiresUnpaid(rental, 'partially_paid', expiring, after)).toBe(false)
    expect(expiresUnpaid(rental, 'paid', expiring, after)).toBe(false)
    expect(expiresUnpaid(rental, 'none', null, after)).toBe(false)
    expect(expiresUnpaid({ ...rental, status: 'confirmed' }, 'none', expiring, after)).toBe(false)
    expect(expiresUnpaid({ ...rental, paymentDeadline: null }, 'none', expiring, after)).toBe(false)
    expect(expiresUnpaid(rental, 'none', expiring, rental.paymentDeadline as Date)).toBe(false)
  })
})

describe('the slot in the club zone', () => {
  it('reads the date and wall times and notices a slot past midnight', () => {
    expect(localSlotOf(START, rentalEnd(START, 1), WARSAW)).toEqual({
      date: '2026-11-11',
      from: '19:30',
      to: '21:00',
      pastMidnight: false,
    })
    const lateStart = new Date('2026-11-11T22:00:00Z')
    expect(localSlotOf(lateStart, rentalEnd(lateStart, 1), WARSAW)).toMatchObject({ to: '24:00', pastMidnight: true })
    const toMidnight = new Date('2026-11-11T21:30:00Z')
    expect(localSlotOf(toMidnight, rentalEnd(toMidnight, 1), WARSAW)).toMatchObject({
      to: '24:00',
      pastMidnight: false,
    })
  })

  const segment = (from: string, to: string, zone: ZoneSegment['zone']): ZoneSegment => ({
    from,
    to,
    zone,
    ruleId: null,
  })
  const slot = (from: string, to: string, pastMidnight = false) => ({ date: '2026-11-11', from, to, pastMidnight })

  it('requires every minute in the bookable zone, across adjacent segments', () => {
    const segments = [
      segment('16:00', '17:30', 'public_free'),
      segment('17:30', '19:30', 'club_training'),
      segment('19:30', '20:30', 'reservable_paid'),
      segment('20:30', '22:00', 'reservable_paid'),
    ]
    expect(slotReservable(segments, slot('19:30', '21:00'))).toBe(true)
    expect(slotReservable(segments, slot('19:30', '22:00'))).toBe(true)
    expect(slotReservable(segments, slot('18:00', '19:30'))).toBe(false)
    expect(slotReservable(segments, slot('21:00', '22:30'))).toBe(false)
    expect(slotReservable([], slot('19:30', '21:00'))).toBe(false)
    expect(slotReservable([segment('00:00', '24:00', 'reservable_paid')], slot('23:00', '24:00', true))).toBe(false)
  })

  it('fits the opening hours of the date; none means no limit; past midnight never fits', () => {
    const hours = { seasons: [{ from: '01-01', to: '12-31', windows: [{ weekday: 3, from: '08:00', to: '22:00' }] }] }
    expect(slotWithinOpeningHours(hours, slot('19:30', '21:00'))).toBe(true)
    expect(slotWithinOpeningHours(hours, slot('21:00', '22:30'))).toBe(false)
    expect(slotWithinOpeningHours(null, slot('21:00', '22:30'))).toBe(true)
    expect(slotWithinOpeningHours(null, slot('23:00', '24:00', true))).toBe(false)
  })
})

describe('occupancy', () => {
  const entry = (id: string, kind: OccupancyEntry['kind'], start: string, end: string): OccupancyEntry => ({
    id,
    kind,
    placeId: 'p',
    start: new Date(start),
    end: new Date(end),
  })
  const window = { start: new Date('2026-11-11T18:30:00Z'), end: new Date('2026-11-11T20:00:00Z') }

  it('keeps the overlapping entries by start, except the ignored ones', () => {
    const entries = [
      entry('b', 'rental', '2026-11-11T19:30:00Z', '2026-11-11T21:00:00Z'),
      entry('a', 'session', '2026-11-11T17:00:00Z', '2026-11-11T18:45:00Z'),
      entry('c', 'rental', '2026-11-11T20:00:00Z', '2026-11-11T21:30:00Z'),
    ]
    expect(overlappingEntries(entries, window).map((item) => item.id)).toEqual(['a', 'b'])
    expect(overlappingEntries(entries, window, ['b']).map((item) => item.id)).toEqual(['a'])
  })

  it('answers place_closed for a closure, rental_conflict otherwise, null when free', () => {
    expect(occupancyConflictCode([])).toBeNull()
    expect(occupancyConflictCode([entry('a', 'session', '2026-11-11T18:00:00Z', '2026-11-11T19:00:00Z')])).toBe(
      'rental_conflict',
    )
    expect(
      occupancyConflictCode([
        entry('a', 'session', '2026-11-11T18:00:00Z', '2026-11-11T19:00:00Z'),
        entry('b', 'closure', '2026-11-11T00:00:00Z', '2026-11-12T00:00:00Z'),
      ]),
    ).toBe('place_closed')
    expect(
      occupancyConflictCode([
        entry('a', 'session', '2026-11-11T18:00:00Z', '2026-11-11T19:00:00Z'),
        entry('m', 'maintenance', '2026-11-11T08:00:00Z', '2026-11-11T19:00:00Z'),
      ]),
    ).toBe('maintenance_scheduled')
  })
})

describe('entry bans', () => {
  it('is in force from its start to its end, inclusive, until revoked', () => {
    const ban = { startsOn: '2026-11-01', endsOn: '2026-11-30', revokedAt: null }
    expect(banActiveOn(ban, '2026-11-01')).toBe(true)
    expect(banActiveOn(ban, '2026-11-30')).toBe(true)
    expect(banActiveOn(ban, '2026-10-31')).toBe(false)
    expect(banActiveOn(ban, '2026-12-01')).toBe(false)
    expect(banActiveOn({ ...ban, endsOn: null }, '2027-06-01')).toBe(true)
    expect(banActiveOn({ ...ban, revokedAt: new Date() }, '2026-11-15')).toBe(false)
  })
})
