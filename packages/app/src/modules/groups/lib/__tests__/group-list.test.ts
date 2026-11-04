import { describe, expect, it } from '@jest/globals'
import {
  GROUP_PERSPECTIVES,
  groupListQuery,
  hasGroupFilters,
  parseGroupListState,
  perspectiveOf,
  summarizeRosters,
  withPerspective,
} from '../group-list'

const SECTION = '7f0c2d4e-1b2a-4c3d-8e9f-0a1b2c3d4e5f'
const SEASON = '0d9c8b7a-6f5e-4d3c-9b2a-1f0e9d8c7b6a'

describe('parseGroupListState', () => {
  it('reads every filter of a groups URL', () => {
    const query = new URLSearchParams(
      `kind=class_group&sectionId=${SECTION}&seasonId=${SEASON}&isActive=false&search=%20Basen%20`,
    )
    expect(parseGroupListState(query)).toEqual({
      kind: 'class_group',
      sectionId: SECTION,
      seasonId: SEASON,
      isActive: 'false',
      search: 'Basen',
    })
    expect(parseGroupListState(new URLSearchParams('kind=team&isActive=true'))).toEqual({
      kind: 'team',
      isActive: 'true',
    })
  })

  it('drops unknown kinds and statuses, blank and over-long values', () => {
    const query = new URLSearchParams(`kind=club&isActive=yes&sectionId=%20%20&search=${'x'.repeat(201)}`)
    expect(parseGroupListState(query)).toEqual({})
    expect(parseGroupListState(new URLSearchParams(''))).toEqual({})
  })
})

describe('groupListQuery', () => {
  it('writes the set filters in a stable order and nothing for an empty state', () => {
    expect(groupListQuery({ search: 'Orliki', isActive: 'true', kind: 'team', sectionId: SECTION })).toBe(
      `kind=team&sectionId=${SECTION}&isActive=true&search=Orliki`,
    )
    expect(groupListQuery({ seasonId: SEASON })).toBe(`seasonId=${SEASON}`)
    expect(groupListQuery({})).toBe('')
  })

  it('round-trips through parseGroupListState', () => {
    const state = { kind: 'class_group', sectionId: SECTION, seasonId: SEASON, isActive: 'false', search: 'Ż' } as const
    expect(parseGroupListState(new URLSearchParams(groupListQuery(state)))).toEqual(state)
  })
})

describe('perspectives', () => {
  it('offers All and one perspective per kind', () => {
    expect(GROUP_PERSPECTIVES).toEqual(['all', 'team', 'class_group'])
  })

  it('shows the kind as the perspective, All without one', () => {
    expect(perspectiveOf({ kind: 'team' })).toBe('team')
    expect(perspectiveOf({ sectionId: SECTION })).toBe('all')
  })

  it('switches the kind and keeps the other filters', () => {
    expect(withPerspective({ kind: 'team', sectionId: SECTION }, 'class_group')).toEqual({
      kind: 'class_group',
      sectionId: SECTION,
    })
    expect(withPerspective({ kind: 'team', sectionId: SECTION }, 'all')).toEqual({ sectionId: SECTION })
  })
})

describe('hasGroupFilters', () => {
  it('is true when any filter or the search is set', () => {
    expect(hasGroupFilters({})).toBe(false)
    expect(hasGroupFilters({ kind: 'team' })).toBe(true)
    expect(hasGroupFilters({ search: 'Basen' })).toBe(true)
    expect(hasGroupFilters({ isActive: 'false' })).toBe(true)
  })
})

describe('summarizeRosters', () => {
  it('counts distinct participants and lists each coaching person once, coaches before assistants', () => {
    const summaries = summarizeRosters(
      ['g1', 'g2'],
      [
        { groupId: 'g1', personId: 'assistant-1', role: 'assistant' },
        { groupId: 'g1', personId: 'p1', role: 'participant' },
        { groupId: 'g1', personId: 'coach-1', role: 'coach' },
        { groupId: 'g1', personId: 'p2', role: 'participant' },
        { groupId: 'g1', personId: 'p1', role: 'participant' },
        { groupId: 'g1', personId: 'coach-2', role: 'coach' },
        // A person who both coaches and assists is listed once, as a coach.
        { groupId: 'g1', personId: 'both', role: 'assistant' },
        { groupId: 'g1', personId: 'both', role: 'coach' },
        { groupId: 'g1', personId: 'coach-1', role: 'assistant' },
        // A coach who also takes part counts as a participant too.
        { groupId: 'g1', personId: 'coach-1', role: 'participant' },
        { groupId: 'other', personId: 'p9', role: 'participant' },
      ],
    )
    expect(summaries.get('g1')).toEqual({
      coachIds: ['coach-1', 'coach-2', 'both', 'assistant-1'],
      participantCount: 3,
    })
    expect(summaries.get('g2')).toEqual({ coachIds: [], participantCount: 0 })
    expect(summaries.has('other')).toBe(false)
  })

  it('returns an empty map for no groups', () => {
    expect(summarizeRosters([], [{ groupId: 'g1', personId: 'p1', role: 'participant' }]).size).toBe(0)
  })
})
