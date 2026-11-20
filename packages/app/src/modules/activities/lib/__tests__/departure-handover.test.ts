import { describe, expect, it } from '@jest/globals'
import { handOverEntryKind, handOverNeeds, handOverTarget, restorable } from '../departure-handover'

describe('handOverNeeds', () => {
  it('counts sessions and default-coach activities per person and group, sorted', () => {
    expect(
      handOverNeeds(
        [
          { coachPersonId: 'w', groupId: 'g2' },
          { coachPersonId: 'w', groupId: 'g1' },
          { coachPersonId: 'w', groupId: 'g1' },
          { coachPersonId: 'a', groupId: 'g1' },
        ],
        [
          { coachPersonId: 'w', groupId: 'g1' },
          { coachPersonId: 'w', groupId: 'g3' },
        ],
      ),
    ).toEqual([
      { personId: 'a', groupId: 'g1', sessions: 1, activities: 0 },
      { personId: 'w', groupId: 'g1', sessions: 2, activities: 1 },
      { personId: 'w', groupId: 'g2', sessions: 1, activities: 0 },
      { personId: 'w', groupId: 'g3', sessions: 0, activities: 1 },
    ])
    expect(handOverNeeds([], [])).toEqual([])
  })
})

describe('handOverTarget', () => {
  const choices = [
    { groupId: 'g1', toPersonId: 'm' },
    { groupId: 'g2', toPersonId: null },
  ]

  it('returns the chosen coach, null for unassigned and undefined without a choice', () => {
    expect(handOverTarget(choices, 'g1')).toBe('m')
    expect(handOverTarget(choices, 'g2')).toBeNull()
    expect(handOverTarget(choices, 'g3')).toBeUndefined()
  })
})

describe('handOverEntryKind', () => {
  it('records an absence without a coach, a substitute for another coach and a restore for the own coach', () => {
    expect(handOverEntryKind([], 'w', null)).toBe('absence_reported')
    expect(handOverEntryKind([], 'w', 'm')).toBe('substitute_assigned')
    expect(handOverEntryKind([{ previousCoachPersonId: 'm', newCoachPersonId: 'w' }], 'w', 'm')).toBe('coach_restored')
  })
})

describe('restorable', () => {
  it('is true only while the value is the one the departure wrote', () => {
    expect(restorable('m', 'm')).toBe(true)
    expect(restorable(null, null)).toBe(true)
    expect(restorable(undefined, null)).toBe(true)
    expect(restorable('x', 'm')).toBe(false)
    expect(restorable(null, 'm')).toBe(false)
  })
})
