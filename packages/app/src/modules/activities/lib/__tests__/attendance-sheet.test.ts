import { describe, expect, it } from '@jest/globals'
import {
  closesEarly,
  declaredPresentFill,
  declaredYes,
  groupRosterHref,
  isCloseShortcut,
  presentCount,
  seesRosterLink,
  sheetEntries,
  unmarkedPersonIds,
  type CurrentMark,
  type SheetActual,
  type SheetRow,
} from '../attendance-sheet'

function row(personId: string, overrides: Partial<SheetRow> = {}): SheetRow {
  return { personId, declared: null, declarationStatus: null, actual: null, ...overrides }
}

const yes = (personId: string, overrides: Partial<SheetRow> = {}) =>
  row(personId, { declared: 'yes', declarationStatus: 'final', ...overrides })

/** The page's current mark: a selection wins over the saved mark. */
function currentOf(selections: Record<string, SheetActual | null>): CurrentMark {
  return (r) => (r.personId in selections ? (selections[r.personId] ?? null) : r.actual)
}

describe('declaredYes', () => {
  it('counts only a final "yes"', () => {
    expect(declaredYes(yes('a'))).toBe(true)
    expect(declaredYes(yes('a', { declarationStatus: 'pending_guardian' }))).toBe(false)
    expect(declaredYes(yes('a', { declarationStatus: 'rejected_by_guardian' }))).toBe(false)
    expect(declaredYes(row('a', { declared: 'no', declarationStatus: 'final' }))).toBe(false)
    expect(declaredYes(row('a'))).toBe(false)
  })
})

describe('declaredPresentFill (All declared present)', () => {
  it('fills the 11 unmarked "yes" declarations and leaves the others', () => {
    const declared = Array.from({ length: 11 }, (_, i) => yes(`y${String(i)}`))
    const others = [row('n', { declared: 'no', declarationStatus: 'final' }), row('u'), row('g')]
    expect(declaredPresentFill([...declared, ...others], currentOf({}))).toEqual(declared.map((r) => r.personId))
  })

  it('skips a "yes" already marked, saved or selected', () => {
    const rows = [yes('saved', { actual: 'late' }), yes('selected'), yes('cleared', { actual: 'absent' }), yes('free')]
    expect(declaredPresentFill(rows, currentOf({ selected: 'absent', cleared: null }))).toEqual(['cleared', 'free'])
  })
})

describe('unmarkedPersonIds', () => {
  it('lists the persons without a current mark', () => {
    const rows = [row('a'), row('b', { actual: 'present' }), row('c'), row('d', { actual: 'late' })]
    expect(unmarkedPersonIds(rows, currentOf({ c: 'present', d: null }))).toEqual(['a', 'd'])
  })
})

describe('sheetEntries', () => {
  const rows = [
    row('same', { actual: 'present' }),
    row('changed', { actual: 'absent' }),
    row('cleared', { actual: 'late' }),
    row('new'),
    row('none'),
  ]
  const current = currentOf({ same: 'present', changed: 'late', cleared: null, new: 'present' })

  it('a save sends the changed marks, including a cleared one', () => {
    expect(sheetEntries(rows, current, false)).toEqual([
      { personId: 'changed', actual: 'late' },
      { personId: 'cleared', actual: null },
      { personId: 'new', actual: 'present' },
    ])
  })

  it('a close also records every unmarked person as absent', () => {
    expect(sheetEntries(rows, current, true)).toEqual([
      { personId: 'changed', actual: 'late' },
      { personId: 'cleared', actual: 'absent' },
      { personId: 'new', actual: 'present' },
      { personId: 'none', actual: 'absent' },
    ])
  })
})

describe('closesEarly', () => {
  it('is true until the session ends', () => {
    const endAt = '2026-11-05T18:00:00.000Z'
    expect(closesEarly(endAt, new Date('2026-11-05T17:59:59.000Z'))).toBe(true)
    expect(closesEarly(endAt, new Date('2026-11-05T18:00:00.000Z'))).toBe(false)
    expect(closesEarly(endAt, new Date('2026-11-05T19:00:00.000Z'))).toBe(false)
  })
})

describe('presentCount', () => {
  it('counts present and late', () => {
    expect(presentCount([{ actual: 'present' }, { actual: 'late' }, { actual: 'absent' }, { actual: null }])).toBe(2)
    expect(presentCount([])).toBe(0)
  })
})

describe('isCloseShortcut', () => {
  it('is Ctrl+Enter or Cmd+Enter only', () => {
    expect(isCloseShortcut({ key: 'Enter', ctrlKey: true, metaKey: false })).toBe(true)
    expect(isCloseShortcut({ key: 'Enter', ctrlKey: false, metaKey: true })).toBe(true)
    expect(isCloseShortcut({ key: 'Enter', ctrlKey: false, metaKey: false })).toBe(false)
    expect(isCloseShortcut({ key: 'a', ctrlKey: true, metaKey: true })).toBe(false)
  })
})

describe('the roster link of the empty list', () => {
  it('is for a coordinator and the club administrator', () => {
    expect(seesRosterLink('coordinator')).toBe(true)
    expect(seesRosterLink('club_admin')).toBe(true)
    expect(seesRosterLink('coach')).toBe(false)
  })

  it('points at the group record', () => {
    expect(groupRosterHref('g 1')).toBe('/backend/groups/groups/g%201')
  })
})
