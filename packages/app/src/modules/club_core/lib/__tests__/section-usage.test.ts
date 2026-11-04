import { describe, expect, it } from '@jest/globals'
import {
  SECTION_NAME_MAX,
  SECTION_NAME_MIN,
  SECTION_USAGE_LIST_LIMIT,
  needsUsageGuard,
  sectionNameProblem,
  sectionUsageConflict,
} from '../section-usage'

const live = (isActive: boolean) => ({ isActive, deleted: false })
const deleted = (isActive: boolean) => ({ isActive, deleted: true })

describe('needsUsageGuard', () => {
  it('guards a deactivation of a live active section', () => {
    expect(needsUsageGuard(live(true), live(false))).toBe(true)
  })

  it('guards every delete of a live section, active or not', () => {
    expect(needsUsageGuard(live(true), deleted(true))).toBe(true)
    expect(needsUsageGuard(live(false), deleted(false))).toBe(true)
  })

  it('does not guard an activation, an unchanged state or a write on a deleted section', () => {
    expect(needsUsageGuard(live(true), live(true))).toBe(false)
    expect(needsUsageGuard(live(false), live(false))).toBe(false)
    expect(needsUsageGuard(live(false), live(true))).toBe(false)
    expect(needsUsageGuard(deleted(true), live(false))).toBe(false)
    expect(needsUsageGuard(deleted(true), deleted(true))).toBe(false)
  })
})

describe('sectionUsageConflict', () => {
  const group = (index: number) => ({ id: `g-${String(index)}`, name: `Group ${String(index)}` })

  it('is null without a contract answer or without active groups', () => {
    expect(sectionUsageConflict(null)).toBeNull()
    expect(sectionUsageConflict({ groups: [], total: 0 })).toBeNull()
  })

  it('lists the groups and the total', () => {
    expect(sectionUsageConflict({ groups: [group(1), group(2)], total: 2 })).toEqual({
      groups: [group(1), group(2)],
      total: 2,
    })
  })

  it('truncates the list to the limit and keeps the full total', () => {
    const groups = Array.from({ length: SECTION_USAGE_LIST_LIMIT + 5 }, (_, index) => group(index))
    const conflict = sectionUsageConflict({ groups, total: 31 })
    expect(SECTION_USAGE_LIST_LIMIT).toBe(20)
    expect(conflict?.groups).toHaveLength(SECTION_USAGE_LIST_LIMIT)
    expect(conflict?.groups[0]).toEqual(group(0))
    expect(conflict?.total).toBe(31)
  })
})

describe('sectionNameProblem', () => {
  it('requires 2–80 characters on create, counted after trimming', () => {
    expect([SECTION_NAME_MIN, SECTION_NAME_MAX]).toEqual([2, 80])
    expect(sectionNameProblem('B', null)).toBe('section_name_length')
    expect(sectionNameProblem('  B  ', null)).toBe('section_name_length')
    expect(sectionNameProblem('Bo', null)).toBeNull()
    expect(sectionNameProblem('x'.repeat(80), null)).toBeNull()
    expect(sectionNameProblem('x'.repeat(81), null)).toBe('section_name_length')
  })

  it('accepts an unchanged stored name of any length (DD-U07)', () => {
    const legacy = 'x'.repeat(120)
    expect(sectionNameProblem(legacy, legacy)).toBeNull()
    expect(sectionNameProblem(` ${legacy} `, legacy)).toBeNull()
    expect(sectionNameProblem('B', 'B')).toBeNull()
  })

  it('checks a renamed section like a new one', () => {
    const legacy = 'x'.repeat(120)
    expect(sectionNameProblem(`${legacy}y`, legacy)).toBe('section_name_length')
    expect(sectionNameProblem('B', 'Basen')).toBe('section_name_length')
    expect(sectionNameProblem('Basen 2', 'Basen')).toBeNull()
  })
})
