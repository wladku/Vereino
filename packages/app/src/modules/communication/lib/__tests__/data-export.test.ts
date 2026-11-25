import { describe, expect, it } from '@jest/globals'
import {
  communicationExportPart,
  personRef,
  subjectThreadIds,
  type CommunicationExportInput,
  type ExportThread,
} from '../data-export'

const SUBJECT = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const STAFF = '33333333-3333-4333-8333-333333333333'
const at = (day: number) => new Date(Date.UTC(2026, 10, day, 10, 0, 0))

function thread(overrides: Partial<ExportThread> = {}): ExportThread {
  return {
    id: 't-group',
    scopeType: 'group',
    scopeId: 'group-1',
    sectionId: 'section-1',
    groupId: 'group-1',
    subject: 'Training on Saturday',
    authorPersonId: STAFF,
    isCase: false,
    caseOpenedAt: null,
    caseOpenedByPersonId: null,
    lastMessageAt: at(3),
    createdAt: at(1),
    ...overrides,
  }
}

function input(overrides: Partial<CommunicationExportInput> = {}): CommunicationExportInput {
  return {
    personId: SUBJECT,
    threads: [
      thread(),
      thread({
        id: 't-direct',
        scopeType: 'direct',
        scopeId: OTHER,
        sectionId: undefined,
        groupId: undefined,
        authorPersonId: SUBJECT,
        isCase: true,
        caseOpenedAt: at(2),
        caseOpenedByPersonId: STAFF,
      }),
    ],
    participations: [{ id: 'p-1', threadId: 't-group', reasons: ['participant', 'guardian'], createdAt: at(1) }],
    reads: [{ id: 'r-1', threadId: 't-group', lastReadAt: at(4), createdAt: at(2), updatedAt: at(4) }],
    messages: [
      {
        id: 'm-1',
        threadId: 't-direct',
        kind: 'message',
        supersedesMessageId: null,
        actingRole: 'guardian',
        audience: 'staff',
        body: 'My child will be late',
        recipientCount: 2,
        createdAt: at(2),
      },
      {
        id: 'm-2',
        threadId: 't-direct',
        kind: 'tombstone',
        actingRole: 'guardian',
        audience: 'staff',
        recipientCount: 0,
        createdAt: at(3),
      },
    ],
    participantCounts: new Map([['t-group', 25]]),
    otherAuthorMessages: new Map([
      ['t-group', 4],
      ['t-direct', 1],
      ['t-unrelated', 99],
    ]),
    ...overrides,
  }
}

describe('personRef (DD-X03)', () => {
  it('names the subject and shows anyone else as a relation, never an id', () => {
    expect(personRef(SUBJECT, SUBJECT, 'staff')).toBe('subject')
    expect(personRef(OTHER, SUBJECT, 'staff')).toEqual({ relation: 'staff' })
  })
})

describe('subjectThreadIds', () => {
  it('joins participant, authored and written-in threads once each', () => {
    expect(subjectThreadIds([{ threadId: 'a' }, { threadId: 'b' }], ['b', 'c'], ['c', 'd', 'a'])).toEqual([
      'a',
      'b',
      'c',
      'd',
    ])
    expect(subjectThreadIds([], [], [])).toEqual([])
  })
})

describe('communicationExportPart (communication inventory row)', () => {
  const part = communicationExportPart(input())
  const byTable = Object.fromEntries(part.sections.map((section) => [section.table, section]))

  it('returns the four A4 sections in order, none portable, and no actor counts', () => {
    expect(part.sections.map((section) => section.table)).toEqual([
      'communication_threads',
      'communication_thread_participants',
      'communication_thread_reads',
      'communication_thread_messages',
    ])
    for (const section of part.sections) {
      expect(section).toMatchObject({ module: 'communication', activity: 'A4', portable: false })
    }
    expect(part.actorCounts).toEqual([])
  })

  it('shows a thread by its subject line, with other persons as relations and the other authors counted', () => {
    expect(byTable.communication_threads.reviewFields).toEqual(['subject'])
    expect(byTable.communication_threads.rows).toEqual([
      {
        id: 't-group',
        scopeType: 'group',
        scopeId: 'group-1',
        about: null,
        sectionId: 'section-1',
        groupId: 'group-1',
        subject: 'Training on Saturday',
        author: { relation: 'author' },
        isCase: false,
        caseOpenedAt: null,
        caseOpenedBy: null,
        otherAuthorMessages: 4,
        lastMessageAt: at(3).toISOString(),
        createdAt: at(1).toISOString(),
      },
      {
        id: 't-direct',
        scopeType: 'direct',
        scopeId: null,
        about: { relation: 'person_concerned' },
        sectionId: null,
        groupId: null,
        subject: 'Training on Saturday',
        author: 'subject',
        isCase: true,
        caseOpenedAt: at(2).toISOString(),
        caseOpenedBy: { relation: 'staff' },
        otherAuthorMessages: 1,
        lastMessageAt: at(3).toISOString(),
        createdAt: at(1).toISOString(),
      },
    ])
  })

  it('maps a system thread without scope, author or other messages', () => {
    const rows = communicationExportPart(
      input({
        threads: [
          thread({ id: 't-club', scopeType: 'club', scopeId: undefined, authorPersonId: null }),
          thread({ id: 't-own', scopeType: 'direct', scopeId: SUBJECT }),
          thread({ id: 't-staff', scopeType: 'direct', scopeId: null }),
        ],
        otherAuthorMessages: new Map(),
      }),
    ).sections[0].rows
    expect(rows.map((row) => [row.scopeId, row.about, row.author, row.otherAuthorMessages])).toEqual([
      [null, null, null, 0],
      [null, 'subject', { relation: 'author' }, 0],
      [null, null, { relation: 'author' }, 0],
    ])
  })

  it("shows the subject's own participation with the other participants as a count", () => {
    expect(byTable.communication_thread_participants.rows).toEqual([
      {
        id: 'p-1',
        threadId: 't-group',
        reasons: ['participant', 'guardian'],
        joinedAt: at(1).toISOString(),
        otherParticipants: 24,
      },
    ])
    const alone = communicationExportPart(input({ participantCounts: new Map() })).sections[1].rows
    expect(alone[0].otherParticipants).toBe(0)
  })

  it("shows the subject's own read markers", () => {
    expect(byTable.communication_thread_reads.rows).toEqual([
      {
        id: 'r-1',
        threadId: 't-group',
        lastReadAt: at(4).toISOString(),
        createdAt: at(2).toISOString(),
        updatedAt: at(4).toISOString(),
      },
    ])
  })

  it("shows only the subject's messages and counts the left-out ones of the subject's threads", () => {
    const messages = byTable.communication_thread_messages
    expect(messages.reviewFields).toEqual(['body'])
    expect(messages.omittedOtherAuthors).toBe(5)
    expect(messages.rows).toEqual([
      {
        id: 'm-1',
        threadId: 't-direct',
        kind: 'message',
        supersedesMessageId: null,
        actingRole: 'guardian',
        audience: 'staff',
        body: 'My child will be late',
        recipientCount: 2,
        createdAt: at(2).toISOString(),
      },
      {
        id: 'm-2',
        threadId: 't-direct',
        kind: 'tombstone',
        supersedesMessageId: null,
        actingRole: 'guardian',
        audience: 'staff',
        body: null,
        recipientCount: 0,
        createdAt: at(3).toISOString(),
      },
    ])
  })

  it('returns every section, empty, for a person with no communication', () => {
    const empty = communicationExportPart({
      personId: SUBJECT,
      threads: [],
      participations: [],
      reads: [],
      messages: [],
      participantCounts: new Map(),
      otherAuthorMessages: new Map(),
    })
    expect(empty.sections.map((section) => section.rows)).toEqual([[], [], [], []])
    expect(empty.sections[3].omittedOtherAuthors).toBe(0)
  })

  it('carries no other person id and no hash or token key', () => {
    const text = JSON.stringify(part)
    expect(text).not.toContain(OTHER)
    expect(text).not.toContain(STAFF)
    for (const section of part.sections) {
      for (const row of section.rows) {
        for (const key of Object.keys(row)) expect(key).not.toMatch(/hash$|token|secret|params/i)
      }
    }
  })
})
