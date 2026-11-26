import { describe, expect, it } from '@jest/globals'
import {
  DECLARATION_SHARE_DEFAULT_DAYS,
  DECLARATION_SHARE_MAX_DAYS,
  countSession,
  declaredInVereino,
  defaultSharePeriod,
  resolveSharePeriod,
  sectionShares,
  sharePercent,
  type ShareAttendance,
  type ShareSession,
} from '../declaration-share'

const START = new Date('2026-11-20T17:00:00Z')
const BEFORE = new Date('2026-11-20T10:00:00Z')
const AFTER = new Date('2026-11-20T17:30:00Z')

function row(personId: string, overrides: Partial<ShareAttendance> = {}): ShareAttendance {
  return {
    personId,
    declared: 'yes',
    declaredAt: BEFORE,
    declarationStatus: 'final',
    actual: null,
    source: 'app',
    ...overrides,
  }
}

function persons(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => `${prefix}${String(index + 1)}`)
}

describe('the period', () => {
  it('defaults to the last 28 days ending today', () => {
    expect(DECLARATION_SHARE_DEFAULT_DAYS).toBe(28)
    expect(defaultSharePeriod('2026-11-26')).toEqual({ from: '2026-10-30', to: '2026-11-26' })
    expect(resolveSharePeriod({}, '2026-11-26')).toEqual({ from: '2026-10-30', to: '2026-11-26' })
    expect(resolveSharePeriod({ from: '', to: null }, '2026-11-26')).toEqual({ from: '2026-10-30', to: '2026-11-26' })
  })

  it('takes a month or a range of up to twelve months', () => {
    expect(resolveSharePeriod({ from: '2026-11-01', to: '2026-11-30' }, '2026-11-26')).toEqual({
      from: '2026-11-01',
      to: '2026-11-30',
    })
    expect(resolveSharePeriod({ from: '2026-11-26', to: '2026-11-26' }, '2026-11-26')).not.toBeNull()
    expect(DECLARATION_SHARE_MAX_DAYS).toBe(366)
    expect(resolveSharePeriod({ from: '2024-01-01', to: '2024-12-31' }, '2026-11-26')).not.toBeNull()
  })

  it('refuses half a range, an invalid date, a reversed or too long range', () => {
    expect(resolveSharePeriod({ from: '2026-11-01' }, '2026-11-26')).toBeNull()
    expect(resolveSharePeriod({ to: '2026-11-01' }, '2026-11-26')).toBeNull()
    expect(resolveSharePeriod({ from: '2026-02-30', to: '2026-03-01' }, '2026-11-26')).toBeNull()
    expect(resolveSharePeriod({ from: '2026-11-02', to: '2026-11-01' }, '2026-11-26')).toBeNull()
    expect(resolveSharePeriod({ from: '2025-01-01', to: '2026-01-02' }, '2026-11-26')).toBeNull()
  })
})

describe('declaredInVereino', () => {
  it('counts a final declaration in the app or by a link before the start', () => {
    expect(declaredInVereino(row('a'), START)).toBe(true)
    expect(declaredInVereino(row('a', { source: 'link' }), START)).toBe(true)
  })

  it('does not count staff entries, late, pending, rejected or undated declarations', () => {
    expect(declaredInVereino(row('a', { source: 'staff' }), START)).toBe(false)
    expect(declaredInVereino(row('a', { declaredAt: AFTER }), START)).toBe(false)
    expect(declaredInVereino(row('a', { declaredAt: START }), START)).toBe(false)
    expect(declaredInVereino(row('a', { declarationStatus: 'pending_guardian' }), START)).toBe(false)
    expect(declaredInVereino(row('a', { declarationStatus: 'rejected_by_guardian' }), START)).toBe(false)
    expect(declaredInVereino(row('a', { declaredAt: null }), START)).toBe(false)
  })
})

describe('countSession', () => {
  it('confirm: members who answered in Vereino over every participant, rows of non-roster persons included', () => {
    const session: ShareSession = {
      sectionId: 's',
      kind: 'confirm',
      startAt: START,
      participantIds: ['p1', 'p2', 'p3', 'p4', 'p5'],
      rows: [
        row('p1'),
        row('p2', { declared: 'no', source: 'link' }),
        row('p3', { source: 'staff' }),
        row('p4', { declared: 'unknown' }),
        row('guest'),
      ],
    }
    expect(countSession(session)).toEqual({ confirm: { declared: 3, total: 6 }, absence: { declared: 0, total: 0 } })
  })

  it('absence_only: actual absences reported as absence in Vereino over every actual absence', () => {
    const session: ShareSession = {
      sectionId: 's',
      kind: 'absence_only',
      startAt: START,
      participantIds: [],
      rows: [
        row('a1', { declared: 'no', actual: 'absent' }),
        row('a2', { declared: 'no', actual: 'absent', source: 'link' }),
        row('a3', { declared: 'no', actual: 'absent', source: 'staff' }),
        row('a4', { declared: 'unknown', actual: 'absent' }),
        row('a5', { declared: 'no', actual: 'absent', declaredAt: AFTER }),
        row('a6', { declared: 'no', actual: 'present' }),
        row('a7', { declared: 'yes', actual: 'absent' }),
      ],
    }
    expect(countSession(session)).toEqual({ confirm: { declared: 0, total: 0 }, absence: { declared: 2, total: 6 } })
  })
})

describe('sectionShares', () => {
  it('sums the issue example: 14 of 20, 4 of 6, headline 18 of 26', () => {
    const matchRows = (offset: number): ShareAttendance[] => [
      ...persons(`m${String(offset)}-app-`, 7).map((id) => row(id)),
      row(`m${String(offset)}-staff`, { source: 'staff' }),
    ]
    const match = (offset: number): ShareSession => {
      const rows = matchRows(offset)
      return {
        sectionId: 'A',
        kind: 'confirm',
        startAt: START,
        participantIds: [...rows.map((entry) => entry.personId), ...persons(`m${String(offset)}-none-`, 2)],
        rows,
      }
    }
    const training: ShareSession = {
      sectionId: 'A',
      kind: 'absence_only',
      startAt: START,
      participantIds: [],
      rows: [
        ...persons('t-', 4).map((id) => row(id, { declared: 'no', actual: 'absent' })),
        row('t-staff', { declared: 'no', actual: 'absent', source: 'staff' }),
        row('t-silent', { declared: 'unknown', actual: 'absent' }),
      ],
    }
    const other: ShareSession = { ...training, sectionId: 'elsewhere' }
    const [a, b] = sectionShares(['A', 'B'], [match(1), match(2), training, other])
    expect(a).toEqual({
      sectionId: 'A',
      sessions: 3,
      confirm: { declared: 14, total: 20 },
      absence: { declared: 4, total: 6 },
      headline: { declared: 18, total: 26 },
    })
    expect(sharePercent(a.confirm)).toBe(70)
    expect(sharePercent(a.absence)).toBe(67)
    expect(sharePercent(a.headline)).toBe(69)
    expect(b).toEqual({
      sectionId: 'B',
      sessions: 0,
      confirm: { declared: 0, total: 0 },
      absence: { declared: 0, total: 0 },
      headline: { declared: 0, total: 0 },
    })
    expect(sharePercent(b.headline)).toBeNull()
  })
})
