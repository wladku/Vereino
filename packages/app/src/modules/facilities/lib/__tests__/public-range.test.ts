// TEST-W04 (unit part, calendar range switch spec REQ-W04, DD-W03, DD-W07, DD-W08): what P-04's address opens and
// what the page reads for it.
import { describe, expect, it } from '@jest/globals'
import {
  publicRangeHref,
  publicRangeOf,
  publicReadableWindow,
  publicSafeWindow,
  publicScheduleQuery,
  publicScheduleRead,
} from '../public-range'

const today = '2026-11-26'
const params = (query: string) => new URLSearchParams(query)

describe('publicReadableWindow', () => {
  it('runs from the first day of last month to the last day twelve months ahead', () => {
    expect(publicReadableWindow(today)).toEqual({ min: '2026-10-01', max: '2027-11-30' })
  })
})

describe('publicSafeWindow', () => {
  it('stays inside the club zone’s window a day ahead or behind the browser', () => {
    // 30 November in the browser: the club may already be on 1 December (min 1 November) or still on 29 November.
    expect(publicSafeWindow('2026-11-30')).toEqual({ min: '2026-11-01', max: '2027-11-30' })
    // 1 December in the browser: the club may still be on 30 November (max 30 November next year).
    expect(publicSafeWindow('2026-12-01')).toEqual({ min: '2026-11-01', max: '2027-11-30' })
    expect(publicSafeWindow(today)).toEqual({ min: '2026-10-01', max: '2027-11-30' })
  })
})

describe('publicRangeOf', () => {
  it('opens Day on a phone and Week from md without parameters', () => {
    expect(publicRangeOf(params(''), false, today)).toEqual({ range: 'day', anchor: today })
    expect(publicRangeOf(params(''), true, today)).toEqual({ range: 'week', anchor: today })
  })

  it('opens the view and day of the address', () => {
    expect(publicRangeOf(params('range=week&date=2026-12-03'), false, today)).toEqual({
      range: 'week',
      anchor: '2026-12-03',
    })
  })

  it('opens an old ?month= permalink as that month, unless the address names a view', () => {
    expect(publicRangeOf(params('month=2026-12'), false, today)).toEqual({ range: 'month', anchor: '2026-12-01' })
    expect(publicRangeOf(params('month=2026-12&range=day&date=2026-12-05'), true, today)).toEqual({
      range: 'day',
      anchor: '2026-12-05',
    })
    expect(publicRangeOf(params('month=december'), true, today)).toEqual({ range: 'week', anchor: today })
  })

  it('keeps the anchor inside the readable window', () => {
    expect(publicRangeOf(params('month=2026-01'), true, today)).toEqual({ range: 'month', anchor: '2026-10-01' })
    expect(publicRangeOf(params('range=day&date=2030-01-01'), true, today)).toEqual({
      range: 'day',
      anchor: '2027-11-30',
    })
  })
})

describe('publicScheduleRead and publicScheduleQuery', () => {
  it('reads a month by month and a day or a week by its whole week, cut to the window', () => {
    expect(publicScheduleRead('month', '2026-12-15', today)).toEqual({ month: '2026-12' })
    expect(publicScheduleRead('day', '2026-12-02', today)).toEqual({ from: '2026-11-30', to: '2026-12-06' })
    expect(publicScheduleRead('week', '2026-12-02', today)).toEqual({ from: '2026-11-30', to: '2026-12-06' })
    // The week of 1 October 2026 starts on 28 September, before the window.
    expect(publicScheduleRead('day', '2026-10-01', today)).toEqual({ from: '2026-10-01', to: '2026-10-04' })
  })

  it('writes the read as a query string', () => {
    expect(publicScheduleQuery({ month: '2026-12' })).toBe('?month=2026-12')
    expect(publicScheduleQuery({ from: '2026-11-30', to: '2026-12-06' })).toBe('?from=2026-11-30&to=2026-12-06')
  })
})

describe('publicRangeHref', () => {
  it('sets the view and the day and drops an old month', () => {
    expect(publicRangeHref('/p/club/places/pitch', params('month=2026-12'), 'week', '2026-12-03')).toBe(
      '/p/club/places/pitch?range=week&date=2026-12-03',
    )
  })
})
