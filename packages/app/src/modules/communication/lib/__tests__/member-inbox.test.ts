import { describe, expect, it } from '@jest/globals'
import {
  MEMBER_COMPOSER_KINDS,
  composePreset,
  emailDeliverySummary,
  isStaff,
  memberComposerKinds,
  wardThreadsOf,
} from '../member-inbox'

describe('wardThreadsOf', () => {
  it('collects the distinct groups and their known sections, sorted', () => {
    const sections = new Map([
      ['g-b', { sectionId: 's-2' }],
      ['g-a', { sectionId: 's-1' }],
      ['g-c', { sectionId: 's-1' }],
    ])
    expect(
      wardThreadsOf('ward', [{ groupId: 'g-b' }, { groupId: 'g-a' }, { groupId: 'g-b' }, { groupId: 'g-c' }], sections),
    ).toEqual({ personId: 'ward', groupIds: ['g-a', 'g-b', 'g-c'], sectionIds: ['s-1', 's-2'] })
  })

  it('adds no section for a group the directory does not know', () => {
    expect(wardThreadsOf('ward', [{ groupId: 'gone' }], new Map())).toEqual({
      personId: 'ward',
      groupIds: ['gone'],
      sectionIds: [],
    })
  })

  it('keeps the ward alone without any membership', () => {
    expect(wardThreadsOf('ward', [], new Map())).toEqual({ personId: 'ward', groupIds: [], sectionIds: [] })
  })
})

describe('memberComposerKinds', () => {
  it('offers sections, groups and sessions in order, among the allowed kinds', () => {
    expect(MEMBER_COMPOSER_KINDS).toEqual(['section', 'group', 'occurrence'])
    expect(memberComposerKinds(['occurrence', 'club', 'group', 'activity', 'section'])).toEqual([
      'section',
      'group',
      'occurrence',
    ])
  })

  it('offers only what the grants allow (a coach: groups and sessions)', () => {
    expect(memberComposerKinds(['group', 'activity', 'occurrence'])).toEqual(['group', 'occurrence'])
    expect(memberComposerKinds(['club'])).toEqual([])
  })
})

describe('emailDeliverySummary', () => {
  it('is null without counts or without any e-mail delivery', () => {
    expect(emailDeliverySummary(null)).toBeNull()
    expect(emailDeliverySummary({ queued: 0, sent: 0, failed: 0, skipped: 0 })).toBeNull()
  })

  it('counts sent as delivered, failed and skipped as not delivered, queued as pending', () => {
    expect(emailDeliverySummary({ queued: 1, sent: 3, failed: 1, skipped: 2 })).toEqual({
      delivered: 3,
      notDelivered: 3,
      pending: 1,
    })
  })
})

describe('composePreset (E10-S07, REQ-A13)', () => {
  const id = '0b5d6a4e-1c2f-4a3b-9d8e-7f6a5b4c3d2e'

  it('reads a session, a group or a section preset', () => {
    expect(composePreset(`occurrence:${id}`)).toEqual({ kind: 'occurrence', ids: [id] })
    expect(composePreset(`group:${id.toUpperCase()}`)).toEqual({ kind: 'group', ids: [id] })
    expect(composePreset(`section:${id}`)).toEqual({ kind: 'section', ids: [id] })
  })

  it('opens nothing for another kind, a malformed id or no value', () => {
    expect(composePreset(`club:${id}`)).toBeNull()
    expect(composePreset('occurrence:nope')).toBeNull()
    expect(composePreset(null)).toBeNull()
    expect(composePreset(undefined)).toBeNull()
  })

  it('reads the link the session page builds (`?compose=occurrence%3A<id>`)', () => {
    expect(composePreset(new URLSearchParams(`compose=occurrence%3A${id}`).get('compose'))).toEqual({
      kind: 'occurrence',
      ids: [id],
    })
  })
})

describe('isStaff (E20-S10, #489)', () => {
  it('names the coaches, the coordinators and the club administrator, not the members or the attendant', () => {
    expect(isStaff(['self', 'coach'])).toBe(true)
    expect(isStaff(['coordinator'])).toBe(true)
    expect(isStaff(['club_admin'])).toBe(true)
    expect(isStaff(['self', 'guardian'])).toBe(false)
    expect(isStaff(['self', 'facility_operator', 'treasurer'])).toBe(false)
  })
})
