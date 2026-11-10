import { describe, expect, it } from '@jest/globals'
import { attendantPlaceIds } from '../place-scope'

describe('attendantPlaceIds', () => {
  it('limits a facility attendant to their places and the places they maintain', () => {
    expect(
      attendantPlaceIds([
        { kind: 'facility_operator', ids: ['hall', 'hall-court'] },
        { kind: 'maintenance_planner', ids: ['pitch', 'hall'] },
        { kind: 'self', ids: ['p1'] },
      ]),
    ).toEqual(['hall', 'hall-court', 'pitch'])
    expect(attendantPlaceIds([{ kind: 'facility_operator' }])).toEqual([])
  })

  it('keeps the whole club for club staff, even when they also attend a place', () => {
    expect(attendantPlaceIds([{ kind: 'club_admin' }, { kind: 'facility_operator', ids: ['hall'] }])).toBeNull()
    expect(attendantPlaceIds([{ kind: 'coordinator', ids: ['s1'] }, { kind: 'facility_operator', ids: ['hall'] }])).toBeNull()
    expect(attendantPlaceIds([{ kind: 'coach', ids: ['g1'] }, { kind: 'facility_operator', ids: ['hall'] }])).toBeNull()
  })

  it('keeps the whole club for a reader without an attendant grant', () => {
    expect(attendantPlaceIds([{ kind: 'self', ids: ['p1'] }])).toBeNull()
    expect(attendantPlaceIds([{ kind: 'maintenance_planner', ids: ['pitch'] }])).toBeNull()
    expect(attendantPlaceIds([])).toBeNull()
  })
})
