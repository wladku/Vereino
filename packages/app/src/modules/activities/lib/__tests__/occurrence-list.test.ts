import { describe, expect, it } from '@jest/globals'
import {
  CANCEL_REASON_MAX_LENGTH,
  CANCEL_REASON_MIN_LENGTH,
  NEEDING_COACH_DAYS_AHEAD,
  OCCURRENCE_PERSPECTIVES,
  coachBadge,
  coachRowAction,
  defaultSessionWindow,
  isCancelReasonValid,
  localCalendarDate,
  perspectiveHref,
  perspectiveOf,
  perspectiveQuery,
  perspectiveStatus,
  perspectiveWindow,
  scheduleRangeWindow,
  sessionRowActions,
} from '../occurrence-list'

// E06-S12 (#94): the sessions list's perspectives, default window, row actions, cancellation reason and the calendar
// range. Instants are fixed; local dates are built with the local-time `Date` constructor, so the zone the test runs
// in does not matter.
describe('sessions list perspectives', () => {
  it('knows All, Needing a coach, Unsettled, Canceled and Calendar and reads anything else as All', () => {
    expect(OCCURRENCE_PERSPECTIVES).toEqual(['all', 'unassigned', 'unsettled', 'cancelled', 'calendar'])
    expect(perspectiveOf('cancelled')).toBe('cancelled')
    expect(perspectiveOf('calendar')).toBe('calendar')
    expect(perspectiveOf('all')).toBe('all')
    expect(perspectiveOf('unassigned')).toBe('unassigned')
    expect(perspectiveOf('unsettled')).toBe('unsettled')
    expect(perspectiveOf('settled')).toBe('all')
    expect(perspectiveOf(null)).toBe('all')
    expect(perspectiveOf(undefined)).toBe('all')
  })

  it('keeps the bare path for All and names the other perspectives in the query', () => {
    expect(perspectiveHref('/backend/activities/occurrences', 'all')).toBe('/backend/activities/occurrences')
    expect(perspectiveHref('/backend/activities/occurrences', 'cancelled')).toBe(
      '/backend/activities/occurrences?perspective=cancelled',
    )
    expect(perspectiveHref('/backend/activities/occurrences', 'calendar')).toBe(
      '/backend/activities/occurrences?perspective=calendar',
    )
  })

  it('pins the cancelled status for Canceled only', () => {
    expect(perspectiveStatus('cancelled')).toBe('cancelled')
    expect(perspectiveStatus('all')).toBeUndefined()
    expect(perspectiveStatus('calendar')).toBeUndefined()
  })
})

describe('sessions list perspective queries and windows (E06-S13)', () => {
  it('pins unassigned=1, unsettled=1 or the cancelled status, and nothing for All and Calendar', () => {
    expect(perspectiveQuery('unassigned')).toEqual({ unassigned: '1' })
    expect(perspectiveQuery('unsettled')).toEqual({ unsettled: '1' })
    expect(perspectiveQuery('cancelled')).toEqual({ status: 'cancelled' })
    expect(perspectiveQuery('all')).toEqual({})
    expect(perspectiveQuery('calendar')).toEqual({})
  })

  it('opens Needing a coach from today for 14 days, Unsettled without a window, the others on the default window', () => {
    expect(NEEDING_COACH_DAYS_AHEAD).toBe(14)
    expect(perspectiveWindow('unassigned', '2026-12-25')).toEqual({ from: '2026-12-25', to: '2027-01-08' })
    expect(perspectiveWindow('unsettled', '2026-11-04')).toBeNull()
    expect(perspectiveWindow('all', '2026-11-04')).toEqual({ from: '2026-10-28', to: '2026-11-18' })
    expect(perspectiveWindow('cancelled', '2026-11-04')).toEqual({ from: '2026-10-28', to: '2026-11-18' })
  })
})

describe('coach row action and badge (E06-S13)', () => {
  it('offers Assign substitute without a coach and Change coach with one, for a planned session and a planner', () => {
    expect(coachRowAction({ status: 'planned', coachPersonId: null }, true)).toBe('assign')
    expect(coachRowAction({ status: 'planned', coachPersonId: 'p1' }, true)).toBe('change')
    expect(coachRowAction({ status: 'planned', coachPersonId: null }, false)).toBeNull()
    expect(coachRowAction({ status: 'done', coachPersonId: 'p1' }, true)).toBeNull()
    expect(coachRowAction({ status: 'cancelled', coachPersonId: null }, true)).toBeNull()
  })

  it('marks a planned session without a coach and a substitute, nothing else', () => {
    expect(coachBadge({ status: 'planned', coachPersonId: null })).toBe('needs_coach')
    expect(coachBadge({ status: 'cancelled', coachPersonId: null })).toBeNull()
    expect(coachBadge({ status: 'planned', coachPersonId: 'p2', substituteForPersonId: 'p1' })).toBe('substitution')
    expect(coachBadge({ status: 'done', coachPersonId: 'p2', substituteForPersonId: 'p1' })).toBe('substitution')
    expect(coachBadge({ status: 'planned', coachPersonId: 'p1', substituteForPersonId: null })).toBeNull()
    expect(coachBadge({ status: 'planned', coachPersonId: 'p1' })).toBeNull()
  })
})

describe('sessions list default window', () => {
  it('runs from 7 days back through 14 days ahead, across month and year ends', () => {
    expect(defaultSessionWindow('2026-11-04')).toEqual({ from: '2026-10-28', to: '2026-11-18' })
    expect(defaultSessionWindow('2026-12-28')).toEqual({ from: '2026-12-21', to: '2027-01-11' })
  })
})

describe('cancellation reason', () => {
  it('needs at least 3 characters once trimmed', () => {
    expect(CANCEL_REASON_MIN_LENGTH).toBe(3)
    expect(CANCEL_REASON_MAX_LENGTH).toBe(500)
    expect(isCancelReasonValid('')).toBe(false)
    expect(isCancelReasonValid('  ab  ')).toBe(false)
    expect(isCancelReasonValid('abc')).toBe(true)
    expect(isCancelReasonValid(' Deszcz ')).toBe(true)
  })
})

describe('session row actions', () => {
  const now = new Date('2026-11-04T12:00:00Z')
  const future = '2026-11-05T16:00:00Z'
  const past = '2026-11-04T11:00:00Z'

  it('offers Cancel for a planned session that has not started', () => {
    expect(sessionRowActions({ status: 'planned', startAt: future }, now, true)).toEqual(['cancel'])
  })

  it('offers nothing for a future session that is cancelled or done', () => {
    expect(sessionRowActions({ status: 'cancelled', startAt: future }, now, true)).toEqual([])
    expect(sessionRowActions({ status: 'done', startAt: future }, now, true)).toEqual([])
  })

  it('offers the attendance list once the session has started, unless it is cancelled', () => {
    expect(sessionRowActions({ status: 'planned', startAt: past }, now, true)).toEqual(['attendance'])
    expect(sessionRowActions({ status: 'planned', startAt: now.toISOString() }, now, true)).toEqual(['attendance'])
    expect(sessionRowActions({ status: 'done', startAt: past }, now, true)).toEqual(['attendance'])
    expect(sessionRowActions({ status: 'cancelled', startAt: past }, now, true)).toEqual([])
  })

  it('offers nothing without activities.coach or without a readable start', () => {
    expect(sessionRowActions({ status: 'planned', startAt: future }, now, false)).toEqual([])
    expect(sessionRowActions({ status: 'planned', startAt: null }, now, true)).toEqual([])
    expect(sessionRowActions({ status: 'planned', startAt: 'not a date' }, now, true)).toEqual([])
  })
})

describe('coordinator calendar range', () => {
  it('formats a local date with padded month and day', () => {
    expect(localCalendarDate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
    expect(localCalendarDate(new Date(2026, 10, 30, 0, 0))).toBe('2026-11-30')
  })

  it('reads the dates of the grid range', () => {
    expect(scheduleRangeWindow({ start: new Date(2026, 10, 2), end: new Date(2026, 10, 8, 23, 59, 59) })).toEqual({
      from: '2026-11-02',
      to: '2026-11-08',
    })
  })

  it('trims a range longer than the 62 days the API serves', () => {
    expect(scheduleRangeWindow({ start: new Date(2026, 0, 1), end: new Date(2026, 5, 30) })).toEqual({
      from: '2026-01-01',
      to: '2026-03-03',
    })
  })
})
