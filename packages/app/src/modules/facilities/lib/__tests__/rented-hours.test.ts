import { describe, expect, it } from '@jest/globals'
import {
  compareNames,
  rentedHoursCsv,
  rentedHoursReport,
  reportingPlaceOf,
  type RentedPlaceInput,
  type RentedSessionInput,
} from '../rented-hours'

const TZ = 'Europe/Warsaw'

const hall: RentedPlaceInput = { id: 'hall', name: 'School hall', descendantIds: ['court-a', 'court-b'] }
const court: RentedPlaceInput = { id: 'court-b', name: 'Court B', descendantIds: [] }
const pool: RentedPlaceInput = { id: 'pool', name: 'Pool', descendantIds: [] }

/** A session of `minutes` starting at the instant `startIso`. */
function session(
  placeId: string,
  startIso: string,
  minutes: number,
  patch: Partial<RentedSessionInput> = {},
): RentedSessionInput {
  const start = new Date(startIso)
  return {
    placeId,
    start,
    end: new Date(start.getTime() + minutes * 60_000),
    groupId: 'u10',
    groupName: 'U10',
    coachPersonId: 'coach-1',
    ...patch,
  }
}

const coachNames = new Map([
  ['coach-1', 'Anna Nowak'],
  ['coach-2', 'Bartek Kowalski'],
])

function report(places: readonly RentedPlaceInput[], sessions: readonly RentedSessionInput[]) {
  return rentedHoursReport({ from: '2026-11-01', to: '2026-12-31', timeZone: TZ, places, sessions, coachNames })
}

describe('reportingPlaceOf', () => {
  it('maps a flagged place and its descendants to it, and a nested flagged place to itself', () => {
    const owner = reportingPlaceOf([hall, court])
    expect(owner.get('hall')).toEqual({ place: hall, rank: 0 })
    expect(owner.get('court-a')).toEqual({ place: hall, rank: 0 })
    expect(owner.get('court-b')).toEqual({ place: court, rank: 1 })
    expect(owner.has('pitch')).toBe(false)
  })

  it('does not depend on the order of the places', () => {
    expect(reportingPlaceOf([court, hall]).get('court-b')).toEqual({ place: court, rank: 0 })
  })
})

describe('compareNames', () => {
  it('orders names by locale and puts a missing name last', () => {
    expect(compareNames('A', 'A')).toBe(0)
    expect(compareNames(null, null)).toBe(0)
    expect(compareNames(null, 'A')).toBe(1)
    expect(compareNames('A', null)).toBe(-1)
    expect(compareNames('A', 'B')).toBeLessThan(0)
  })
})

describe('rentedHoursReport', () => {
  it('counts 8 sessions of 90 minutes in November as 12 hours (AC of #129)', () => {
    const sessions = Array.from({ length: 8 }, (_, index) =>
      session('hall', `2026-11-${String(index * 3 + 2).padStart(2, '0')}T16:00:00Z`, 90),
    )
    const result = report([hall], sessions)
    expect(result.totals).toEqual([
      { placeId: 'hall', placeName: 'School hall', month: '2026-11', sessions: 8, hours: 12 },
    ])
    expect(result.rows).toEqual([
      {
        placeId: 'hall',
        placeName: 'School hall',
        month: '2026-11',
        groupId: 'u10',
        groupName: 'U10',
        coachPersonId: 'coach-1',
        coachName: 'Anna Nowak',
        sessions: 8,
        hours: 12,
      },
    ])
    expect(result.places).toEqual([{ id: 'hall', name: 'School hall' }])
    expect(result).toMatchObject({ from: '2026-11-01', to: '2026-12-31', timeZone: TZ })
  })

  it('leaves out sessions on places that are not rented', () => {
    const result = report([hall], [session('pitch', '2026-11-02T16:00:00Z', 90)])
    expect(result.rows).toEqual([])
    expect(result.totals).toEqual([])
  })

  it('splits by place, club-zone month, group and coach, and sorts by place order, month, group and coach', () => {
    const result = report(
      [hall, pool],
      [
        // 30 November 23:30 UTC is 1 December 00:30 in Warsaw: a December session.
        session('court-a', '2026-11-30T23:30:00Z', 60),
        session('pool', '2026-11-03T16:00:00Z', 45),
        session('court-a', '2026-11-04T16:00:00Z', 60, { groupId: 'u12', groupName: 'U12', coachPersonId: 'coach-2' }),
        session('hall', '2026-11-05T16:00:00Z', 60, { coachPersonId: null }),
        session('hall', '2026-11-06T16:00:00Z', 60),
        session('hall', '2026-11-07T16:00:00Z', 60, { groupId: 'gone', groupName: null, coachPersonId: 'coach-9' }),
      ],
    )
    expect(
      result.rows.map((row) => [row.placeId, row.month, row.groupName, row.coachName, row.sessions, row.hours]),
    ).toEqual([
      ['hall', '2026-11', 'U10', 'Anna Nowak', 1, 1],
      ['hall', '2026-11', 'U10', null, 1, 1],
      ['hall', '2026-11', 'U12', 'Bartek Kowalski', 1, 1],
      ['hall', '2026-11', null, null, 1, 1],
      ['hall', '2026-12', 'U10', 'Anna Nowak', 1, 1],
      ['pool', '2026-11', 'U10', 'Anna Nowak', 1, 0.75],
    ])
    expect(result.totals).toEqual([
      { placeId: 'hall', placeName: 'School hall', month: '2026-11', sessions: 4, hours: 4 },
      { placeId: 'hall', placeName: 'School hall', month: '2026-12', sessions: 1, hours: 1 },
      { placeId: 'pool', placeName: 'Pool', month: '2026-11', sessions: 1, hours: 0.75 },
    ])
  })

  it('adds up the rounded rows so the totals match the screen and the CSV', () => {
    const result = report(
      [pool],
      [
        session('pool', '2026-11-02T16:00:00Z', 20),
        session('pool', '2026-11-03T16:00:00Z', 20, { groupId: 'u12', groupName: 'U12' }),
        session('pool', '2026-11-04T16:00:00Z', 20, { groupId: 'u14', groupName: 'U14' }),
      ],
    )
    expect(result.rows.map((row) => row.hours)).toEqual([0.33, 0.33, 0.33])
    expect(result.totals[0].hours).toBe(0.99)
  })

  it('counts a session that ends before it starts as no time', () => {
    const start = new Date('2026-11-02T16:00:00Z')
    const result = report([pool], [{ ...session('pool', start.toISOString(), 0), end: new Date(start.getTime() - 1) }])
    expect(result.rows[0]).toMatchObject({ sessions: 1, hours: 0 })
  })
})

describe('rentedHoursCsv', () => {
  it('writes the totals, then the rows, with the same figures and neutralized text', () => {
    const csv = rentedHoursCsv(
      report(
        [{ id: 'hall', name: '=Hall, "A"', descendantIds: [] }],
        [
          session('hall', '2026-11-02T16:00:00Z', 90),
          session('hall', '2026-11-03T16:00:00Z', 90, { groupName: null, coachPersonId: null }),
        ],
      ),
    )
    expect(csv).toBe(
      [
        'place,month,sessions,hours',
        `"'=Hall, ""A""",2026-11,2,3.00`,
        '',
        'place,month,group,coach,sessions,hours',
        `"'=Hall, ""A""",2026-11,U10,Anna Nowak,1,1.50`,
        `"'=Hall, ""A""",2026-11,,,1,1.50`,
        '',
      ].join('\r\n'),
    )
  })
})
