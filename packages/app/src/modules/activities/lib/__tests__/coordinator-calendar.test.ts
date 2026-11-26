// TEST-W07 (unit part, calendar range switch spec REQ-W07, DD-W02, DD-W03): the coordinator calendar's view, day and
// section in the address, the dates its grid shows and the dates it reads.
import { describe, expect, it } from '@jest/globals'
import {
  AGENDA_DAYS,
  AGENDA_VIEW,
  coordinatorCalendarHref,
  coordinatorCalendarState,
  coordinatorGridDates,
  coordinatorReadWindow,
} from '../coordinator-calendar'

const today = '2026-11-26'
const params = (query: string) => new URLSearchParams(query)

describe('coordinatorCalendarState', () => {
  it('opens Day on a phone and Week from md, or the view, day and section of the address', () => {
    expect(coordinatorCalendarState(params('view=calendar'), false, today)).toEqual({
      range: 'day',
      anchor: today,
      sectionId: null,
    })
    expect(coordinatorCalendarState(params('view=calendar'), true, today)).toMatchObject({ range: 'week' })
    expect(coordinatorCalendarState(params('range=agenda&date=2026-12-01&section=s1'), true, today)).toEqual({
      range: AGENDA_VIEW,
      anchor: '2026-12-01',
      sectionId: 's1',
    })
    expect(coordinatorCalendarState(params('section='), true, today).sectionId).toBeNull()
  })
})

describe('coordinatorGridDates and coordinatorReadWindow', () => {
  it('shows the day, the Monday–Sunday week, the month and the 14 agenda days from today', () => {
    expect(AGENDA_DAYS).toBe(14)
    expect(coordinatorGridDates('day', '2026-12-02', today)).toEqual({ from: '2026-12-02', to: '2026-12-02' })
    expect(coordinatorGridDates('week', '2026-12-02', today)).toEqual({ from: '2026-11-30', to: '2026-12-06' })
    expect(coordinatorGridDates('month', '2026-12-02', today)).toEqual({ from: '2026-12-01', to: '2026-12-31' })
    expect(coordinatorGridDates('agenda', '2027-03-01', today)).toEqual({ from: today, to: '2026-12-09' })
  })

  it('reads a week from the Sunday before its Monday, every other view as shown', () => {
    expect(coordinatorReadWindow('week', '2026-12-02', today)).toEqual({ from: '2026-11-29', to: '2026-12-06' })
    expect(coordinatorReadWindow('month', '2026-12-02', today)).toEqual({ from: '2026-12-01', to: '2026-12-31' })
  })
})

describe('coordinatorCalendarHref', () => {
  const path = '/backend/activities/occurrences'
  it('keeps the perspective, sets the view and day, and sets or drops the section', () => {
    expect(coordinatorCalendarHref(path, 'view=calendar&section=s1', 'month', '2026-12-01')).toBe(
      `${path}?view=calendar&section=s1&range=month&date=2026-12-01`,
    )
    expect(coordinatorCalendarHref(path, 'view=calendar', 'week', '2026-12-01', 's2')).toBe(
      `${path}?view=calendar&range=week&date=2026-12-01&section=s2`,
    )
    expect(coordinatorCalendarHref(path, 'view=calendar&section=s1', 'week', '2026-12-01', null)).toBe(
      `${path}?view=calendar&range=week&date=2026-12-01`,
    )
  })
})
