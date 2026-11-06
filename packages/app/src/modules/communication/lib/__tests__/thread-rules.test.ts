import { describe, expect, it } from '@jest/globals'
import type { AudienceContact, Recipient, Scope } from '@vereino/core'
import { clockLabel, preheaderOf, sessionWhenLabel } from '../email-format'
import { errorCodes } from '../error-codes'
import {
  COMPOSER_KINDS,
  MESSAGE_AUDIENCES,
  MESSAGE_KINDS,
  STAFF_PARTICIPANT_REASONS,
  THREAD_READ_KINDS,
  THREAD_SCOPE_TYPES,
  absoluteUrl,
  allowedAudienceKinds,
  audienceKindOf,
  audienceTarget,
  contactChannels,
  emailOnlyRecipients,
  excerpt,
  grantIds,
  householdOf,
  isThreadStaff,
  isUnread,
  isVisibleTo,
  lastVisibleMessage,
  lastVisibleMessageAt,
  latestMessages,
  maySeeSection,
  memberThreadPath,
  pageWindow,
  pagedEnvelope,
  participantRows,
  postingKinds,
  replyActingRole,
  replyRecipients,
  selfPersonId,
  shareLine,
  staffParticipants,
  threadScopeTypeOf,
  type MessageRow,
} from '../thread-rules'

const ORG = { tenantId: 't-1', organizationId: 'o-1' }
const at = (iso: string) => new Date(iso)

function recipient(personId: string, overrides: Partial<Recipient> = {}): Recipient {
  return {
    personId,
    userId: `u-${personId}`,
    email: `${personId}@example.test`,
    locale: 'pl',
    reasons: ['participant'],
    channels: ['in_app', 'email'],
    ...overrides,
  }
}

function contact(personId: string, overrides: Partial<AudienceContact> = {}): AudienceContact {
  return {
    personId,
    name: personId,
    userId: `u-${personId}`,
    email: `${personId}@example.test`,
    locale: 'en',
    birthDate: null,
    ...overrides,
  }
}

describe('vocabulary', () => {
  it('declares the scopes, message kinds, audiences and staff reasons of the spec', () => {
    expect(THREAD_SCOPE_TYPES).toEqual(['club', 'section', 'group', 'activity', 'occurrence', 'direct'])
    expect(MESSAGE_KINDS).toEqual(['message', 'revision', 'tombstone'])
    expect(MESSAGE_AUDIENCES).toEqual(['all', 'staff'])
    expect(STAFF_PARTICIPANT_REASONS).toEqual(['author', 'coach', 'staff'])
    expect(COMPOSER_KINDS).toEqual(['club', 'section', 'group', 'activity', 'occurrence'])
    expect(THREAD_READ_KINDS).toEqual(['coordinator', 'club_admin'])
  })

  it('declares its error codes with module message keys', () => {
    expect(errorCodes.map((entry) => entry.code)).toEqual([
      'message_deleted',
      'message_not_editable',
      'share_text_unavailable',
      'case_immutable',
      'case_already_open',
      'direct_no_recipients',
      'direct_thread_limit',
    ])
    for (const entry of errorCodes) expect(entry.messageKey).toBe(`communication.errors.${entry.code}`)
  })
})

describe('who may post where', () => {
  it('maps each audience kind to its posting grant kinds, least-privileged first', () => {
    expect(postingKinds('club')).toEqual(['club_admin'])
    expect(postingKinds('section')).toEqual(['coordinator', 'club_admin'])
    expect(postingKinds('group')).toEqual(['coach', 'coordinator', 'club_admin'])
    expect(postingKinds('activity')).toEqual(['coach', 'coordinator', 'club_admin'])
    expect(postingKinds('occurrence')).toEqual(['coach', 'coordinator', 'club_admin'])
    expect(postingKinds('persons')).toEqual(['coach', 'coordinator', 'club_admin'])
  })

  it('maps audiences to thread scopes and back (persons ↔ direct)', () => {
    expect(threadScopeTypeOf('persons')).toBe('direct')
    expect(threadScopeTypeOf('group')).toBe('group')
    expect(audienceKindOf('direct')).toBe('persons')
    expect(audienceKindOf('occurrence')).toBe('occurrence')
  })

  it('offers a coach the group, activity and session kinds only', () => {
    expect(
      allowedAudienceKinds([
        { kind: 'coach', ids: ['g-1'] },
        { kind: 'self', ids: ['p-1'] },
      ]),
    ).toEqual(['group', 'activity', 'occurrence'])
    expect(allowedAudienceKinds([{ kind: 'coordinator', ids: ['s-1'] }])).toEqual([
      'section',
      'group',
      'activity',
      'occurrence',
    ])
    expect(allowedAudienceKinds([{ kind: 'club_admin' }])).toEqual(COMPOSER_KINDS)
    expect(allowedAudienceKinds([{ kind: 'self', ids: ['p-1'] }])).toEqual([])
  })

  it('reads grant ids and the self person', () => {
    const scope: Scope = [
      { kind: 'coach', ids: ['g-1', 'g-2'] },
      { kind: 'coach', ids: ['g-2'] },
      { kind: 'club_admin' },
      { kind: 'self', ids: ['p-1'] },
    ]
    expect(grantIds(scope, 'coach')).toEqual(['g-1', 'g-2'])
    expect(grantIds(scope, 'club_admin')).toEqual([])
    expect(selfPersonId(scope)).toBe('p-1')
    expect(selfPersonId([{ kind: 'club_admin' }])).toBeNull()
  })

  it('builds the scope target of an audience target', () => {
    expect(audienceTarget('x', ORG, { sectionId: 's', groupId: 'g', occurrenceId: 'o' })).toEqual({
      id: 'x',
      ...ORG,
      sectionId: 's',
      groupId: 'g',
      occurrenceId: 'o',
    })
    expect(audienceTarget('x', ORG, {})).toEqual({
      id: 'x',
      ...ORG,
      sectionId: null,
      groupId: null,
      occurrenceId: null,
    })
  })
})

describe('recipients', () => {
  it('keeps the e-mail channel only for a cancellation and leaves out the canceller', () => {
    const recipients = [
      recipient('a'),
      recipient('b', { channels: ['in_app'], email: null }),
      recipient('c', { channels: [], userId: null, email: null }),
      recipient('d', { userId: 'u-actor' }),
      recipient('e', { channels: ['email'], userId: null }),
    ]
    expect(emailOnlyRecipients(recipients, 'u-actor')).toEqual([
      { ...recipients[0], channels: ['email'] },
      recipients[2],
      recipients[4],
    ])
    expect(emailOnlyRecipients([recipient('d', { userId: 'u-actor' })], null)).toHaveLength(1)
  })

  it('derives the channels of a contact', () => {
    expect(contactChannels({ userId: 'u', email: 'e' })).toEqual(['in_app', 'email'])
    expect(contactChannels({ userId: null, email: 'e' })).toEqual(['email'])
    expect(contactChannels({ userId: null, email: null })).toEqual([])
  })

  it('reaches the participants of a reply without the replier, keeping audience reasons or direct', () => {
    const participants = [
      { personId: 'z', reasons: ['guardian'] },
      { personId: 'author', reasons: ['author'] },
      { personId: 'me', reasons: ['guardian'] },
      { personId: 'gone', reasons: ['participant'] },
    ]
    const contacts = new Map([
      ['z', contact('z')],
      ['author', contact('author', { userId: null })],
      ['me', contact('me')],
    ])
    expect(replyRecipients(participants, contacts, 'me')).toEqual([
      {
        personId: 'author',
        userId: null,
        email: 'author@example.test',
        locale: 'en',
        reasons: ['direct'],
        channels: ['email'],
      },
      {
        personId: 'z',
        userId: 'u-z',
        email: 'z@example.test',
        locale: 'en',
        reasons: ['guardian'],
        channels: ['in_app', 'email'],
      },
    ])
  })

  it('selects the staff participants', () => {
    const rows = [
      { personId: 'a', reasons: ['author'] },
      { personId: 'b', reasons: ['guardian'] },
      { personId: 'c', reasons: ['coach', 'participant'] },
      { personId: 'd', reasons: ['staff'] },
    ]
    expect(staffParticipants(rows).map((row) => row.personId)).toEqual(['a', 'c', 'd'])
  })

  it('merges the author and the recipients into participant rows with sorted reasons', () => {
    expect(
      participantRows(
        [
          { personId: 'g', reasons: ['guardian', 'coach'] },
          { personId: 'a', reasons: ['coach'] },
        ],
        { personId: 'a', reason: 'author' },
      ),
    ).toEqual([
      { personId: 'a', reasons: ['author', 'coach'] },
      { personId: 'g', reasons: ['coach', 'guardian'] },
    ])
    expect(participantRows([{ personId: 'g', reasons: ['guardian'] }], null)).toEqual([
      { personId: 'g', reasons: ['guardian'] },
    ])
  })
})

describe('staff and visibility (DD-M12, R15)', () => {
  it('treats the author, a staff participant and a staff grant as staff', () => {
    const base = { viewerPersonId: 'p', authorPersonId: 'x', participantReasons: ['guardian'], staffRole: null }
    expect(isThreadStaff(base)).toBe(false)
    expect(isThreadStaff({ ...base, staffRole: 'coordinator' })).toBe(true)
    expect(isThreadStaff({ ...base, authorPersonId: 'p' })).toBe(true)
    expect(isThreadStaff({ ...base, participantReasons: ['coach'] })).toBe(true)
    expect(isThreadStaff({ ...base, participantReasons: null })).toBe(false)
    expect(isThreadStaff({ ...base, viewerPersonId: null, authorPersonId: null })).toBe(false)
  })

  it('shows members the messages for everyone and their household replies only', () => {
    const household = new Set(['me', 'ward'])
    expect(isVisibleTo({ audience: 'all', authorPersonId: 'x' }, { staff: false, household })).toBe(true)
    expect(isVisibleTo({ audience: 'staff', authorPersonId: 'other' }, { staff: false, household })).toBe(false)
    expect(isVisibleTo({ audience: 'staff', authorPersonId: 'ward' }, { staff: false, household })).toBe(true)
    expect(isVisibleTo({ audience: 'staff', authorPersonId: null }, { staff: false, household })).toBe(false)
    expect(isVisibleTo({ audience: 'staff', authorPersonId: 'other' }, { staff: true, household })).toBe(true)
  })

  it('builds the household from self, wards and their guardians', () => {
    expect([...householdOf(['me'], ['ward'], new Map([['ward', ['me', 'partner']]]))].sort()).toEqual([
      'me',
      'partner',
      'ward',
    ])
  })
})

describe('append-only history (DD-M10)', () => {
  const row = (overrides: Partial<MessageRow> & Pick<MessageRow, 'id' | 'kind' | 'createdAt'>): MessageRow => ({
    supersedesMessageId: null,
    authorPersonId: 'a',
    actingRole: 'coach',
    audience: 'all',
    body: 'text',
    ...overrides,
  })

  it('shows the latest revision, marks edits and deletions, ignores orphans and changes after a deletion', () => {
    const views = latestMessages([
      row({ id: 'm2', kind: 'message', createdAt: at('2026-11-02T10:05:00Z'), body: 'second' }),
      row({ id: 'm1', kind: 'message', createdAt: at('2026-11-02T10:00:00Z'), body: 'first' }),
      row({
        id: 'r1',
        kind: 'revision',
        supersedesMessageId: 'm1',
        createdAt: at('2026-11-02T10:10:00Z'),
        body: 'first, edited',
      }),
      row({
        id: 't2',
        kind: 'tombstone',
        supersedesMessageId: 'm2',
        createdAt: at('2026-11-02T10:11:00Z'),
        body: null,
      }),
      row({
        id: 'r2',
        kind: 'revision',
        supersedesMessageId: 'm2',
        createdAt: at('2026-11-02T10:12:00Z'),
        body: 'too late',
      }),
      row({ id: 'r3', kind: 'revision', supersedesMessageId: 'missing', createdAt: at('2026-11-02T10:13:00Z') }),
      row({ id: 'r4', kind: 'revision', createdAt: at('2026-11-02T10:14:00Z') }),
      row({
        id: 's1',
        kind: 'message',
        authorPersonId: null,
        actingRole: 'system',
        createdAt: at('2026-11-02T10:15:00Z'),
      }),
    ])
    expect(
      views.map((view) => [view.id, view.body, view.editedAt?.toISOString() ?? null, view.deleted, view.system]),
    ).toEqual([
      ['m1', 'first, edited', '2026-11-02T10:10:00.000Z', false, false],
      ['m2', null, '2026-11-02T10:11:00.000Z', true, false],
      ['s1', 'text', null, false, true],
    ])
  })

  it('orders rows of the same instant by id', () => {
    const same = at('2026-11-02T10:00:00Z')
    const views = latestMessages([
      row({ id: 'b', kind: 'message', createdAt: same }),
      row({ id: 'a', kind: 'message', createdAt: same }),
    ])
    expect(views.map((view) => view.id)).toEqual(['a', 'b'])
  })
})

describe('unread state (DD-M13)', () => {
  const stamps = [
    { authorPersonId: 'me', audience: 'all' as const, createdAt: at('2026-11-02T12:00:00Z') },
    { authorPersonId: 'other', audience: 'staff' as const, createdAt: at('2026-11-02T11:00:00Z') },
    { authorPersonId: 'coach', audience: 'all' as const, createdAt: at('2026-11-02T10:00:00Z') },
    { authorPersonId: null, audience: 'all' as const, createdAt: at('2026-11-02T09:00:00Z') },
  ]

  it('takes the newest visible message by someone else', () => {
    const member = { personId: 'me', staff: false, household: new Set(['me']) }
    expect(lastVisibleMessageAt(stamps, member)?.toISOString()).toBe('2026-11-02T10:00:00.000Z')
    expect(lastVisibleMessageAt(stamps, { ...member, staff: true })?.toISOString()).toBe('2026-11-02T11:00:00.000Z')
    expect(lastVisibleMessageAt(stamps, { ...member, personId: null })?.toISOString()).toBe('2026-11-02T12:00:00.000Z')
    expect(lastVisibleMessageAt([], member)).toBeNull()
  })

  it('is unread when a visible message is newer than the read marker', () => {
    expect(isUnread(null, null)).toBe(false)
    expect(isUnread(at('2026-11-02T10:00:00Z'), null)).toBe(true)
    expect(isUnread(at('2026-11-02T10:00:00Z'), at('2026-11-02T10:00:00Z'))).toBe(false)
    expect(isUnread(at('2026-11-02T10:00:01Z'), at('2026-11-02T10:00:00Z'))).toBe(true)
  })
})

describe('the thread list (B-18)', () => {
  const stamp = (
    id: string,
    kind: MessageRow['kind'],
    authorPersonId: string | null,
    audience: 'all' | 'staff',
    iso: string,
  ) => ({
    id,
    kind,
    authorPersonId,
    audience,
    createdAt: at(iso),
  })
  const stamps = [
    stamp('m1', 'message', 'coach', 'all', '2026-11-02T09:00:00Z'),
    stamp('m2', 'message', 'other-family', 'staff', '2026-11-02T11:00:00Z'),
    stamp('m3', 'message', 'me', 'all', '2026-11-02T10:00:00Z'),
    stamp('r1', 'revision', 'coach', 'all', '2026-11-02T12:00:00Z'),
    stamp('t1', 'tombstone', 'coach', 'all', '2026-11-02T13:00:00Z'),
  ]

  it('takes the newest visible original message, the reader’s own included', () => {
    const member = { staff: false, household: new Set(['me']) }
    expect(lastVisibleMessage(stamps, member)?.id).toBe('m3')
    expect(lastVisibleMessage(stamps, { ...member, staff: true })?.id).toBe('m2')
    expect(lastVisibleMessage(stamps.slice(3), member)).toBeNull()
    expect(lastVisibleMessage([], member)).toBeNull()
  })

  it('takes the later id of two messages at the same instant', () => {
    const staff = { staff: true, household: new Set<string>() }
    const tied = [
      stamp('b', 'message', 'coach', 'all', '2026-11-02T09:00:00Z'),
      stamp('a', 'message', 'coach', 'all', '2026-11-02T09:00:00Z'),
      stamp('c', 'message', 'coach', 'all', '2026-11-02T09:00:00Z'),
    ]
    expect(lastVisibleMessage(tied, staff)?.id).toBe('c')
    expect(lastVisibleMessage([tied[1], tied[0]], staff)?.id).toBe('b')
  })

  it('lets the administrator filter by any section and a coordinator by their own only', () => {
    expect(maySeeSection({ clubWide: true, sectionIds: [] }, 's-1')).toBe(true)
    expect(maySeeSection({ clubWide: false, sectionIds: ['s-1'] }, 's-1')).toBe(true)
    expect(maySeeSection({ clubWide: false, sectionIds: ['s-1'] }, 's-2')).toBe(false)
    expect(maySeeSection({ clubWide: false, sectionIds: [] }, 's-1')).toBe(false)
  })
})

describe('acting role of a reply (R01)', () => {
  it('prefers the staff grant, then the author role, then the participation', () => {
    expect(replyActingRole('coordinator', ['guardian'], null)).toBe('coordinator')
    expect(replyActingRole('club_admin', [], null)).toBe('club_admin')
    expect(replyActingRole('self', ['author'], 'coach')).toBe('coach')
    expect(replyActingRole('self', ['author'], null)).toBe('self')
    expect(replyActingRole('self', ['coach'], null)).toBe('coach')
    expect(replyActingRole('self', ['guardian'], null)).toBe('guardian')
    expect(replyActingRole('self', ['participant'], null)).toBe('self')
  })
})

describe('text helpers', () => {
  it('cuts excerpts on whitespace-collapsed text', () => {
    expect(excerpt('  a \n b  ', 10)).toBe('a b')
    expect(excerpt('abcdefghij', 5)).toBe('abcd…')
    expect(excerpt('abc', 0)).toBe('…')
  })

  it('joins the share line and builds the member thread link', () => {
    expect(shareLine('Match moved', 'https://app/x')).toBe('Match moved — https://app/x')
    expect(shareLine('   ', 'https://app/x')).toBe('https://app/x')
    expect(memberThreadPath('a b')).toBe('/club/messages/a%20b')
    expect(absoluteUrl('https://app.test/', '/club/messages/1')).toBe('https://app.test/club/messages/1')
  })

  it('pages lists in the S6.4 envelope', () => {
    expect(pageWindow(undefined, undefined)).toEqual({ page: 1, pageSize: 20, offset: 0 })
    expect(pageWindow(3, 500)).toEqual({ page: 3, pageSize: 100, offset: 200 })
    expect(pageWindow(0, 0)).toEqual({ page: 1, pageSize: 1, offset: 0 })
    expect(pagedEnvelope(['a'], 0, { page: 1, pageSize: 20 })).toEqual({
      items: ['a'],
      total: 0,
      page: 1,
      pageSize: 20,
      totalPages: 1,
    })
    expect(pagedEnvelope([], 41, { page: 2, pageSize: 20 }).totalPages).toBe(3)
  })

  it('formats a session for an e-mail in the club zone and the reader language', () => {
    expect(sessionWhenLabel(at('2026-11-03T16:00:00Z'), at('2026-11-03T17:30:00Z'), 'en-GB', 'Europe/Warsaw')).toEqual({
      date: 'Tuesday 3 November',
      time: '17:00–18:30',
    })
    expect(preheaderOf('Match\nat 11:00')).toBe('Match at 11:00')
  })

  it('formats a gathering time as a 24-hour clock in the club zone (club spec DD-43)', () => {
    expect(clockLabel(at('2026-11-03T15:15:00Z'), 'en-GB', 'Europe/Warsaw')).toBe('16:15')
    expect(clockLabel(at('2026-11-03T15:15:00Z'), 'pl', 'Europe/Warsaw')).toBe('16:15')
  })
})
