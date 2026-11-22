// The `communication` part of the person data export (person data export spec
// `.ai/specs/implemented/2026-11-21-vereino-person-data-export.md`, *Contributor inventory* → `communication`, DD-X03, DD-X06;
// #527): pure mapping of the rows `services/data-export-contribution.ts` reads into the four A4 sections. The threads
// the subject takes part in show their subject line only; the subject's own participant row shows the other
// participants as a count; the subject's own read markers; and only the messages the subject wrote — other authors'
// messages are counted per thread (`otherAuthorMessages`) and in total (`omittedOtherAuthors`), never shown. Another
// person never appears by id: a thread's author, the case opener and the person a direct thread is about are a
// relation (`subject` when it is the subject). No column here is a hash or a token.
import type { DataExportPart, DataExportRow } from '../../people/services/data-export'

export const COMMUNICATION_EXPORT_MODULE = 'communication' as const
/** RoPA activity *Communication* (`docs/compliance/ropa.md`). */
export const COMMUNICATION_EXPORT_ACTIVITY = 'A4' as const

export type ExportThread = {
  id: string
  scopeType: string
  scopeId?: string | null
  sectionId?: string | null
  groupId?: string | null
  /** Decrypted. */
  subject: string
  authorPersonId?: string | null
  isCase: boolean
  caseOpenedAt?: Date | null
  caseOpenedByPersonId?: string | null
  lastMessageAt: Date
  createdAt: Date
}

export type ExportParticipation = { id: string; threadId: string; reasons: readonly string[]; createdAt: Date }

export type ExportRead = { id: string; threadId: string; lastReadAt: Date; createdAt: Date; updatedAt: Date }

export type ExportMessage = {
  id: string
  threadId: string
  kind: string
  supersedesMessageId?: string | null
  actingRole: string
  audience: string
  /** Decrypted; null on a tombstone. */
  body?: string | null
  recipientCount: number
  createdAt: Date
}

export type CommunicationExportInput = {
  personId: string
  threads: readonly ExportThread[]
  participations: readonly ExportParticipation[]
  reads: readonly ExportRead[]
  /** Only the messages the subject wrote. */
  messages: readonly ExportMessage[]
  /** Per thread: every participant, the subject included. */
  participantCounts: ReadonlyMap<string, number>
  /** Per thread: messages not written by the subject (other persons and the system). */
  otherAuthorMessages: ReadonlyMap<string, number>
}

/** The subject, or another person as a relation only (never an id, never a name: no `communication` link is named). */
export function personRef(personId: string, subjectId: string, relation: string): 'subject' | { relation: string } {
  return personId === subjectId ? 'subject' : { relation }
}

function optionalRef(
  personId: string | null | undefined,
  subjectId: string,
  relation: string,
): 'subject' | { relation: string } | null {
  return personId ? personRef(personId, subjectId, relation) : null
}

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null
}

/** The ids of the threads the subject takes part in: participant, thread author or message author. */
export function subjectThreadIds(
  participations: readonly Pick<ExportParticipation, 'threadId'>[],
  authoredThreadIds: readonly string[],
  messageThreadIds: readonly string[],
): string[] {
  return [...new Set([...participations.map((row) => row.threadId), ...authoredThreadIds, ...messageThreadIds])]
}

function threadRow(thread: ExportThread, input: CommunicationExportInput): DataExportRow {
  const direct = thread.scopeType === 'direct'
  return {
    id: thread.id,
    scopeType: thread.scopeType,
    // A direct thread's scope is the person it is about: shown as a relation, never as the id.
    scopeId: direct ? null : (thread.scopeId ?? null),
    about: direct ? optionalRef(thread.scopeId, input.personId, 'person_concerned') : null,
    sectionId: thread.sectionId ?? null,
    groupId: thread.groupId ?? null,
    subject: thread.subject,
    author: optionalRef(thread.authorPersonId, input.personId, 'author'),
    isCase: thread.isCase,
    caseOpenedAt: iso(thread.caseOpenedAt),
    caseOpenedBy: optionalRef(thread.caseOpenedByPersonId, input.personId, 'staff'),
    otherAuthorMessages: input.otherAuthorMessages.get(thread.id) ?? 0,
    lastMessageAt: iso(thread.lastMessageAt),
    createdAt: iso(thread.createdAt),
  }
}

/** The four `communication` sections (A4, none portable: J-X02 lists no message data) and no actor counts. */
export function communicationExportPart(input: CommunicationExportInput): DataExportPart {
  const section = { module: COMMUNICATION_EXPORT_MODULE, activity: COMMUNICATION_EXPORT_ACTIVITY, portable: false }
  const omittedOtherAuthors = input.threads.reduce(
    (sum, thread) => sum + (input.otherAuthorMessages.get(thread.id) ?? 0),
    0,
  )
  return {
    sections: [
      {
        ...section,
        table: 'communication_threads',
        reviewFields: ['subject'],
        rows: input.threads.map((thread) => threadRow(thread, input)),
      },
      {
        ...section,
        table: 'communication_thread_participants',
        rows: input.participations.map((row) => ({
          id: row.id,
          threadId: row.threadId,
          reasons: [...row.reasons],
          joinedAt: iso(row.createdAt),
          otherParticipants: Math.max((input.participantCounts.get(row.threadId) ?? 1) - 1, 0),
        })),
      },
      {
        ...section,
        table: 'communication_thread_reads',
        rows: input.reads.map((row) => ({
          id: row.id,
          threadId: row.threadId,
          lastReadAt: iso(row.lastReadAt),
          createdAt: iso(row.createdAt),
          updatedAt: iso(row.updatedAt),
        })),
      },
      {
        ...section,
        table: 'communication_thread_messages',
        reviewFields: ['body'],
        omittedOtherAuthors,
        rows: input.messages.map((row) => ({
          id: row.id,
          threadId: row.threadId,
          kind: row.kind,
          supersedesMessageId: row.supersedesMessageId ?? null,
          actingRole: row.actingRole,
          audience: row.audience,
          body: row.body ?? null,
          recipientCount: row.recipientCount,
          createdAt: iso(row.createdAt),
        })),
      },
    ],
    actorCounts: [],
  }
}
