import { describe, expect, it } from '@jest/globals'
import {
  attendantPlaceIds,
  inPlaces,
  isBookablePlace,
  optionPlaceIds,
  placeFamilyOf,
  rentalPlaceIds,
} from '../place-scope'

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
    expect(
      attendantPlaceIds([
        { kind: 'coordinator', ids: ['s1'] },
        { kind: 'facility_operator', ids: ['hall'] },
      ]),
    ).toBeNull()
    expect(
      attendantPlaceIds([
        { kind: 'coach', ids: ['g1'] },
        { kind: 'facility_operator', ids: ['hall'] },
      ]),
    ).toBeNull()
  })

  it('keeps the whole club for a reader without an attendant grant', () => {
    expect(attendantPlaceIds([{ kind: 'self', ids: ['p1'] }])).toBeNull()
    expect(attendantPlaceIds([{ kind: 'maintenance_planner', ids: ['pitch'] }])).toBeNull()
    expect(attendantPlaceIds([])).toBeNull()
  })
})

describe('optionPlaceIds', () => {
  it('follows the calendar for a reader with facilities.view', () => {
    expect(optionPlaceIds([{ kind: 'facility_operator', ids: ['hall'] }], true)).toEqual(['hall'])
    expect(optionPlaceIds([{ kind: 'coach', ids: ['g1'] }], true)).toBeNull()
  })

  it('limits a maintainer without facilities.view to the assigned places', () => {
    expect(
      optionPlaceIds(
        [
          { kind: 'maintenance_planner', ids: ['pitch', 'hall'] },
          { kind: 'maintenance_planner', ids: ['pitch'] },
        ],
        false,
      ),
    ).toEqual(['hall', 'pitch'])
    expect(optionPlaceIds([{ kind: 'maintenance_planner' }], false)).toEqual([])
    expect(optionPlaceIds([{ kind: 'club_admin' }], false)).toBeNull()
  })
})

describe('rentalPlaceIds', () => {
  it('gives no place without the rentals feature', () => {
    expect(rentalPlaceIds([{ kind: 'club_admin' }], false)).toEqual([])
  })

  it('gives every place to the administrator and the attended places to an attendant', () => {
    expect(rentalPlaceIds([{ kind: 'club_admin' }, { kind: 'facility_operator', ids: ['hall'] }], true)).toBeNull()
    expect(
      rentalPlaceIds(
        [
          { kind: 'facility_operator', ids: ['pitch', 'hall'] },
          { kind: 'coordinator', ids: ['s1'] },
        ],
        true,
      ),
    ).toEqual(['hall', 'pitch'])
    expect(rentalPlaceIds([{ kind: 'coordinator', ids: ['s1'] }], true)).toEqual([])
  })
})

describe('inPlaces', () => {
  it('reads null as every place', () => {
    expect(inPlaces(null, 'a')).toBe(true)
    expect(inPlaces(['a'], 'a')).toBe(true)
    expect(inPlaces([], 'a')).toBe(false)
  })
})

describe('isBookablePlace', () => {
  it('takes leaves that are not external', () => {
    expect(isBookablePlace({ isLeaf: true, isExternal: false })).toBe(true)
    expect(isBookablePlace({ isLeaf: false, isExternal: false })).toBe(false)
    expect(isBookablePlace({ isLeaf: true, isExternal: true })).toBe(false)
  })
})

describe('placeFamilyOf', () => {
  const places = [
    { id: 'complex', parentId: null },
    { id: 'pitch', parentId: 'complex' },
    { id: 'pitch-half', parentId: 'pitch' },
    { id: 'pitch-quarter', parentId: 'pitch-half' },
    { id: 'hall', parentId: 'complex' },
    { id: 'orphan', parentId: 'gone' },
  ]

  it('holds the place, its ancestors and its descendants', () => {
    expect([...placeFamilyOf(places, 'pitch')].sort()).toEqual(['complex', 'pitch', 'pitch-half', 'pitch-quarter'])
    expect([...placeFamilyOf(places, 'hall')].sort()).toEqual(['complex', 'hall'])
    expect([...placeFamilyOf(places, 'orphan')].sort()).toEqual(['gone', 'orphan'])
    expect([...placeFamilyOf(places, 'unknown')]).toEqual(['unknown'])
  })

  it('stops on a cycle', () => {
    const cycle = [
      { id: 'a', parentId: 'b' },
      { id: 'b', parentId: 'a' },
    ]
    expect([...placeFamilyOf(cycle, 'a')].sort()).toEqual(['a', 'b'])
  })
})
