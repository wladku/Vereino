import { describe, expect, it } from '@jest/globals'
import {
  declarationButtons,
  savedDeclarationKey,
  sessionMoment,
  splitTodaySessions,
  todayEntryNotice,
  weekdayAndTime,
  type TodayEntry,
} from '../club-today'

// E06-S16 (#98): the Today tiles of `/club`. Every date is a fixed calendar date: nothing depends on when the test runs.
function entry(
  occurrenceDate: string,
  startAt: string,
  overrides: Partial<TodayEntry['occurrence']> & { declarationsOpen?: boolean } = {},
): TodayEntry & { id: string } {
  const { declarationsOpen = true, ...occurrence } = overrides
  return {
    id: `${occurrenceDate}@${startAt}`,
    occurrence: { occurrenceDate, startAt, status: 'planned', cancelReason: null, ...occurrence },
    declarationsOpen,
  }
}

const TODAY = '2026-11-02'
const TOMORROW = '2026-11-03'

describe('splitTodaySessions', () => {
  it('lists today and tomorrow in start order and names no next session', () => {
    const later = entry(TOMORROW, '2026-11-03T15:00:00Z')
    const first = entry(TODAY, '2026-11-02T16:00:00Z')
    const outside = entry('2026-11-05', '2026-11-05T15:00:00Z')
    expect(splitTodaySessions([later, outside, first], TODAY, TOMORROW)).toEqual({ soon: [first, later], next: null })
  })

  it('names the first planned session after tomorrow when today and tomorrow are empty, skipping cancelled ones', () => {
    const cancelled = entry('2026-11-04', '2026-11-04T15:00:00Z', { status: 'cancelled' })
    const friday = entry('2026-11-06', '2026-11-06T15:00:00Z')
    const thursday = entry('2026-11-05', '2026-11-05T15:00:00Z')
    expect(splitTodaySessions([cancelled, friday, thursday], TODAY, TOMORROW)).toEqual({ soon: [], next: thursday })
  })

  it('names nothing when the read range holds no later session', () => {
    expect(splitTodaySessions([], TODAY, TOMORROW)).toEqual({ soon: [], next: null })
  })
})

describe('todayEntryNotice', () => {
  it('shows a cancellation with its reason, or without one', () => {
    expect(todayEntryNotice(entry(TODAY, 'x', { status: 'cancelled', cancelReason: 'Rain' }))).toEqual({
      kind: 'cancelled',
      reason: 'Rain',
    })
    expect(todayEntryNotice(entry(TODAY, 'x', { status: 'cancelled' }))).toEqual({ kind: 'cancelled', reason: null })
  })

  it('shows "declarations closed" for a planned session that has started, and nothing for an open or done one', () => {
    expect(todayEntryNotice(entry(TODAY, 'x', { declarationsOpen: false }))).toEqual({ kind: 'closed' })
    expect(todayEntryNotice(entry(TODAY, 'x'))).toBeNull()
    expect(todayEntryNotice(entry(TODAY, 'x', { status: 'done', declarationsOpen: false }))).toBeNull()
  })
})

describe('declarationButtons', () => {
  const ward = { canDeclare: true, guardianOnly: false }

  it('offers the buttons on an open planned session to a guardian and to a member', () => {
    expect(declarationButtons(entry(TODAY, 'x'), ward, 'guardian')).toBe('enabled')
    expect(declarationButtons(entry(TODAY, 'x'), ward, 'self')).toBe('enabled')
  })

  it('disables them once declarations are closed', () => {
    expect(
      declarationButtons(entry(TODAY, 'x', { declarationsOpen: false }), { ...ward, canDeclare: false }, 'self'),
    ).toBe('disabled')
    expect(declarationButtons(entry(TODAY, 'x'), { ...ward, canDeclare: false }, 'guardian')).toBe('disabled')
  })

  it('hides them for the coach, a cancelled or done session, and a ward under guardian_only', () => {
    expect(declarationButtons(entry(TODAY, 'x'), ward, 'coach')).toBe('hidden')
    expect(declarationButtons(entry(TODAY, 'x', { status: 'cancelled' }), ward, 'guardian')).toBe('hidden')
    expect(declarationButtons(entry(TODAY, 'x', { status: 'done' }), ward, 'guardian')).toBe('hidden')
    expect(declarationButtons(entry(TODAY, 'x'), { canDeclare: false, guardianOnly: true }, 'self')).toBe('hidden')
  })
})

describe('session times', () => {
  // Thursday 5 November 2026, 15:00 UTC = 16:00 in Warsaw (CET).
  const start = new Date('2026-11-05T15:00:00Z')

  it('gives the weekday and the 24-hour time in the club zone', () => {
    expect(weekdayAndTime(start, 'en', 'Europe/Warsaw')).toEqual({ day: 'Thu', time: '16:00' })
    expect(weekdayAndTime(start, 'pl', 'Europe/Warsaw').time).toBe('16:00')
    expect(weekdayAndTime(start, 'en', 'UTC')).toEqual({ day: 'Thu', time: '15:00' })
  })

  it('adds the day and month for a session more than a week away', () => {
    const far = weekdayAndTime(start, 'en', 'Europe/Warsaw', true)
    expect(far.day).toContain('Thu')
    expect(far.day).toContain('Nov')
    expect(far.day).toContain('5')
    expect(far.time).toBe('16:00')
  })

  it('gives the weekday, date and time of a pending decision', () => {
    const moment = sessionMoment(start, 'en', 'Europe/Warsaw')
    expect(moment).toContain('Thu')
    expect(moment).toContain('Nov')
    expect(moment).toContain('5')
    expect(moment).toContain('16:00')
  })
})

describe('savedDeclarationKey', () => {
  it('names the answer that was saved', () => {
    expect(savedDeclarationKey('yes')).toBe('activities.club.flash.savedAttending')
    expect(savedDeclarationKey('no')).toBe('activities.club.flash.savedNotAttending')
    expect(savedDeclarationKey('unknown')).toBe('activities.club.flash.savedWithdrawn')
  })
})
