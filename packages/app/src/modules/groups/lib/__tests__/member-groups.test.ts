import { describe, expect, it } from '@jest/globals'
import { MEMBER_GROUP_KINDS, memberGroupRows, memberPersonIds, type MemberGroupRecord } from '../member-groups'

describe('memberPersonIds', () => {
  it('takes the self and guardian persons once and ignores every other grant', () => {
    expect(MEMBER_GROUP_KINDS).toEqual(['self', 'guardian'])
    expect(
      memberPersonIds([
        { kind: 'self', ids: ['kasia'] },
        { kind: 'guardian', ids: ['jas', 'ola', 'kasia'] },
        { kind: 'coach', ids: ['group-1'] },
        { kind: 'club_admin' },
        { kind: 'self_user', ids: ['user-1'] },
      ]),
    ).toEqual(['kasia', 'jas', 'ola'])
  })

  it('is empty without a self or guardian grant, or with a grant without ids', () => {
    expect(memberPersonIds([])).toEqual([])
    expect(memberPersonIds([{ kind: 'guardian' }])).toEqual([])
  })
})

describe('memberGroupRows', () => {
  const group = (id: string, name: string, sectionId: string, isActive = true): MemberGroupRecord => ({
    id,
    name,
    kind: 'team',
    sectionId,
    isActive,
  })
  const groups = new Map([
    ['orliki', group('orliki', 'Orliki', 'football')],
    ['basen', { ...group('basen', 'Basen 1', 'pool'), kind: 'class_group' as const }],
    ['zaki', group('zaki', 'Żaki', 'football', false)],
    ['nameless', group('nameless', 'Bez sekcji', 'gone')],
  ])
  const sections = new Map([
    ['football', 'Piłka nożna'],
    ['pool', 'Basen'],
  ])
  const membership = (personId: string, groupId: string, validFrom = '2026-09-01', validTo: string | null = null) => ({
    personId,
    groupId,
    role: 'participant' as const,
    validFrom,
    validTo,
  })

  it('lists the memberships active on the day in active groups, with the section name, sorted', () => {
    const rows = memberGroupRows(
      [
        membership('jas', 'orliki'),
        membership('jas', 'basen'),
        membership('ola', 'orliki', '2026-12-01'),
        membership('ola', 'basen', '2026-09-01', '2026-10-31'),
        membership('ola', 'zaki'),
        membership('ola', 'missing'),
        membership('ola', 'nameless'),
        { ...membership('jas', 'orliki'), role: 'assistant' as const },
      ],
      groups,
      sections,
      '2026-11-04',
    )
    expect(rows).toEqual([
      {
        personId: 'jas',
        groupId: 'basen',
        groupName: 'Basen 1',
        groupKind: 'class_group',
        sectionId: 'pool',
        sectionName: 'Basen',
        role: 'participant',
      },
      expect.objectContaining({ personId: 'jas', groupId: 'orliki', sectionName: 'Piłka nożna', role: 'assistant' }),
      expect.objectContaining({ personId: 'jas', groupId: 'orliki', role: 'participant' }),
      expect.objectContaining({ personId: 'ola', groupId: 'nameless', sectionName: null }),
    ])
  })

  it('orders a section without a name before named ones and is empty without memberships', () => {
    const rows = memberGroupRows(
      [membership('jas', 'orliki'), membership('jas', 'nameless')],
      groups,
      sections,
      '2026-11-04',
    )
    expect(rows.map((row) => row.groupId)).toEqual(['nameless', 'orliki'])
    expect(memberGroupRows([], groups, sections, '2026-11-04')).toEqual([])
  })
})
