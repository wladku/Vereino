import { describe, expect, it } from '@jest/globals'
import {
  RENTAL_CHARGE_STATES,
  awaitsPayment,
  correctionClosed,
  isRentalView,
  readRentalListUrl,
  rentalChargeDescription,
  rentalChargeState,
  rentalListQuery,
  rentalListUrlParams,
  rentalViewWhere,
} from '../rental-record'

describe('rental correction (DD-R08)', () => {
  it('allows every field while the rental holds its slot', () => {
    expect(correctionClosed('requested', ['contactName', 'renter', 'notes'])).toBe(false)
    expect(correctionClosed('confirmed', ['purpose'])).toBe(false)
  })

  it('allows only the notes in any other status', () => {
    expect(correctionClosed('done', ['notes'])).toBe(false)
    expect(correctionClosed('cancelled_free', [])).toBe(false)
    expect(correctionClosed('done', ['notes', 'contactPhone'])).toBe(true)
    expect(correctionClosed('pending_approval', ['renter'])).toBe(true)
  })
})

describe('B-24 perspectives', () => {
  it('knows its views', () => {
    expect(isRentalView('to_move')).toBe(true)
    expect(isRentalView('unpaid')).toBe(true)
    expect(isRentalView('all')).toBe(false)
    expect(isRentalView(null)).toBe(false)
  })

  it('filters the flagged rentals that still hold their slot', () => {
    expect(rentalViewWhere('to_move', new Date())).toEqual({
      needs_reschedule: true,
      status: { $in: ['requested', 'confirmed'] },
    })
  })

  it('filters the requested rentals past their payment deadline', () => {
    const now = new Date('2027-01-05T10:00:00Z')
    expect(rentalViewWhere('unpaid', now)).toEqual({
      status: 'requested',
      payment_deadline: { $lt: '2027-01-05T10:00:00.000Z' },
    })
  })
})

describe('charge state of a rental', () => {
  const statuses = new Map([
    ['c1', 'partially_paid'],
    ['c2', 'bogus'],
  ])

  it('is none without a charge or for a charge the service does not know', () => {
    expect(rentalChargeState(null, statuses)).toBe('none')
    expect(rentalChargeState(undefined, statuses)).toBe('none')
    expect(rentalChargeState('c9', statuses)).toBe('none')
    expect(rentalChargeState('c2', statuses)).toBe('none')
  })

  it("is the charge's status otherwise", () => {
    expect(rentalChargeState('c1', statuses)).toBe('partially_paid')
    expect(RENTAL_CHARGE_STATES).toContain('forfeited')
  })
})

describe('a rental waiting for its payment (DD-R09)', () => {
  it('waits while its charge is open or partly paid', () => {
    expect(awaitsPayment('c1', 'open')).toBe(true)
    expect(awaitsPayment('c1', 'partially_paid')).toBe(true)
  })

  it('is confirmed at once without a charge, with a paid, cancelled or unknown charge', () => {
    expect(awaitsPayment(null, 'none')).toBe(false)
    expect(awaitsPayment(undefined, 'open')).toBe(false)
    expect(awaitsPayment('c1', 'paid')).toBe(false)
    expect(awaitsPayment('c1', 'cancelled')).toBe(false)
    expect(awaitsPayment('c1', 'forfeited')).toBe(false)
    expect(awaitsPayment('c1', 'none')).toBe(false)
  })
})

describe('the description of a rental charge', () => {
  const echo = (key: string, fallback?: string, params?: Record<string, string>) =>
    `${key}|${fallback ?? ''}|${JSON.stringify(params)}`

  it('names the place, the club-zone date and the wall times', () => {
    const text = rentalChargeDescription(echo, {
      placeName: 'Orlik',
      startsAt: new Date('2027-01-05T17:00:00Z'),
      endsAt: new Date('2027-01-05T18:30:00Z'),
      timeZone: 'Europe/Warsaw',
      locale: 'pl',
    })
    expect(text).toBe(
      'facilities.charge.rentalDesc|Rental: {place}, {date} {start}–{end}|{"place":"Orlik","date":"05.01.2027","start":"18:00","end":"19:30"}',
    )
  })
})

describe('B-24 address', () => {
  const read = (query: string) => {
    const params = new URLSearchParams(query)
    return readRentalListUrl((key) => params.get(key))
  }

  it('falls back to the Active tab, no view, the first page', () => {
    expect(read('')).toEqual({ status: 'active', view: '', placeId: '', page: 1 })
    expect(read('status=nope&view=nope&page=0')).toEqual({ status: 'active', view: '', placeId: '', page: 1 })
    expect(read('page=2.5').page).toBe(1)
  })

  it('reads the tab, the view, the place and the page', () => {
    expect(read('status=pending_approval&view=unpaid&place=p1&page=3')).toEqual({
      status: 'pending_approval',
      view: 'unpaid',
      placeId: 'p1',
      page: 3,
    })
  })

  it('writes only what differs from the defaults', () => {
    expect(rentalListUrlParams({ status: 'active', view: '', placeId: '', page: 1 })).toEqual({})
    expect(rentalListUrlParams({ status: 'all', view: 'to_move', placeId: 'p1', page: 2 })).toEqual({
      status: 'all',
      view: 'to_move',
      place: 'p1',
      page: '2',
    })
  })

  it('maps the tab onto the API parameters', () => {
    expect(rentalListQuery({ status: 'active', view: '', placeId: '', page: 1 })).toEqual({ tab: 'active' })
    expect(rentalListQuery({ status: 'pending_approval', view: '', placeId: '', page: 1 })).toEqual({
      tab: 'awaiting_approval',
    })
    expect(rentalListQuery({ status: 'all', view: 'unpaid', placeId: 'p1', page: 4 })).toEqual({
      view: 'unpaid',
      placeId: 'p1',
    })
  })
})
