import { describe, expect, it } from '@jest/globals'
import {
  CALENDAR_RANGE_INVALID,
  calendarRangeRetry,
  memberCalendarHref,
  memberCalendarState,
  memberCalendarWindow,
  mergeCalendarEntries,
  requestedCalendarRange,
  UPCOMING_DAYS,
  UPCOMING_VIEW,
} from '../member-calendar'

// E06-S18 (#100), REQ-W06 (#784): the member calendar's views, the link range and the trimmed retry. Every date is a
// fixed calendar date: nothing here depends on the weekday or the hour the test runs at.
const params = (query: string) => new URLSearchParams(query)

describe('member calendar views', () => {
  it('opens Day on a phone and Week from md, or the view and date of the address', () => {
    const today = '2026-11-26'
    expect(memberCalendarState(params(''), false, today)).toEqual({ view: 'day', anchor: today, link: null })
    expect(memberCalendarState(params(''), true, today)).toEqual({ view: 'week', anchor: today, link: null })
    expect(memberCalendarState(params('range=upcoming'), true, today)).toEqual({
      view: UPCOMING_VIEW,
      anchor: today,
      link: null,
    })
    expect(memberCalendarState(params('range=month&date=2026-12-03'), false, today)).toEqual({
      view: 'month',
      anchor: '2026-12-03',
      link: null,
    })
  })

  it('keeps a link range (#493) unless the address names a view', () => {
    const today = '2026-11-26'
    expect(memberCalendarState(params('from=2026-11-02&to=2026-11-08'), false, today)).toEqual({
      view: 'day',
      anchor: today,
      link: { from: '2026-11-02', to: '2026-11-08' },
    })
    expect(memberCalendarState(params('from=2026-11-02&to=2026-11-08&range=week'), false, today).link).toBeNull()
  })

  it('reads the upcoming list from today, or the day, the Monday–Sunday week or the month of the anchor', () => {
    expect(UPCOMING_DAYS).toBe(14)
    expect(memberCalendarWindow('upcoming', '2026-12-25', '2026-11-21')).toEqual({
      from: '2026-11-21',
      to: '2026-12-04',
    })
    expect(memberCalendarWindow('day', '2026-11-05', '2026-11-21')).toEqual({ from: '2026-11-05', to: '2026-11-05' })
    expect(memberCalendarWindow('week', '2026-11-08', '2026-11-21')).toEqual({ from: '2026-11-02', to: '2026-11-08' })
    expect(memberCalendarWindow('month', '2027-02-14', '2026-11-21')).toEqual({ from: '2027-02-01', to: '2027-02-28' })
  })

  it('writes a view into the address and drops a link range', () => {
    expect(memberCalendarHref('/club/calendar', 'as=guardian&from=2026-11-02&to=2026-11-08', 'day', '2026-11-05')).toBe(
      '/club/calendar?as=guardian&range=day&date=2026-11-05',
    )
  })
})

describe('the range from a link', () => {
  it('takes both ends when both are calendar dates', () => {
    expect(requestedCalendarRange('2026-11-02', '2027-01-30')).toEqual({ from: '2026-11-02', to: '2027-01-30' })
    // Inverted is still a request: the API answers 400 and the page asks again for the trimmed range.
    expect(requestedCalendarRange('2026-11-08', '2026-11-02')).toEqual({ from: '2026-11-08', to: '2026-11-02' })
  })

  it('ignores a missing or malformed end', () => {
    expect(requestedCalendarRange(null, '2026-11-08')).toBeNull()
    expect(requestedCalendarRange('2026-11-02', null)).toBeNull()
    expect(requestedCalendarRange('2026-11-02', '2026-02-30')).toBeNull()
    expect(requestedCalendarRange('tomorrow', '2026-11-08')).toBeNull()
  })
})

describe('the retry after a refused range', () => {
  it('asks for the range trimmed to 62 days when the API answers 400 calendar_range_invalid', () => {
    expect(CALENDAR_RANGE_INVALID).toBe('calendar_range_invalid')
    expect(calendarRangeRetry({ from: '2026-11-02', to: '2027-01-30' }, 400, 'calendar_range_invalid')).toEqual({
      from: '2026-11-02',
      to: '2027-01-02',
    })
    expect(calendarRangeRetry({ from: '2026-11-08', to: '2026-11-02' }, 400, 'calendar_range_invalid')).toEqual({
      from: '2026-11-02',
      to: '2026-11-08',
    })
  })

  it('does not retry another failure, or a range trimming would not change', () => {
    const tooLong = { from: '2026-11-02', to: '2027-01-30' }
    expect(calendarRangeRetry(tooLong, 400, 'validation_failed')).toBeNull()
    expect(calendarRangeRetry(tooLong, 403, 'calendar_range_invalid')).toBeNull()
    expect(calendarRangeRetry(tooLong, 500, undefined)).toBeNull()
    expect(calendarRangeRetry({ from: '2026-11-02', to: '2026-11-08' }, 400, 'calendar_range_invalid')).toBeNull()
  })
})

// Spec N (REQ-N07, TEST-N07): the member context lists the member side and the coached sessions in one list.
describe('mergeCalendarEntries', () => {
  const entry = (id: string, startAt: string) => ({ occurrence: { id, startAt } })
  const ward = entry('s-ward', '2026-11-17T16:00:00.000Z')
  const shared = entry('s-shared', '2026-11-17T15:00:00.000Z')
  const coached = entry('s-coached', '2026-11-16T17:30:00.000Z')

  it('merges the lists by start time and shows a shared session once, in the later perspective', () => {
    const merged = mergeCalendarEntries([
      [
        { entry: ward, as: 'guardian' },
        { entry: shared, as: 'guardian' },
      ],
      [
        { entry: shared, as: 'coach' },
        { entry: coached, as: 'coach' },
      ],
    ])
    expect(merged.map((item) => [item.entry.occurrence.id, item.as])).toEqual([
      ['s-coached', 'coach'],
      ['s-shared', 'coach'],
      ['s-ward', 'guardian'],
    ])
  })

  it('keeps one list as it is and an empty input empty', () => {
    expect(mergeCalendarEntries([[{ entry: ward, as: 'self' }]])).toEqual([{ entry: ward, as: 'self' }])
    expect(mergeCalendarEntries([[], []])).toEqual([])
  })
})
