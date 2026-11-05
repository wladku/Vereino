import { describe, expect, it } from '@jest/globals'
import {
  hasPlaceFilters,
  orderParentFirst,
  parsePlaceListState,
  placeListQuery,
  type HierarchyPlace,
} from '../place-hierarchy'

const PARENT_ID = '0b9d7a9e-5b8e-4f43-9a55-6d1c0e0c1a01'

describe('places list state', () => {
  it('reads every filter and the search from a URL', () => {
    const query = new URLSearchParams(`kind=pitch&parentPlaceId=${PARENT_ID}&isActive=false&search=%20Orlik%20`)
    expect(parsePlaceListState(query)).toEqual({
      kind: 'pitch',
      parentPlaceId: PARENT_ID,
      isActive: 'false',
      search: 'Orlik',
    })
  })

  it('drops unknown kinds and statuses and blank or over-long values', () => {
    const query = new URLSearchParams(`kind=stadium&isActive=maybe&parentPlaceId=%20&search=${'x'.repeat(201)}`)
    expect(parsePlaceListState(query)).toEqual({})
    expect(parsePlaceListState(new URLSearchParams(''))).toEqual({})
    expect(parsePlaceListState(new URLSearchParams('isActive=true'))).toEqual({ isActive: 'true' })
  })

  it('writes a state in a stable key order and skips empty values', () => {
    expect(placeListQuery({ search: 'Hala', isActive: 'true', kind: 'hall' })).toBe(
      'kind=hall&isActive=true&search=Hala',
    )
    expect(placeListQuery({ parentPlaceId: PARENT_ID })).toBe(`parentPlaceId=${PARENT_ID}`)
    expect(placeListQuery({ search: '' })).toBe('')
    expect(placeListQuery({})).toBe('')
  })

  it('round-trips a state through its query string', () => {
    const state = { kind: 'pool', parentPlaceId: PARENT_ID, isActive: 'true', search: 'Basen' } as const
    expect(parsePlaceListState(new URLSearchParams(placeListQuery(state)))).toEqual(state)
  })

  it('tells a narrowed list from the whole list', () => {
    expect(hasPlaceFilters({})).toBe(false)
    expect(hasPlaceFilters({ search: 'x' })).toBe(true)
    expect(hasPlaceFilters({ kind: 'pitch' })).toBe(true)
  })
})

describe('orderParentFirst', () => {
  const place = (id: string, name: string | null, parentPlaceId: string | null = null): HierarchyPlace => ({
    id,
    name,
    parentPlaceId,
  })
  const summary = (places: readonly HierarchyPlace[]) =>
    orderParentFirst(places).map((row) => `${String(row.depth)}:${row.place.id}${row.parentElsewhere ? '*' : ''}`)

  it('returns an empty list for an empty page', () => {
    expect(orderParentFirst([])).toEqual([])
  })

  it('lists each parent before its children, children by name, at one more level per ancestor', () => {
    // The page comes sorted by name, as the API sorts it.
    const page = [
      place('boisko', 'Boisko piłkarskie', 'orlik'),
      place('hala', 'Hala sportowa'),
      place('orlik', 'Orlik'),
      place('szatnia', 'Szatnia', 'boisko'),
      place('wielo', 'Boisko wielofunkcyjne', 'orlik'),
    ]
    expect(summary(page)).toEqual(['0:hala', '0:orlik', '1:boisko', '2:szatnia', '1:wielo'])
  })

  it('starts a branch for a child whose parent is not on the page and marks it', () => {
    const page = [place('boisko', 'Boisko', 'orlik'), place('szatnia', 'Szatnia', 'boisko'), place('hala', 'Hala')]
    expect(summary(page)).toEqual(['0:boisko*', '1:szatnia', '0:hala'])
  })

  it('orders Polish names by the Polish alphabet and equal names by id', () => {
    const page = [place('b', 'Łaźnia'), place('c', 'Lodowisko'), place('z', 'Hala'), place('a', 'Hala')]
    expect(summary(page)).toEqual(['0:a', '0:z', '0:c', '0:b'])
    expect(summary([place('a', 'Hala'), place('z', 'Hala')])).toEqual(['0:a', '0:z'])
    expect(summary([place('n', null), place('m', 'Aula')])).toEqual(['0:n', '0:m'])
    expect(summary([place('m', 'Aula'), place('o', null), place('n', null)])).toEqual(['0:n', '0:o', '0:m'])
  })

  it('lists every place of a corrupt loop exactly once', () => {
    const page = [place('a', 'A', 'b'), place('b', 'B', 'a'), place('self', 'Self', 'self'), place('r', 'Root')]
    expect(summary(page)).toEqual(['0:r', '0:self*', '0:a*', '1:b'])
  })

  it('keeps the rows it was given', () => {
    const orlik = { ...place('orlik', 'Orlik'), ownerName: 'Gmina' }
    expect(orderParentFirst([orlik])[0]?.place).toBe(orlik)
  })
})
