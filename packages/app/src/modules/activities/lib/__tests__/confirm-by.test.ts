import { describe, expect, it } from '@jest/globals'
import {
  MAX_CONFIRM_BY_MINUTES,
  confirmByAt,
  confirmByIso,
  confirmByOffset,
  deadlinePassed,
  deadlineReached,
  deadlineRefuses,
  effectiveConfirmByMinutes,
  formatDeadline,
  listRank,
  nextConfirmByMinutes,
  reminderDue,
} from '../confirm-by'

// A match on Sunday 15.11 at 10:00 UTC with "confirm by Friday 12:00" (1 day and 22 hours before).
const START = new Date('2026-11-15T10:00:00Z')
const OFFSET = 1440 + 22 * 60
const DEADLINE = new Date('2026-11-13T12:00:00Z')
const BEFORE = new Date('2026-11-12T09:00:00Z')
const AFTER = new Date('2026-11-13T12:01:00Z')

describe('deadline instant (DD-A01)', () => {
  it('is the start minus the offset', () => {
    expect(confirmByAt(START, OFFSET)).toEqual(DEADLINE)
    expect(confirmByIso(START, OFFSET)).toBe('2026-11-13T12:00:00.000Z')
  })

  it('is absent without a positive offset', () => {
    expect(confirmByAt(START, null)).toBeNull()
    expect(confirmByAt(START, undefined)).toBeNull()
    expect(confirmByAt(START, 0)).toBeNull()
    expect(confirmByIso(START, null)).toBeNull()
  })

  it('moves with the start: a match moved by a day moves its deadline by a day', () => {
    const moved = new Date(START.getTime() + 86_400_000)
    expect(confirmByAt(moved, OFFSET)).toEqual(new Date('2026-11-14T12:00:00Z'))
  })
})

describe('deadline passed (DD-A02)', () => {
  it('is false before the deadline and without one', () => {
    expect(deadlinePassed(START, OFFSET, BEFORE)).toBe(false)
    expect(deadlinePassed(START, null, AFTER)).toBe(false)
  })

  it('is true from the deadline until the start', () => {
    expect(deadlinePassed(START, OFFSET, DEADLINE)).toBe(true)
    expect(deadlinePassed(START, OFFSET, AFTER)).toBe(true)
  })

  it('is false once the session has started', () => {
    expect(deadlinePassed(START, OFFSET, START)).toBe(false)
  })
})

describe('deadline reached and the attendance list order (M-05)', () => {
  it('is reached from the deadline on, the start included', () => {
    expect(deadlineReached(START, OFFSET, BEFORE)).toBe(false)
    expect(deadlineReached(START, OFFSET, AFTER)).toBe(true)
    expect(deadlineReached(START, OFFSET, START)).toBe(true)
    expect(deadlineReached(START, null, AFTER)).toBe(false)
  })

  it('puts "no answer" first only once the deadline is reached', () => {
    expect(listRank('unanswered', true)).toBe(0)
    expect(listRank('confirmed', true)).toBe(1)
    expect(listRank('unanswered', false)).toBe(1)
  })
})

describe('effective deadline by declaration kind', () => {
  it('only a confirm session carries a deadline', () => {
    expect(effectiveConfirmByMinutes('confirm', OFFSET)).toBe(OFFSET)
    expect(effectiveConfirmByMinutes('absence_only', OFFSET)).toBeNull()
    expect(effectiveConfirmByMinutes('confirm', null)).toBeNull()
    expect(effectiveConfirmByMinutes('confirm', undefined)).toBeNull()
    expect(effectiveConfirmByMinutes('confirm', 0)).toBeNull()
  })
})

describe('deadline offset of a submitted instant', () => {
  it('stores whole minutes before the start', () => {
    expect(confirmByOffset(START, DEADLINE, BEFORE)).toEqual({ ok: true, minutes: OFFSET })
    expect(confirmByOffset(START, new Date('2026-11-15T09:58:30Z'), BEFORE)).toEqual({ ok: true, minutes: 1 })
  })

  it('refuses a deadline at or after the start', () => {
    expect(confirmByOffset(START, START, BEFORE)).toEqual({ ok: false, code: 'occurrence_confirm_by_after_start' })
    expect(confirmByOffset(START, new Date('2026-11-15T09:59:30Z'), BEFORE)).toEqual({
      ok: false,
      code: 'occurrence_confirm_by_after_start',
    })
  })

  it('refuses a deadline more than 14 days before the start', () => {
    const limit = new Date(START.getTime() - MAX_CONFIRM_BY_MINUTES * 60_000)
    expect(confirmByOffset(START, limit, new Date('2026-10-01T00:00:00Z'))).toEqual({
      ok: true,
      minutes: MAX_CONFIRM_BY_MINUTES,
    })
    expect(confirmByOffset(START, new Date(limit.getTime() - 60_000), new Date('2026-10-01T00:00:00Z'))).toEqual({
      ok: false,
      code: 'occurrence_confirm_by_too_early',
    })
  })

  it('refuses a deadline earlier than now', () => {
    expect(confirmByOffset(START, DEADLINE, AFTER)).toEqual({ ok: false, code: 'occurrence_confirm_by_in_past' })
  })
})

describe('the offset a session edit stores', () => {
  const base = { startAt: START, moved: false, current: OFFSET, applies: true, now: BEFORE }

  it('null removes the deadline', () => {
    expect(nextConfirmByMinutes({ ...base, submitted: null })).toEqual({ ok: true, minutes: null })
  })

  it('a submitted instant sets the offset from the new start, with its checks', () => {
    expect(nextConfirmByMinutes({ ...base, submitted: '2026-11-14T10:00:00Z' })).toEqual({ ok: true, minutes: 1440 })
    expect(nextConfirmByMinutes({ ...base, submitted: '2026-11-15T10:00:00Z' })).toEqual({
      ok: false,
      code: 'occurrence_confirm_by_after_start',
    })
  })

  it('an omitted instant keeps the offset, or no deadline', () => {
    expect(nextConfirmByMinutes({ ...base, submitted: undefined })).toEqual({ ok: true, minutes: OFFSET })
    expect(nextConfirmByMinutes({ ...base, current: null, submitted: undefined })).toEqual({ ok: true, minutes: null })
    expect(nextConfirmByMinutes({ ...base, current: 0, submitted: undefined })).toEqual({ ok: true, minutes: null })
  })

  it('a move whose kept deadline falls in the past must send confirmBy', () => {
    const moved = { ...base, moved: true, now: AFTER, submitted: undefined }
    expect(nextConfirmByMinutes(moved)).toEqual({ ok: false, code: 'occurrence_confirm_by_in_past' })
    // A move that keeps the deadline in the future, a non-move edit and a session the deadline has no effect on pass.
    expect(nextConfirmByMinutes({ ...moved, now: BEFORE })).toEqual({ ok: true, minutes: OFFSET })
    expect(nextConfirmByMinutes({ ...moved, moved: false })).toEqual({ ok: true, minutes: OFFSET })
    expect(nextConfirmByMinutes({ ...moved, applies: false })).toEqual({ ok: true, minutes: OFFSET })
  })
})

describe('a member declaration after the deadline', () => {
  const base = { kind: 'confirm' as const, startAt: START, minutesBefore: OFFSET, now: AFTER }

  it('is refused for self and guardian on a confirm session', () => {
    expect(deadlineRefuses({ ...base, actingRole: 'self' })).toBe(true)
    expect(deadlineRefuses({ ...base, actingRole: 'guardian' })).toBe(true)
  })

  it('is accepted before the deadline, for staff and on an absence_only session', () => {
    expect(deadlineRefuses({ ...base, actingRole: 'guardian', now: BEFORE })).toBe(false)
    expect(deadlineRefuses({ ...base, actingRole: 'coach' })).toBe(false)
    expect(deadlineRefuses({ ...base, actingRole: 'club_admin' })).toBe(false)
    expect(deadlineRefuses({ ...base, actingRole: 'guardian', kind: 'absence_only' })).toBe(false)
  })
})

describe('the deadline as cards write it', () => {
  it('names the weekday, the day and month and the club-zone time', () => {
    expect(formatDeadline(DEADLINE, 'en-GB', 'Europe/Warsaw')).toBe('Fri 13.11, 13:00')
    expect(formatDeadline(DEADLINE, 'pl', 'UTC')).toBe('pt. 13.11, 12:00')
  })
})

describe('the evening reminder', () => {
  const now = new Date('2026-11-12T17:00:00Z')

  it('goes on the evening before the session without a deadline', () => {
    expect(
      reminderDue({ occurrenceDate: '2026-11-13', deadline: null, deadlineDate: null, tomorrow: '2026-11-13', now }),
    ).toBe(true)
    expect(
      reminderDue({ occurrenceDate: '2026-11-15', deadline: null, deadlineDate: null, tomorrow: '2026-11-13', now }),
    ).toBe(false)
  })

  it('goes on the evening before the deadline day with a deadline', () => {
    const input = { occurrenceDate: '2026-11-15', deadline: DEADLINE, deadlineDate: '2026-11-13', now }
    expect(reminderDue({ ...input, tomorrow: '2026-11-13' })).toBe(true)
    expect(reminderDue({ ...input, tomorrow: '2026-11-15' })).toBe(false)
  })

  it('never after the deadline', () => {
    expect(
      reminderDue({
        occurrenceDate: '2026-11-15',
        deadline: DEADLINE,
        deadlineDate: '2026-11-13',
        tomorrow: '2026-11-13',
        now: DEADLINE,
      }),
    ).toBe(false)
  })
})
