import { describe, expect, it } from '@jest/globals'
import {
  PLACE_KINDS,
  bookablePlaceProblem,
  decimalOrNull,
  parsePlaceContacts,
  placeContactSchema,
  serializePlaceContacts,
  placeRelatives,
  wouldCreateCycle,
} from '../places'

describe('place hierarchy', () => {
  // Orlik 2024 (complex) → Boisko (pitch) → Szatnia (locker room); Hala is a second root.
  const parentOf = new Map<string, string | null>([
    ['orlik', null],
    ['boisko', 'orlik'],
    ['szatnia', 'boisko'],
    ['hala', null],
  ])

  it('lists the place kinds of the glossary', () => {
    expect(PLACE_KINDS).toEqual(['complex', 'pitch', 'multi_pitch', 'hall', 'locker_room', 'pool', 'other'])
  })

  it('allows a root, a sibling subtree and moving a node under an unrelated place', () => {
    expect(wouldCreateCycle('boisko', null, parentOf)).toBe(false)
    expect(wouldCreateCycle('boisko', 'hala', parentOf)).toBe(false)
    expect(wouldCreateCycle('szatnia', 'orlik', parentOf)).toBe(false)
    expect(wouldCreateCycle('new-place', 'szatnia', parentOf)).toBe(false)
  })

  it('refuses a place as its own parent and a descendant as the parent (422 in the command)', () => {
    expect(wouldCreateCycle('orlik', 'orlik', parentOf)).toBe(true)
    expect(wouldCreateCycle('orlik', 'boisko', parentOf)).toBe(true)
    expect(wouldCreateCycle('orlik', 'szatnia', parentOf)).toBe(true)
  })

  it('never extends a hierarchy that already holds a loop', () => {
    const corrupt = new Map<string, string | null>([
      ['a', 'b'],
      ['b', 'a'],
    ])
    expect(wouldCreateCycle('c', 'a', corrupt)).toBe(true)
  })
})

describe('bookable leaf rule', () => {
  it('refuses a complex with children and an unknown place', () => {
    expect(bookablePlaceProblem({ childCount: 3 })).toBe('has_children')
    expect(bookablePlaceProblem(null)).toBe('not_found')
  })

  it('accepts a leaf, including a complex without children', () => {
    expect(bookablePlaceProblem({ childCount: 0 })).toBeNull()
  })
})

describe('place contacts', () => {
  const caretaker = { role: 'Gospodarz', name: 'Jan Nowak', phone: '+48 600 100 200' }

  it('normalizes blank optional fields to null and requires a name', () => {
    expect(placeContactSchema.parse({ role: ' ', name: ' Jan ', phone: undefined })).toEqual({
      role: null,
      name: 'Jan',
      phone: null,
    })
    expect(placeContactSchema.safeParse({ name: '' }).success).toBe(false)
    expect(placeContactSchema.safeParse({ name: 'Jan', email: 'x@y.z' }).success).toBe(false)
  })

  it('stores a list as JSON text and no list as null', () => {
    expect(serializePlaceContacts([caretaker])).toBe(JSON.stringify([caretaker]))
    expect(serializePlaceContacts([])).toBeNull()
    expect(serializePlaceContacts(null)).toBeNull()
    expect(serializePlaceContacts(undefined)).toBeNull()
  })

  it('reads the stored text, an array, or nothing usable', () => {
    expect(parsePlaceContacts(JSON.stringify([caretaker]))).toEqual([caretaker])
    expect(parsePlaceContacts([caretaker])).toEqual([caretaker])
    expect(parsePlaceContacts('not json')).toEqual([])
    expect(parsePlaceContacts('{"name":"x"}')).toEqual([])
    expect(parsePlaceContacts(null)).toEqual([])
  })
})

describe('decimals', () => {
  it('reads stored decimals and numbers, null otherwise', () => {
    expect(decimalOrNull('52.229676')).toBe(52.229676)
    expect(decimalOrNull(21.012229)).toBe(21.012229)
    expect(decimalOrNull(Number.NaN)).toBeNull()
    expect(decimalOrNull('')).toBeNull()
    expect(decimalOrNull('north')).toBeNull()
    expect(decimalOrNull(null)).toBeNull()
  })
})

describe('placeRelatives', () => {
  const tree = new Map<string, string | null>([
    ['orlik', null],
    ['boisko', 'orlik'],
    ['hala', 'orlik'],
    ['sektor', 'boisko'],
  ])

  it('lists the ancestors nearest first and the descendants sorted', () => {
    expect(placeRelatives('boisko', tree)).toEqual({ ancestorIds: ['orlik'], descendantIds: ['sektor'] })
    expect(placeRelatives('orlik', tree)).toEqual({ ancestorIds: [], descendantIds: ['boisko', 'hala', 'sektor'] })
    expect(placeRelatives('sektor', tree)).toEqual({ ancestorIds: ['boisko', 'orlik'], descendantIds: [] })
    expect(placeRelatives('unknown', tree)).toEqual({ ancestorIds: [], descendantIds: [] })
  })

  it('walks a corrupt loop once', () => {
    const loop = new Map<string, string | null>([
      ['a', 'b'],
      ['b', 'a'],
    ])
    expect(placeRelatives('a', loop)).toEqual({ ancestorIds: ['b'], descendantIds: ['b'] })
    const tail = new Map<string, string | null>([
      ['x', 'y'],
      ['y', 'z'],
      ['z', 'y'],
    ])
    expect(placeRelatives('x', tail)).toEqual({ ancestorIds: ['y', 'z'], descendantIds: [] })
  })
})
