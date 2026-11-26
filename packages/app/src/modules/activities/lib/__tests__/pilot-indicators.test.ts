import { describe, expect, it } from '@jest/globals'
import {
  accountsDate,
  closeDeadline,
  closedWithinDay,
  countAccounts,
  countClosedWithinDay,
  countCoveredBeforeStart,
  coveredBeforeStart,
  firstClosing,
  indicatorPercent,
  needsCloseLookup,
  showsPaidOnTime,
  type ClosingSession,
  type CoverSession,
} from '../pilot-indicators'

const NOW = new Date('2026-11-26T12:00:00Z')
const HOUR = 60 * 60 * 1000
const END = new Date('2026-11-20T18:00:00Z')
const at = (hoursAfterEnd: number) => new Date(END.getTime() + hoursAfterEnd * HOUR)

function closing(overrides: Partial<ClosingSession> = {}): ClosingSession {
  return { status: 'done', endAt: END, closedAt: null, updatedAt: at(1), ...overrides }
}

describe('accountsDate', () => {
  it('is the last day of a past period, else today', () => {
    expect(accountsDate({ to: '2026-10-31' }, '2026-11-26')).toBe('2026-10-31')
    expect(accountsDate({ to: '2026-11-30' }, '2026-11-26')).toBe('2026-11-26')
    expect(accountsDate({ to: '2026-11-26' }, '2026-11-26')).toBe('2026-11-26')
  })
})

describe('closedWithinDay', () => {
  it('sets the deadline 24 hours after the end', () => {
    expect(closeDeadline(END)).toEqual(at(24))
  })

  it('reads a done session by its logged closing time, else by its version', () => {
    expect(closedWithinDay(closing({ closedAt: at(2), updatedAt: at(40) }), NOW)).toBe('on_time')
    expect(closedWithinDay(closing({ closedAt: at(30), updatedAt: at(30) }), NOW)).toBe('late')
    expect(closedWithinDay(closing({ updatedAt: at(24) }), NOW)).toBe('on_time')
    expect(closedWithinDay(closing({ updatedAt: at(25) }), NOW)).toBe('late')
  })

  it('counts a still open session as late only after the deadline', () => {
    expect(closedWithinDay(closing({ status: 'planned' }), NOW)).toBe('late')
    expect(closedWithinDay(closing({ status: 'planned' }), at(10))).toBeNull()
  })

  it('leaves out cancelled sessions and sessions that have not ended', () => {
    expect(closedWithinDay(closing({ status: 'cancelled' }), NOW)).toBeNull()
    expect(closedWithinDay(closing({ status: 'planned', endAt: at(5) }), at(1))).toBeNull()
  })

  it('counts the issue example: 8 of 10', () => {
    const sessions = [
      ...Array.from({ length: 8 }, () => closing({ closedAt: at(3) })),
      closing({ closedAt: at(30), updatedAt: at(30) }),
      closing({ status: 'planned' }),
      closing({ status: 'cancelled' }),
    ]
    expect(countClosedWithinDay(sessions, NOW)).toEqual({ count: 8, total: 10 })
  })
})

describe('needsCloseLookup', () => {
  it('looks up only done sessions changed after the deadline', () => {
    expect(needsCloseLookup(closing({ updatedAt: at(25) }))).toBe(true)
    expect(needsCloseLookup(closing({ updatedAt: at(24) }))).toBe(false)
    expect(needsCloseLookup(closing({ status: 'planned', updatedAt: at(25) }))).toBe(false)
  })
})

describe('firstClosing', () => {
  it('takes the earliest entry whose context says completed', () => {
    expect(
      firstClosing([
        { createdAt: at(40), context: { completed: true } },
        { createdAt: at(1), context: { completed: false } },
        { createdAt: at(5), context: { completed: true } },
        { createdAt: at(2), context: null },
        { createdAt: at(3), context: 'cipher' },
        { createdAt: at(50), context: { completed: true } },
      ]),
    ).toEqual(at(5))
    expect(firstClosing([])).toBeNull()
  })
})

describe('coveredBeforeStart', () => {
  const START = new Date('2026-11-20T16:00:00Z')
  const before = (hours: number) => new Date(START.getTime() - hours * HOUR)
  function cover(entries: CoverSession['entries'], overrides: Partial<CoverSession> = {}): CoverSession {
    return { status: 'done', startAt: START, entries, ...overrides }
  }

  it('is covered when the last entry before the start brings a coach back', () => {
    const lost = { kind: 'absence_reported' as const, createdAt: before(30) }
    expect(coveredBeforeStart(cover([lost, { kind: 'substitute_assigned', createdAt: before(5) }]), NOW)).toBe(true)
    expect(coveredBeforeStart(cover([{ kind: 'coach_restored', createdAt: before(2) }, lost]), NOW)).toBe(true)
    expect(coveredBeforeStart(cover([lost]), NOW)).toBe(false)
    expect(
      coveredBeforeStart(
        cover([lost, { kind: 'substitute_assigned', createdAt: new Date(START.getTime() + HOUR) }]),
        NOW,
      ),
    ).toBe(false)
  })

  it('leaves out sessions that never lost their coach before the start, cancelled and future ones', () => {
    expect(coveredBeforeStart(cover([]), NOW)).toBeNull()
    expect(coveredBeforeStart(cover([{ kind: 'absence_reported', createdAt: START }]), NOW)).toBeNull()
    const lost = [{ kind: 'absence_reported' as const, createdAt: before(1) }]
    expect(coveredBeforeStart(cover(lost, { status: 'cancelled' }), NOW)).toBeNull()
    expect(coveredBeforeStart(cover(lost), before(2))).toBeNull()
  })

  it('counts the issue example: 2 of 3, and nothing for a section without such a session', () => {
    const lost = { kind: 'absence_reported' as const, createdAt: before(30) }
    const covered = { kind: 'substitute_assigned' as const, createdAt: before(10) }
    const sessions = [cover([lost, covered]), cover([lost, covered]), cover([lost]), cover([])]
    expect(countCoveredBeforeStart(sessions, NOW)).toEqual({ count: 2, total: 3 })
    expect(countCoveredBeforeStart([cover([])], NOW)).toEqual({ count: 0, total: 0 })
  })
})

describe('countAccounts', () => {
  it('counts distinct guardians and those with an active account', () => {
    expect(countAccounts(['a', 'b', 'a', 'c'], new Set(['a', 'c', 'z']))).toEqual({ count: 2, total: 3 })
    expect(countAccounts([], new Set())).toEqual({ count: 0, total: 0 })
  })
})

describe('indicatorPercent', () => {
  it('rounds half up and is null over nothing', () => {
    expect(indicatorPercent({ count: 15, total: 20 })).toBe(75)
    expect(indicatorPercent({ count: 1, total: 8 })).toBe(13)
    expect(indicatorPercent({ count: 0, total: 0 })).toBeNull()
  })
})

describe('showsPaidOnTime', () => {
  it('shows the column only when payments answered', () => {
    expect(showsPaidOnTime({ paymentsEnabled: true })).toBe(true)
    expect(showsPaidOnTime({ paymentsEnabled: false })).toBe(false)
    expect(showsPaidOnTime({})).toBe(false)
    expect(showsPaidOnTime(null)).toBe(false)
    expect(showsPaidOnTime(undefined)).toBe(false)
  })
})
