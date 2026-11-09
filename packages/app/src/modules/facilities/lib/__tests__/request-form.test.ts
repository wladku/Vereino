import { describe, expect, it } from '@jest/globals'
import {
  REQUEST_START_STEP_MINUTES,
  REQUEST_UNIT_MINUTES,
  indicativeAmount,
  requestMaxUnits,
  requestNotBefore,
  requestStartMinutes,
  stretchMinutes,
  timeToExpiry,
  wallTimeOf,
  type IndicativeRate,
} from '../request-form'

describe('request form: start times and units (#125, P-04)', () => {
  it('uses a 30-minute grid and 90-minute units', () => {
    expect(REQUEST_START_STEP_MINUTES).toBe(30)
    expect(REQUEST_UNIT_MINUTES).toBe(90)
  })

  it('reads a stretch in minutes, an end at midnight as 1440', () => {
    expect(stretchMinutes({ from: '13:00', to: '16:00' })).toEqual({ from: 780, to: 960 })
    expect(stretchMinutes({ from: '22:00', to: '00:00' })).toEqual({ from: 1320, to: 1440 })
    expect(stretchMinutes({ from: '22:00', to: '24:00' })).toEqual({ from: 1320, to: 1440 })
  })

  it('writes a minute of the day as HH:MM', () => {
    expect(wallTimeOf(0)).toBe('00:00')
    expect(wallTimeOf(1185)).toBe('19:45')
  })

  it('offers the stretch start and every later half hour that leaves room for one unit', () => {
    expect(requestStartMinutes({ from: 780, to: 960 }, -1)).toEqual([780, 810, 840, 870])
    // An odd start: the start itself, then the grid.
    expect(requestStartMinutes({ from: 1185, to: 1320 }, -1)).toEqual([1185, 1200, 1230])
    // Too short for a unit: nothing.
    expect(requestStartMinutes({ from: 690, to: 720 }, -1)).toEqual([])
  })

  it('offers only starts after the current minute today', () => {
    expect(requestStartMinutes({ from: 780, to: 960 }, 800)).toEqual([810, 840, 870])
    expect(requestStartMinutes({ from: 780, to: 960 }, 810)).toEqual([840, 870])
  })

  it('compares with the current minute today and with nothing on a later day', () => {
    expect(requestNotBefore('2026-11-18', { date: '2026-11-18', minute: 600 })).toBe(600)
    expect(requestNotBefore('2026-11-19', { date: '2026-11-18', minute: 600 })).toBe(-1)
  })

  it('counts the whole units up to the stretch end, at most 4', () => {
    expect(requestMaxUnits(780, 960)).toBe(2)
    expect(requestMaxUnits(780, 869)).toBe(0)
    expect(requestMaxUnits(480, 1320)).toBe(4)
    expect(requestMaxUnits(900, 800)).toBe(0)
  })
})

describe('request form: indicative amount (#125, P-04)', () => {
  const rates: IndicativeRate[] = [
    { category: 'municipal_club', pricePer90: 15_000, seasonFrom: null, seasonTo: null },
    { category: 'municipal_club', pricePer90: 12_000, seasonFrom: '04-01', seasonTo: '09-30' },
    { category: 'external_commercial', pricePer90: 25_000, seasonFrom: '11-01', seasonTo: '03-31' },
  ]

  it('takes the seasonal rate covering the date first', () => {
    expect(indicativeAmount(rates, 'municipal_club', '2027-05-12', 2)).toBe(24_000)
  })

  it('falls back to the all-year rate outside the season', () => {
    expect(indicativeAmount(rates, 'municipal_club', '2026-11-18', 1)).toBe(15_000)
  })

  it('answers null without a rate for the category and date', () => {
    expect(indicativeAmount(rates, 'external_commercial', '2027-06-01', 1)).toBeNull()
    expect(indicativeAmount(rates, 'municipal_club_winter_lighting', '2026-11-18', 1)).toBeNull()
  })

  it('treats a half-given season as all-year', () => {
    const odd: IndicativeRate[] = [
      { category: 'external_commercial', pricePer90: 100, seasonFrom: '01-01', seasonTo: null },
    ]
    expect(indicativeAmount(odd, 'external_commercial', '2026-11-18', 3)).toBe(300)
  })
})

describe('request queue: time to expiry (#125, B-25)', () => {
  const now = new Date('2026-11-09T12:00:00Z')

  it('answers whole hours and minutes left', () => {
    expect(timeToExpiry(new Date('2026-11-11T11:15:30Z'), now)).toEqual({ hours: 47, minutes: 15 })
    expect(timeToExpiry(new Date('2026-11-09T12:20:00Z'), now)).toEqual({ hours: 0, minutes: 20 })
  })

  it('answers null once the hold has passed or the instant is invalid', () => {
    expect(timeToExpiry(new Date('2026-11-09T12:00:30Z'), now)).toBeNull()
    expect(timeToExpiry(new Date('2026-11-09T11:00:00Z'), now)).toBeNull()
    expect(timeToExpiry(new Date('invalid'), now)).toBeNull()
  })
})
