import { describe, expect, it } from '@jest/globals'
import type { Scope } from '@vereino/core'
import {
  DIRECT_TARGETS,
  DIRECT_THREADS_PER_DAY,
  DIRECT_THREAD_WINDOW_MS,
  addressedStaffIds,
  coachIdsOf,
  directLimitReached,
  directMembers,
  directOptions,
  directParticipantRows,
  directSubjectIds,
  directWindowStart,
  participantGroupIds,
  type DirectOptionFacts,
} from '../direct-rules'

describe('direct thread constants', () => {
  it('addresses the coaches or the coordinator, 20 threads in 24 hours', () => {
    expect(DIRECT_TARGETS).toEqual(['coaches', 'coordinator'])
    expect(DIRECT_THREADS_PER_DAY).toBe(20)
    expect(DIRECT_THREAD_WINDOW_MS).toBe(86_400_000)
  })
})

describe('directSubjectIds', () => {
  it('lists the own person first, then the wards, without duplicates', () => {
    const scope: Scope = [
      { kind: 'guardian', ids: ['ward-1', 'ward-2'] },
      { kind: 'self', ids: ['me'] },
      { kind: 'coach', ids: ['group-1'] },
      { kind: 'guardian', ids: ['ward-1'] },
    ]
    expect(directSubjectIds(scope)).toEqual(['me', 'ward-1', 'ward-2'])
  })

  it('is empty for a user linked to no person', () => {
    expect(directSubjectIds([{ kind: 'club_admin' }])).toEqual([])
  })
})

describe('the daily limit', () => {
  it('counts back 24 hours from now', () => {
    expect(directWindowStart(new Date('2026-11-05T12:00:00Z')).toISOString()).toBe('2026-11-04T12:00:00.000Z')
  })

  it('refuses the 21st thread, not the 20th', () => {
    expect(directLimitReached(19)).toBe(false)
    expect(directLimitReached(20)).toBe(true)
    expect(directLimitReached(21)).toBe(true)
  })
})

describe('coachIdsOf', () => {
  it('keeps the coaches and assistants, deduplicated and sorted', () => {
    expect(
      coachIdsOf([
        { personId: 'c-2', role: 'coach' },
        { personId: 'p-1', role: 'participant' },
        { personId: 'a-1', role: 'assistant' },
        { personId: 'c-2', role: 'assistant' },
      ]),
    ).toEqual(['a-1', 'c-2'])
  })
})

describe('addressedStaffIds', () => {
  it('drops the author and duplicates', () => {
    expect(addressedStaffIds(['b', 'me', 'a', 'b'], 'me')).toEqual(['a', 'b'])
  })
})

describe('directMembers', () => {
  it('addresses the subject directly and the staff as coaches', () => {
    expect(directMembers('jas', ['wojtek'])).toEqual([
      { personId: 'jas', reason: 'direct' },
      { personId: 'wojtek', reason: 'coach' },
    ])
  })
})

describe('directParticipantRows', () => {
  it('adds the author and `staff` to the addressed staff', () => {
    expect(
      directParticipantRows(
        [
          { personId: 'wojtek', reasons: ['coach'] },
          { personId: 'dad', reasons: ['guardian'] },
        ],
        'kasia',
        ['wojtek'],
      ),
    ).toEqual([
      { personId: 'kasia', reasons: ['author'] },
      { personId: 'wojtek', reasons: ['coach', 'staff'] },
      { personId: 'dad', reasons: ['guardian'] },
    ])
  })
})

describe('participantGroupIds', () => {
  it('keeps the participant memberships of the subjects, one group once', () => {
    const groups = participantGroupIds(
      ['jas', 'ola'],
      [
        { personId: 'jas', groupId: 'zaki', role: 'participant' },
        { personId: 'jas', groupId: 'zaki', role: 'participant' },
        { personId: 'jas', groupId: 'orliki', role: 'coach' },
        { personId: 'ola', groupId: 'juniorzy', role: 'participant' },
        { personId: 'other', groupId: 'zaki', role: 'participant' },
      ],
    )
    expect([...groups]).toEqual([
      ['jas', ['zaki']],
      ['ola', ['juniorzy']],
    ])
  })
})

describe('directOptions', () => {
  const facts: DirectOptionFacts = {
    subjectIds: ['kasia', 'jas', 'ghost'],
    memberships: [
      { personId: 'jas', groupId: 'zaki', role: 'participant' },
      { personId: 'jas', groupId: 'basen', role: 'participant' },
      { personId: 'jas', groupId: 'lost', role: 'participant' },
      { personId: 'jas', groupId: 'orphan', role: 'participant' },
      { personId: 'jas', groupId: 'aaa', role: 'participant' },
      { personId: 'ghost', groupId: 'zaki', role: 'participant' },
    ],
    groups: new Map([
      ['zaki', { id: 'zaki', sectionId: 'football', name: 'Żaki' }],
      ['aaa', { id: 'aaa', sectionId: 'football', name: 'Aaa' }],
      ['basen', { id: 'basen', sectionId: 'swimming', name: 'Basen' }],
      ['orphan', { id: 'orphan', sectionId: 'gone', name: 'Orphan' }],
    ]),
    sections: new Map([
      ['football', { id: 'football', name: 'Piłka nożna' }],
      ['swimming', { id: 'swimming', name: 'Pływanie' }],
    ]),
    coachIdsByGroup: new Map([['zaki', ['wojtek', 'kasia', 'nameless']]]),
    coordinatorIdsBySection: new Map([['football', ['zofia', 'adam']]]),
    names: new Map([
      ['kasia', 'Kasia Nowak'],
      ['jas', 'Jaś Nowak'],
      ['wojtek', 'Wojtek Trener'],
      ['zofia', 'Zofia Koordynator'],
      ['adam', 'Adam Koordynator'],
    ]),
  }

  it('lists each subject’s groups today with their staff names, the viewer left out', () => {
    expect(directOptions(facts, 'kasia')).toEqual([
      {
        personId: 'jas',
        personName: 'Jaś Nowak',
        groupId: 'aaa',
        groupName: 'Aaa',
        sectionId: 'football',
        sectionName: 'Piłka nożna',
        coachNames: [],
        coordinatorNames: ['Adam Koordynator', 'Zofia Koordynator'],
      },
      {
        personId: 'jas',
        personName: 'Jaś Nowak',
        groupId: 'zaki',
        groupName: 'Żaki',
        sectionId: 'football',
        sectionName: 'Piłka nożna',
        coachNames: ['Wojtek Trener'],
        coordinatorNames: ['Adam Koordynator', 'Zofia Koordynator'],
      },
      {
        personId: 'jas',
        personName: 'Jaś Nowak',
        groupId: 'basen',
        groupName: 'Basen',
        sectionId: 'swimming',
        sectionName: 'Pływanie',
        coachNames: [],
        coordinatorNames: [],
      },
    ])
  })

  it('keeps the viewer among the staff names for a viewer linked to no person', () => {
    expect(directOptions(facts, null).find((option) => option.groupId === 'zaki')?.coachNames).toEqual([
      'Kasia Nowak',
      'Wojtek Trener',
    ])
  })
})
