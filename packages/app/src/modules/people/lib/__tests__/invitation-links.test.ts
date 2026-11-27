// Personal invitation link spec REQ-IL02…REQ-IL05, IL-D03, IL-D04 (#868): the link's path and lifetime, the share
// reach of the staff grants, the acting role for a guardian's wards, the list reads and the link's validity.
import { describe, expect, it } from '@jest/globals'
import {
  INVITATION_LINK_TTL_MS,
  groupInReach,
  invitationLinkPath,
  invitationLinkProblem,
  pendingListReads,
  shareActingRole,
  shareReach,
} from '../invitation-links'

describe('invitationLinkPath and the lifetime', () => {
  it('points at the guardian page with the token encoded, valid 7 days', () => {
    expect(invitationLinkPath('a b/c')).toBe('/club/i/a%20b%2Fc')
    expect(INVITATION_LINK_TTL_MS).toBe(604_800_000)
  })
})

describe('shareReach', () => {
  it('reaches the whole club for the administrator', () => {
    expect(shareReach([{ kind: 'coach', ids: ['g1'] }, { kind: 'club_admin' }])).toEqual({ kind: 'club' })
  })
  it('collects coached groups and coordinated sections, unique and sorted', () => {
    expect(
      shareReach([
        { kind: 'coach', ids: ['g2', 'g1'] },
        { kind: 'coach', ids: ['g1'] },
        { kind: 'coordinator', ids: ['s1'] },
        { kind: 'coordinator' },
        { kind: 'guardian', ids: ['w1'] },
      ]),
    ).toEqual({ kind: 'families', groupIds: ['g1', 'g2'], sectionIds: ['s1'] })
  })
  it('reaches nobody without a staff grant', () => {
    expect(
      shareReach([
        { kind: 'guardian', ids: ['w1'] },
        { kind: 'self', ids: ['p1'] },
      ]),
    ).toEqual({ kind: 'none' })
    expect(shareReach([])).toEqual({ kind: 'none' })
  })
})

describe('shareActingRole', () => {
  const families = { kind: 'families', groupIds: ['g1'], sectionIds: ['s2'] } as const
  it('names the administrator for any person, even without wards', () => {
    expect(shareActingRole({ kind: 'club' }, [])).toBe('club_admin')
  })
  it('names the coach for a child in a coached group, before the coordinator', () => {
    expect(shareActingRole(families, [{ groupId: 'g1', sectionId: 's2' }])).toBe('coach')
  })
  it('names the coordinator for a child in a coordinated section', () => {
    expect(shareActingRole(families, [{ groupId: 'g9', sectionId: 's2' }])).toBe('coordinator')
  })
  it('refuses a guardian outside the reach, and every guardian without a reach', () => {
    expect(shareActingRole(families, [{ groupId: 'g9', sectionId: 's9' }])).toBeNull()
    expect(shareActingRole(families, [])).toBeNull()
    expect(shareActingRole({ kind: 'none' }, [{ groupId: 'g1', sectionId: 's2' }])).toBeNull()
  })
})

describe('pendingListReads', () => {
  const families = { kind: 'families', groupIds: ['g1'], sectionIds: ['s2'] } as const
  it('reads nothing without a reach', () => {
    expect(pendingListReads({ kind: 'none' }, {})).toEqual([])
  })
  it('reads the whole club, or the requested group or section, for the administrator', () => {
    expect(pendingListReads({ kind: 'club' }, {})).toEqual([{}])
    expect(pendingListReads({ kind: 'club' }, { groupId: 'g5', sectionId: null })).toEqual([{ groupIds: ['g5'] }])
    expect(pendingListReads({ kind: 'club' }, { sectionId: 's5' })).toEqual([{ sectionIds: ['s5'] }])
  })
  it('reads the requested group or section for staff (rows are kept by the reach afterwards)', () => {
    expect(pendingListReads(families, { groupId: 'g7' })).toEqual([{ groupIds: ['g7'] }])
    expect(pendingListReads(families, { sectionId: 's2' })).toEqual([{ sectionIds: ['s2'] }])
  })
  it('reads the coached groups and the coordinated sections otherwise', () => {
    expect(pendingListReads(families, {})).toEqual([{ groupIds: ['g1'] }, { sectionIds: ['s2'] }])
    expect(pendingListReads({ kind: 'families', groupIds: [], sectionIds: ['s2'] }, {})).toEqual([
      { sectionIds: ['s2'] },
    ])
    expect(pendingListReads({ kind: 'families', groupIds: ['g1'], sectionIds: [] }, {})).toEqual([{ groupIds: ['g1'] }])
  })
})

describe('groupInReach', () => {
  const families = { kind: 'families', groupIds: ['g1'], sectionIds: ['s2'] } as const
  it('keeps every group for the administrator and none without a reach', () => {
    expect(groupInReach({ kind: 'club' }, { groupId: 'g9', sectionId: 's9' })).toBe(true)
    expect(groupInReach({ kind: 'none' }, { groupId: 'g1', sectionId: 's2' })).toBe(false)
  })
  it('keeps a coached group or a group of a coordinated section', () => {
    expect(groupInReach(families, { groupId: 'g1', sectionId: 's9' })).toBe(true)
    expect(groupInReach(families, { groupId: 'g9', sectionId: 's2' })).toBe(true)
    expect(groupInReach(families, { groupId: 'g9', sectionId: 's9' })).toBe(false)
  })
})

describe('invitationLinkProblem', () => {
  const valid = { found: true, expired: false, revoked: false, personActive: true, accountState: 'invited' } as const
  it('accepts a found, live, unrevoked link of an invited account', () => {
    expect(invitationLinkProblem(valid)).toBeNull()
  })
  it('names each cause, in the order the page checks them', () => {
    expect(invitationLinkProblem({ ...valid, found: false, revoked: true })).toBe('unknown')
    expect(invitationLinkProblem({ ...valid, revoked: true, expired: true })).toBe('revoked')
    expect(invitationLinkProblem({ ...valid, expired: true, personActive: false })).toBe('expired')
    expect(invitationLinkProblem({ ...valid, personActive: false, accountState: 'active' })).toBe('person_gone')
    expect(invitationLinkProblem({ ...valid, accountState: 'active' })).toBe('used')
    expect(invitationLinkProblem({ ...valid, accountState: 'blocked' })).toBe('used')
    expect(invitationLinkProblem({ ...valid, accountState: 'none' })).toBe('used')
  })
})
