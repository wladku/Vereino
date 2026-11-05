import { describe, expect, it } from '@jest/globals'
import {
  SECTIONS_LIST_HREF,
  SECTIONS_WITHOUT_COORDINATOR_LIMIT,
  SECTION_PAGE_SIZE,
  hasNextPage,
  sectionCoordinatorsHref,
  sectionListQuery,
  sectionsMissingCoordinator,
  summarizeSectionsWithoutCoordinator,
} from '../dashboard-rules'

describe('sectionsMissingCoordinator', () => {
  it('keeps the active sections flagged without a coordinator', () => {
    expect(
      sectionsMissingCoordinator([
        { id: 's1', name: 'Basen', isActive: true, _people: { coordinators: [], coordinatorMissing: true } },
        { id: 's2', name: 'Szachy', isActive: true, _people: { coordinators: [{}], coordinatorMissing: false } },
        { id: 's3', name: 'Zumba', _people: { coordinatorMissing: true } },
      ]),
    ).toEqual([
      { id: 's1', name: 'Basen' },
      { id: 's3', name: 'Zumba' },
    ])
  })

  it('skips inactive sections, rows without the enrichment and malformed rows', () => {
    expect(
      sectionsMissingCoordinator([
        null,
        'section',
        { id: 7, _people: { coordinatorMissing: true } },
        { id: 's4', name: 'Cheer', isActive: false, _people: { coordinatorMissing: true } },
        { id: 's5', name: 'Akademia' },
        { id: 's6', name: 'Akademia', _people: null },
        { id: 's7', name: 'Akademia', _people: { coordinatorMissing: 'yes' } },
      ]),
    ).toEqual([])
  })

  it('reads a missing name as empty', () => {
    expect(sectionsMissingCoordinator([{ id: 's8', name: null, _people: { coordinatorMissing: true } }])).toEqual([
      { id: 's8', name: '' },
    ])
  })
})

describe('summarizeSectionsWithoutCoordinator', () => {
  const sections = [
    { id: 'f', name: 'zumba' },
    { id: 'a', name: 'Basen' },
    { id: 'c', name: 'Cheerleader' },
    { id: 'b', name: 'basen' },
    { id: 'e', name: 'Szachy' },
    { id: 'd', name: 'Akademia' },
  ]

  it('counts every section and lists the first five by name', () => {
    expect(summarizeSectionsWithoutCoordinator(sections)).toEqual({
      total: 6,
      sections: [
        { id: 'd', name: 'Akademia' },
        { id: 'a', name: 'Basen' },
        { id: 'b', name: 'basen' },
        { id: 'c', name: 'Cheerleader' },
        { id: 'e', name: 'Szachy' },
      ],
    })
    expect(SECTIONS_WITHOUT_COORDINATOR_LIMIT).toBe(5)
  })

  it('honours a custom limit and never a negative one', () => {
    expect(summarizeSectionsWithoutCoordinator(sections, 1).sections).toEqual([{ id: 'd', name: 'Akademia' }])
    expect(summarizeSectionsWithoutCoordinator(sections, -1)).toEqual({ total: 6, sections: [] })
  })

  it('returns an empty summary for no sections without changing the input', () => {
    const input: { id: string; name: string }[] = []
    expect(summarizeSectionsWithoutCoordinator(input)).toEqual({ total: 0, sections: [] })
    expect(input).toEqual([])
  })
})

describe('sectionListQuery', () => {
  it('reads one page of the active sections by name', () => {
    expect(SECTION_PAGE_SIZE).toBe(100)
    expect(Object.fromEntries(new URLSearchParams(sectionListQuery(2)))).toEqual({
      page: '2',
      pageSize: '100',
      isActive: 'true',
      sortField: 'name',
      sortDir: 'asc',
    })
  })
})

describe('hasNextPage', () => {
  it('is true only before the last page of a numeric total', () => {
    expect(hasNextPage(1, 3)).toBe(true)
    expect(hasNextPage(3, 3)).toBe(false)
    expect(hasNextPage(1, 0)).toBe(false)
    expect(hasNextPage(1, '3')).toBe(false)
    expect(hasNextPage(1, Number.POSITIVE_INFINITY)).toBe(false)
    expect(hasNextPage(1, undefined)).toBe(false)
  })
})

describe('section links', () => {
  it('opens the Coordinators tab of the section', () => {
    expect(sectionCoordinatorsHref('3f2a')).toBe('/backend/club/sections/3f2a/edit?tab=coordinators')
    expect(sectionCoordinatorsHref('a/b')).toBe('/backend/club/sections/a%2Fb/edit?tab=coordinators')
    expect(SECTIONS_LIST_HREF).toBe('/backend/club/sections')
  })
})
