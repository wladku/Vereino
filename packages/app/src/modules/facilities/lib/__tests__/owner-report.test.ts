import { describe, expect, it } from '@jest/globals'
import {
  PAID_RENTAL_STATUSES,
  REPORTED_RENTAL_STATUSES,
  clubZoneMinutes,
  hoursOf,
  ownerReportCsv,
  ownerReportEmpty,
  periodDates,
  presetPeriod,
  reportPeriodProblem,
  scheduledZoneMinutes,
  shiftPeriod,
  type OwnerReport,
} from '../owner-report'
import type { ZoneRuleShape } from '../zones'

const TZ = 'Europe/Warsaw'

const rule = (patch: Partial<ZoneRuleShape>): ZoneRuleShape => ({
  id: 'r',
  placeId: 'pitch',
  weekdays: [1, 2, 3, 4, 5],
  timeFrom: '16:00',
  timeTo: '19:30',
  zone: 'club_training',
  priority: 2,
  source: 'regulations',
  validFrom: '2026-01-01',
  validTo: null,
  ...patch,
})

/** A pitch: club training Mon–Fri 16:00–19:30, bookable Mon–Fri 08:00–16:00 and Sat–Sun 09:00–20:30. */
const PITCH_RULES: ZoneRuleShape[] = [
  rule({ id: 'training' }),
  rule({ id: 'weekday', timeFrom: '08:00', timeTo: '16:00', zone: 'reservable_paid', priority: 3 }),
  rule({ id: 'weekend', weekdays: [6, 7], timeFrom: '09:00', timeTo: '20:30', zone: 'reservable_paid', priority: 3 }),
]

describe('reportPeriodProblem', () => {
  it('accepts a day, a month, a quarter and the longest period of one year less a day', () => {
    expect(reportPeriodProblem('2026-11-10', '2026-11-10')).toBeNull()
    expect(reportPeriodProblem('2026-11-01', '2026-11-30')).toBeNull()
    expect(reportPeriodProblem('2026-10-01', '2026-12-31')).toBeNull()
    expect(reportPeriodProblem('2026-01-01', '2026-12-31')).toBeNull()
  })

  it('refuses an inverted period and one of a year or more (422)', () => {
    expect(reportPeriodProblem('2026-11-30', '2026-11-01')).toBe('report_period_order')
    expect(reportPeriodProblem('2026-01-01', '2027-01-01')).toBe('report_period_too_long')
    expect(reportPeriodProblem('2026-01-01', '2027-06-30')).toBe('report_period_too_long')
  })

  it('reads a year after 29 February as 1 March', () => {
    expect(reportPeriodProblem('2028-02-29', '2029-02-28')).toBeNull()
    expect(reportPeriodProblem('2028-02-29', '2029-03-01')).toBe('report_period_too_long')
  })
})

describe('periods', () => {
  it('lists every date of the period, inclusive', () => {
    expect(periodDates('2026-10-30', '2026-11-02')).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02'])
    expect(periodDates('2026-11-02', '2026-11-01')).toEqual([])
  })

  it('gives the month and the quarter that contain a date', () => {
    expect(presetPeriod('month', '2026-11-10')).toEqual({ from: '2026-11-01', to: '2026-11-30' })
    expect(presetPeriod('month', '2028-02-10')).toEqual({ from: '2028-02-01', to: '2028-02-29' })
    expect(presetPeriod('quarter', '2026-11-10')).toEqual({ from: '2026-10-01', to: '2026-12-31' })
    expect(presetPeriod('quarter', '2026-01-01')).toEqual({ from: '2026-01-01', to: '2026-03-31' })
  })

  it('moves to the previous or next month or quarter, across years', () => {
    expect(shiftPeriod('month', '2026-01-01', -1)).toEqual({ from: '2025-12-01', to: '2025-12-31' })
    expect(shiftPeriod('month', '2026-11-01', 1)).toEqual({ from: '2026-12-01', to: '2026-12-31' })
    expect(shiftPeriod('quarter', '2026-10-01', 1)).toEqual({ from: '2027-01-01', to: '2027-03-31' })
    expect(shiftPeriod('quarter', '2026-01-01', -1)).toEqual({ from: '2025-10-01', to: '2025-12-31' })
  })
})

describe('hoursOf', () => {
  it('rounds minutes to hours with two decimals', () => {
    expect(hoursOf(90)).toBe(1.5)
    expect(hoursOf(20)).toBe(0.33)
    expect(hoursOf(0)).toBe(0)
  })
})

describe('scheduledZoneMinutes', () => {
  it('adds the effective zones of every place over the dates', () => {
    // Mon 2026-11-02 … Sun 2026-11-08: 5 × 3.5 h training, 5 × 8 h + 2 × 11.5 h bookable.
    const week = periodDates('2026-11-02', '2026-11-08')
    const hall = [
      rule({ id: 'hall', placeId: 'hall', weekdays: [1], timeFrom: '10:00', timeTo: '12:00', zone: 'public_free' }),
    ]
    const totals = scheduledZoneMinutes(
      new Map([
        ['pitch', PITCH_RULES],
        ['hall', hall],
      ]),
      week,
    )
    expect(totals).toEqual({
      public_free: 120,
      club_training: 5 * 210,
      reservable_paid: 5 * 480 + 2 * 690,
      closed: 0,
    })
  })

  it('counts nothing before a rule is valid', () => {
    const later = PITCH_RULES.map((entry) => ({ ...entry, validFrom: '2026-11-05' }))
    const totals = scheduledZoneMinutes(new Map([['pitch', later]]), periodDates('2026-11-02', '2026-11-04'))
    expect(totals.club_training + totals.reservable_paid).toBe(0)
  })
})

describe('clubZoneMinutes', () => {
  const dates = periodDates('2026-11-02', '2026-11-08')
  const window = {
    start: new Date('2026-11-01T23:00:00Z'), // 2026-11-02 00:00 in Warsaw (CET)
    end: new Date('2026-11-08T23:00:00Z'),
  }
  const rules = new Map([['pitch', PITCH_RULES]])

  it('splits each entry by the zones of its own place and counts the rest as no zone', () => {
    const totals = clubZoneMinutes(
      [
        // Tue 17:00–18:30: club training.
        { placeId: 'pitch', start: new Date('2026-11-03T16:00:00Z'), end: new Date('2026-11-03T17:30:00Z') },
        // Wed 15:00–17:00: an hour bookable, an hour club training.
        { placeId: 'pitch', start: new Date('2026-11-04T14:00:00Z'), end: new Date('2026-11-04T16:00:00Z') },
        // Thu 21:00–22:00: outside every zone.
        { placeId: 'pitch', start: new Date('2026-11-05T20:00:00Z'), end: new Date('2026-11-05T21:00:00Z') },
        // A place without rules: no zone.
        { placeId: 'hall', start: new Date('2026-11-05T09:00:00Z'), end: new Date('2026-11-05T10:00:00Z') },
      ],
      rules,
      dates,
      TZ,
      window,
    )
    expect(totals).toEqual({ public_free: 0, club_training: 150, reservable_paid: 60, closed: 0, none: 120 })
  })

  it('clips entries to the window and skips entries outside it', () => {
    const totals = clubZoneMinutes(
      [
        // Sun 2026-11-08 20:00 – Mon 2026-11-09 10:00 local: only 20:00–20:30 bookable and 20:30–24:00 no zone count.
        { placeId: 'pitch', start: new Date('2026-11-08T19:00:00Z'), end: new Date('2026-11-09T09:00:00Z') },
        { placeId: 'pitch', start: new Date('2026-11-10T09:00:00Z'), end: new Date('2026-11-10T10:00:00Z') },
      ],
      rules,
      dates,
      TZ,
      window,
    )
    expect(totals).toEqual({ public_free: 0, club_training: 0, reservable_paid: 30, closed: 0, none: 210 })
  })

  it('reads a zone that runs to midnight', () => {
    const night = new Map([['pitch', [rule({ weekdays: [1], timeFrom: '22:00', timeTo: '24:00', zone: 'closed' })]]])
    const totals = clubZoneMinutes(
      [{ placeId: 'pitch', start: new Date('2026-11-02T21:30:00Z'), end: new Date('2026-11-02T23:30:00Z') }],
      night,
      dates,
      TZ,
      window,
    )
    expect(totals).toEqual({ public_free: 0, club_training: 0, reservable_paid: 0, closed: 90, none: 30 })
  })
})

describe('rental statuses', () => {
  it('counts every billable rental and treats the confirmed and done ones as paid', () => {
    expect(REPORTED_RENTAL_STATUSES).toEqual(['requested', 'confirmed', 'done', 'cancelled_late', 'no_show'])
    expect(PAID_RENTAL_STATUSES.every((status) => REPORTED_RENTAL_STATUSES.includes(status))).toBe(true)
  })
})

const report = (patch: Partial<OwnerReport> = {}): OwnerReport => ({
  place: { id: 'pitch', name: 'Boisko A' },
  from: '2026-11-01',
  to: '2026-11-30',
  timeZone: TZ,
  currency: 'PLN',
  zoneHours: { public_free: 0, club_training: 73.5, reservable_paid: 180.5, closed: 0 },
  clubTime: {
    total: 5,
    sessions: 3,
    bookings: 2,
    byZone: { public_free: 0, club_training: 3, reservable_paid: 2, closed: 0, none: 0 },
  },
  rentals: {
    count: 2,
    value: 75_000,
    items: [
      {
        id: 'r1',
        start: '2026-11-05T07:00:00.000Z',
        end: '2026-11-05T10:00:00.000Z',
        renter: 'KS "Sąsiedzi", Gmina',
        units: 2,
        amount: 50_000,
        status: 'confirmed',
      },
      {
        id: 'r2',
        start: '2026-11-07T09:00:00.000Z',
        end: '2026-11-07T10:30:00.000Z',
        renter: '=HYPERLINK()',
        units: 1,
        amount: 25_000,
        status: 'requested',
      },
    ],
  },
  payments: { amount: 50_000, count: 1, source: 'rental_register' },
  incidents: { count: 1 },
  maintenance: { done: 1, cost: 12_050 },
  ...patch,
})

describe('ownerReportEmpty', () => {
  const nothing = report({
    clubTime: { total: 0, sessions: 0, bookings: 0, byZone: report().clubTime.byZone },
    rentals: { count: 0, value: 0, items: [] },
    payments: { amount: 0, count: 0, source: 'rental_register' },
    incidents: { count: 0 },
    maintenance: { done: 0, cost: 0 },
  })

  it('is empty only when nothing happened at the facility, whatever the zones', () => {
    expect(ownerReportEmpty(nothing)).toBe(true)
    expect(ownerReportEmpty(report())).toBe(false)
    expect(ownerReportEmpty({ ...nothing, clubTime: report().clubTime })).toBe(false)
    expect(ownerReportEmpty({ ...nothing, rentals: report().rentals })).toBe(false)
    expect(ownerReportEmpty({ ...nothing, payments: report().payments })).toBe(false)
    expect(ownerReportEmpty({ ...nothing, incidents: { count: 1 } })).toBe(false)
    expect(ownerReportEmpty({ ...nothing, maintenance: { done: 1, cost: 0 } })).toBe(false)
  })
})

describe('ownerReportCsv', () => {
  it('writes the summary and the rentals with local times, quoted and formula-safe', () => {
    const lines = ownerReportCsv(report()).split('\r\n')
    expect(lines).toEqual([
      'section,item,value',
      'report,place,Boisko A',
      'report,from,2026-11-01',
      'report,to,2026-11-30',
      'report,currency,PLN',
      'zone_hours,public_free,0.00',
      'zone_hours,club_training,73.50',
      'zone_hours,reservable_paid,180.50',
      'zone_hours,closed,0.00',
      'club_time,total,5.00',
      'club_time,sessions,3.00',
      'club_time,bookings,2.00',
      'club_time_by_zone,public_free,0.00',
      'club_time_by_zone,club_training,3.00',
      'club_time_by_zone,reservable_paid,2.00',
      'club_time_by_zone,closed,0.00',
      'club_time_by_zone,none,0.00',
      'rentals,count,2',
      'rentals,value,750.00',
      'payments,amount,500.00',
      'payments,count,1',
      'payments,source,rental_register',
      'incidents,count,1',
      'maintenance,done,1',
      'maintenance,cost,120.50',
      '',
      'date,from,to,renter,units,amount,status',
      '2026-11-05,08:00,11:00,"KS ""Sąsiedzi"", Gmina",2,500.00,confirmed',
      "2026-11-07,10:00,11:30,'=HYPERLINK(),1,250.00,requested",
      '',
    ])
  })

  it('writes a negative amount with its sign', () => {
    const csv = ownerReportCsv(report({ maintenance: { done: 0, cost: -5 } }))
    expect(csv).toContain('maintenance,cost,-0.05\r\n')
  })
})
