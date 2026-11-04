import { describe, expect, it } from '@jest/globals'
import {
  CALENDAR_RANGE_INVALID,
  CALENDAR_VIEWS,
  calendarRangeRetry,
  calendarViewWindow,
  isCalendarView,
  requestedCalendarRange,
  shiftCalendarAnchor,
  windowContains,
} from '../member-calendar'

// E06-S18 (#100): the member calendar's week and month views, the link range and the trimmed retry. Every date is a
// fixed calendar date: nothing here depends on the weekday or the hour the test runs at.
describe('member calendar views', () => {
  it('knows the week and the month view only', () => {
    expect(CALENDAR_VIEWS).toEqual(['week', 'month'])
    expect(isCalendarView('week')).toBe(true)
    expect(isCalendarView('month')).toBe(true)
    expect(isCalendarView('day')).toBe(false)
    expect(isCalendarView(undefined)).toBe(false)
  })

  it('shows the Monday–Sunday week or the calendar month of the anchor', () => {
    expect(calendarViewWindow('week', '2026-11-05')).toEqual({ from: '2026-11-02', to: '2026-11-08' })
    expect(calendarViewWindow('week', '2026-11-08')).toEqual({ from: '2026-11-02', to: '2026-11-08' })
    expect(calendarViewWindow('month', '2026-11-05')).toEqual({ from: '2026-11-01', to: '2026-11-30' })
    expect(calendarViewWindow('month', '2027-02-14')).toEqual({ from: '2027-02-01', to: '2027-02-28' })
  })

  it('moves the anchor to the first day of the week or month a step away', () => {
    expect(shiftCalendarAnchor('week', '2026-11-08', 1)).toBe('2026-11-09')
    expect(shiftCalendarAnchor('week', '2026-11-05', -1)).toBe('2026-10-26')
    expect(shiftCalendarAnchor('week', '2026-11-05', 0)).toBe('2026-11-02')
    expect(shiftCalendarAnchor('month', '2026-11-30', 1)).toBe('2026-12-01')
    expect(shiftCalendarAnchor('month', '2026-12-15', 1)).toBe('2027-01-01')
    expect(shiftCalendarAnchor('month', '2026-01-31', -1)).toBe('2025-12-01')
  })

  it('tells whether a date falls in a window, both ends included', () => {
    const week = { from: '2026-11-02', to: '2026-11-08' }
    expect(windowContains(week, '2026-11-02')).toBe(true)
    expect(windowContains(week, '2026-11-08')).toBe(true)
    expect(windowContains(week, '2026-11-01')).toBe(false)
    expect(windowContains(week, '2026-11-09')).toBe(false)
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
