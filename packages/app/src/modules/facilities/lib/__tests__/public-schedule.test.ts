import { describe, expect, it } from '@jest/globals'
import {
  PUBLIC_SLOT_STATES,
  datesBetween,
  entryState,
  daySpans,
  firstRequestMinute,
  localMoment,
  publicDaySlots,
  publicRates,
  scheduleMonth,
  zoneState,
} from '../public-schedule'
import type { RentalRateShape } from '../rates'

const WARSAW = 'Europe/Warsaw'

describe('public slot states (#124)', () => {
  it('lists every state a guest may see', () => {
    expect(PUBLIC_SLOT_STATES).toEqual([
      'public_free',
      'club_training',
      'bookable',
      'closed',
      'unavailable',
      'club',
      'booked',
      'requested',
    ])
  })

  it('shows an entry by what it does to the slot, never by who or why', () => {
    expect(entryState('closure')).toBe('closed')
    expect(entryState('maintenance')).toBe('unavailable')
    expect(entryState('rental')).toBe('booked')
    expect(entryState('request')).toBe('requested')
    expect(entryState('session')).toBe('club')
    expect(entryState('booking')).toBe('club')
  })

  it('shows a free reservable zone as bookable and the other zones as themselves', () => {
    expect(zoneState('reservable_paid')).toBe('bookable')
    expect(zoneState('public_free')).toBe('public_free')
    expect(zoneState('club_training')).toBe('club_training')
    expect(zoneState('closed')).toBe('closed')
  })
})

describe('scheduleMonth', () => {
  const today = '2026-11-08'

  it('reads the current month without a parameter, with its neighbours', () => {
    expect(scheduleMonth(undefined, today)).toEqual({
      month: '2026-11',
      first: '2026-11-01',
      last: '2026-11-30',
      previous: '2026-10',
      next: '2026-12',
    })
  })

  it('stops the neighbours at one month back and twelve ahead', () => {
    expect(scheduleMonth('2026-10', today)).toMatchObject({ first: '2026-10-01', last: '2026-10-31', previous: null })
    expect(scheduleMonth('2027-11', today)).toMatchObject({ previous: '2027-10', next: null })
    expect(scheduleMonth('2027-02', today)).toMatchObject({ last: '2027-02-28' })
  })

  it('refuses a malformed month and one outside the readable range', () => {
    expect(scheduleMonth('2026-13', today)).toBeNull()
    expect(scheduleMonth('2026-1', today)).toBeNull()
    expect(scheduleMonth('november', today)).toBeNull()
    expect(scheduleMonth('2026-09', today)).toBeNull()
    expect(scheduleMonth('2027-12', today)).toBeNull()
  })
})

describe('datesBetween', () => {
  it('lists every date of the range, across a month end', () => {
    expect(datesBetween('2026-10-30', '2026-11-02')).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02'])
    expect(datesBetween('2026-11-02', '2026-11-01')).toEqual([])
  })
})

describe('localMoment and daySpans', () => {
  it('reads the club-zone date and minute of an instant, with one formatter per zone', () => {
    expect(localMoment(new Date('2026-11-08T16:30:00Z'), WARSAW)).toEqual({ date: '2026-11-08', minute: 17 * 60 + 30 })
    expect(localMoment(new Date('2026-11-08T23:30:00Z'), WARSAW)).toEqual({ date: '2026-11-09', minute: 30 })
    expect(localMoment(new Date('2026-11-08T23:30:00Z'), 'UTC')).toEqual({ date: '2026-11-08', minute: 23 * 60 + 30 })
  })

  it('places an interval within one date', () => {
    const evening = { start: new Date('2026-11-12T17:30:00Z'), end: new Date('2026-11-12T19:00:00Z') }
    expect([...daySpans(evening, WARSAW)]).toEqual([['2026-11-12', { from: 18 * 60 + 30, to: 20 * 60 }]])
  })

  it('splits an interval over several dates and reads an end at midnight as 24:00', () => {
    const long = { start: new Date('2026-11-12T21:00:00Z'), end: new Date('2026-11-14T10:00:00Z') }
    expect([...daySpans(long, WARSAW)]).toEqual([
      ['2026-11-12', { from: 22 * 60, to: 1440 }],
      ['2026-11-13', { from: 0, to: 1440 }],
      ['2026-11-14', { from: 0, to: 11 * 60 }],
    ])
    const untilMidnight = { start: new Date('2026-11-12T21:00:00Z'), end: new Date('2026-11-12T23:00:00Z') }
    expect([...daySpans(untilMidnight, WARSAW)]).toEqual([['2026-11-12', { from: 22 * 60, to: 1440 }]])
    const pastMidnight = { start: new Date('2026-11-12T21:00:00Z'), end: new Date('2026-11-13T23:00:00Z') }
    expect([...daySpans(pastMidnight, WARSAW)]).toEqual([
      ['2026-11-12', { from: 22 * 60, to: 1440 }],
      ['2026-11-13', { from: 0, to: 1440 }],
    ])
  })

  it('keeps an entry over the repeated autumn hour by its length', () => {
    // 2026-10-25 in Warsaw: 02:30 CEST (00:30Z) to 02:15 CET (01:15Z) is 45 minutes, not an inverted interval.
    const night = { start: new Date('2026-10-25T00:30:00Z'), end: new Date('2026-10-25T01:15:00Z') }
    expect([...daySpans(night, WARSAW)]).toEqual([['2026-10-25', { from: 2 * 60 + 30, to: 3 * 60 + 15 }]])
  })

  it('places nothing for an empty, inverted or sub-minute interval', () => {
    const at = new Date('2026-11-12T17:30:00Z')
    expect(daySpans({ start: at, end: at }, WARSAW).size).toBe(0)
    expect(daySpans({ start: at, end: new Date(at.getTime() + 30_000) }, WARSAW).size).toBe(0)
    expect(daySpans({ start: at, end: new Date(at.getTime() - 60_000) }, WARSAW).size).toBe(0)
  })
})

describe('publicDaySlots', () => {
  const zones = [
    { from: '16:00', to: '17:30', zone: 'public_free' as const },
    { from: '17:30', to: '19:30', zone: 'club_training' as const },
    { from: '19:30', to: '22:00', zone: 'reservable_paid' as const },
  ]

  it('shows the zones of a quiet day and offers a request on a long enough bookable stretch', () => {
    expect(publicDaySlots({ zones, opening: null, entries: [], requestsEnabled: true, notBefore: 0 })).toEqual([
      { from: '16:00', to: '17:30', state: 'public_free', canRequest: false },
      { from: '17:30', to: '19:30', state: 'club_training', canRequest: false },
      { from: '19:30', to: '22:00', state: 'bookable', canRequest: true },
    ])
  })

  it('covers the zones with the entries by rank and merges equal neighbours', () => {
    const slots = publicDaySlots({
      zones,
      opening: null,
      entries: [
        { from: 17 * 60 + 30, to: 19 * 60, state: 'club' },
        { from: 19 * 60, to: 19 * 60 + 30, state: 'club' },
        { from: 19 * 60 + 30, to: 21 * 60, state: 'requested' },
        { from: 20 * 60, to: 21 * 60, state: 'booked' },
      ],
      requestsEnabled: true,
      notBefore: 0,
    })
    expect(slots).toEqual([
      { from: '16:00', to: '17:30', state: 'public_free', canRequest: false },
      { from: '17:30', to: '19:30', state: 'club', canRequest: false },
      { from: '19:30', to: '20:00', state: 'requested', canRequest: false },
      { from: '20:00', to: '21:00', state: 'booked', canRequest: false },
      { from: '21:00', to: '22:00', state: 'bookable', canRequest: false },
    ])
  })

  it('lets a closure win over everything and shows entries outside every zone', () => {
    const slots = publicDaySlots({
      zones,
      opening: null,
      entries: [
        { from: 0, to: 1440, state: 'closed' },
        { from: 19 * 60 + 30, to: 21 * 60, state: 'booked' },
      ],
      requestsEnabled: true,
      notBefore: 0,
    })
    expect(slots).toEqual([{ from: '00:00', to: '24:00', state: 'closed', canRequest: false }])
    expect(
      publicDaySlots({
        zones: [],
        opening: null,
        entries: [{ from: 8 * 60, to: 9 * 60 + 30, state: 'club' }],
        requestsEnabled: false,
        notBefore: 0,
      }),
    ).toEqual([{ from: '08:00', to: '09:30', state: 'club', canRequest: false }])
  })

  it('keeps the zones inside the opening windows and shows nothing on a day without them', () => {
    const opening = [
      { from: '17:00', to: '21:00' },
      { from: '21:30', to: '24:00' },
    ]
    expect(publicDaySlots({ zones, opening, entries: [], requestsEnabled: true, notBefore: 0 })).toEqual([
      { from: '17:00', to: '17:30', state: 'public_free', canRequest: false },
      { from: '17:30', to: '19:30', state: 'club_training', canRequest: false },
      { from: '19:30', to: '21:00', state: 'bookable', canRequest: true },
      { from: '21:30', to: '22:00', state: 'bookable', canRequest: false },
    ])
    expect(publicDaySlots({ zones, opening: [], entries: [], requestsEnabled: true, notBefore: 0 })).toEqual([])
  })

  it('reads a zone that ends at midnight as 24:00', () => {
    const late = [{ from: '22:00', to: '00:00', zone: 'reservable_paid' as const }]
    expect(publicDaySlots({ zones: late, opening: null, entries: [], requestsEnabled: true, notBefore: 0 })).toEqual([
      { from: '22:00', to: '24:00', state: 'bookable', canRequest: true },
    ])
  })

  it('offers a request while a 90-minute unit of a started stretch is still ahead', () => {
    const bookable = [{ from: '08:00', to: '16:00', zone: 'reservable_paid' as const }]
    expect(
      publicDaySlots({ zones: bookable, opening: null, entries: [], requestsEnabled: true, notBefore: 9 * 60 })[0],
    ).toMatchObject({ state: 'bookable', canRequest: true })
    expect(
      publicDaySlots({ zones: bookable, opening: null, entries: [], requestsEnabled: true, notBefore: 15 * 60 })[0],
    ).toMatchObject({ state: 'bookable', canRequest: false })
  })

  it('offers no request when requests are off or the stretch has started', () => {
    const bookable = [{ from: '19:30', to: '22:00', zone: 'reservable_paid' as const }]
    expect(
      publicDaySlots({ zones: bookable, opening: null, entries: [], requestsEnabled: false, notBefore: 0 })[0],
    ).toMatchObject({ state: 'bookable', canRequest: false })
    expect(
      publicDaySlots({
        zones: bookable,
        opening: null,
        entries: [],
        requestsEnabled: true,
        notBefore: 20 * 60 + 31,
      })[0],
    ).toMatchObject({ state: 'bookable', canRequest: false })
  })
})

describe('firstRequestMinute', () => {
  const now = { date: '2026-11-08', minute: 17 * 60 + 30 }

  it('allows nothing on a past day, the rest of today and all of a later day', () => {
    expect(firstRequestMinute('2026-11-07', now)).toBe(1440)
    expect(firstRequestMinute('2026-11-08', now)).toBe(17 * 60 + 30)
    expect(firstRequestMinute('2026-11-09', now)).toBe(0)
  })
})

describe('publicRates', () => {
  const rate = (overrides: Partial<RentalRateShape>): RentalRateShape => ({
    placeId: 'p1',
    renterCategory: 'external_commercial',
    pricePer90: 20000,
    seasonFrom: null,
    seasonTo: null,
    includesLighting: false,
    validFrom: '2026-01-01',
    validTo: null,
    ...overrides,
  })

  it('lists the public categories in force in the month, by category and price', () => {
    const rates = [
      rate({ pricePer90: 30000 }),
      rate({ renterCategory: 'municipal_club', pricePer90: 15000 }),
      rate({ pricePer90: 25000, seasonFrom: '11-01', seasonTo: '03-31', includesLighting: true }),
      rate({ renterCategory: 'municipal_club_winter_lighting', pricePer90: 18000 }),
      rate({ placeId: 'p2' }),
      rate({ validFrom: '2026-12-01' }),
      rate({ validTo: '2026-10-31' }),
      rate({ renterCategory: 'municipal_club', pricePer90: 12000, validTo: '2026-11-15' }),
      rate({ pricePer90: 9000, seasonFrom: '05-01', seasonTo: '09-30' }),
    ]
    expect(publicRates(rates, 'p1', '2026-11-01', '2026-11-30')).toEqual([
      { category: 'municipal_club', pricePer90: 12000, seasonFrom: null, seasonTo: null, includesLighting: false },
      { category: 'municipal_club', pricePer90: 15000, seasonFrom: null, seasonTo: null, includesLighting: false },
      {
        category: 'external_commercial',
        pricePer90: 25000,
        seasonFrom: '11-01',
        seasonTo: '03-31',
        includesLighting: true,
      },
      {
        category: 'external_commercial',
        pricePer90: 30000,
        seasonFrom: null,
        seasonTo: null,
        includesLighting: false,
      },
    ])
  })
})
