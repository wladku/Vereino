// The `activities` part of the person data export (person data export spec
// `.ai/specs/implemented/2026-11-21-vereino-person-data-export.md`, *Contributor inventory* → `activities`, DD-X03, DD-X06; #527):
// pure mapping of the rows `services/data-export-contribution.ts` reads into the four sections and the actor counts.
// - `activities_attendances` (A3): the subject's own attendance rows; the session's coach by relation and name (a
//   named relation), the declarer and the marker by relation only;
// - `activities_declaration_tokens` (A3): the declaration links sent to the subject, purpose and dates only — never the
//   token hash;
// - `activities_contact_access_log` (A10): the reads that returned the subject's contacts — the date, the purpose, the
//   session and the reader's acting role, never the reader's id or name nor the other persons read;
// - `activities_substitution_entries` (A3): the entries where the subject is the previous or the new coach; the other
//   coach and the decider by relation only, the decrypted `reason` named in `reviewFields` (it may hold health data).
// Rows where the subject only acted as staff are counted (DD-X06). None of the sections is portable: J-X02 lists no
// attendance or session data.
import type { DataExportPart, DataExportRow } from '../../people/services/data-export'

export const ACTIVITIES_EXPORT_MODULE = 'activities' as const
/** RoPA activity *Groups, sessions and attendance* (`docs/compliance/ropa.md`). */
export const ACTIVITIES_EXPORT_ACTIVITY = 'A3' as const
/** RoPA activity *Contact access log* (`docs/compliance/ropa.md`). */
export const CONTACT_ACCESS_EXPORT_ACTIVITY = 'A10' as const
/** What a declaration link is for: the table stores no purpose, every link declares attendance (REQ-017). */
export const DECLARATION_LINK_PURPOSE = 'attendance_declaration' as const

/** The session a row belongs to, as the file shows it (club record ids, the date and the coach id to redact). */
export type ExportSession = {
  id: string
  activityId: string
  groupId: string
  occurrenceDate: string
  startAt: Date
  coachPersonId?: string | null
}

export type ExportAttendance = {
  id: string
  occurrenceId: string
  declared: string
  declaredByPersonId?: string | null
  declaredAt?: Date | null
  declarationStatus: string
  guardianDecidedAt?: Date | null
  pendingUntil?: Date | null
  timeoutOutcome?: string | null
  actual?: string | null
  markedByPersonId?: string | null
  markedAsRole?: string | null
  source: string
  createdAt: Date
  updatedAt: Date
}

export type ExportDeclarationToken = {
  id: string
  occurrenceId: string
  expiresAt: Date
  usedCount: number
  lastUsedAt?: Date | null
  createdAt: Date
}

export type ExportContactRead = {
  id: string
  occurrenceId: string
  actingRole: string
  resourceKind: string
  purpose: string
  createdAt: Date
}

export type ExportSubstitution = {
  id: string
  occurrenceId: string
  previousCoachPersonId?: string | null
  newCoachPersonId?: string | null
  kind: string
  /** Decrypted. */
  reason?: string | null
  decidedByPersonId: string
  actingRole: string
  createdAt: Date
}

/** Rows where the subject only acted as staff (DD-X06). */
export type ActivitiesActorCounts = {
  /** Sessions whose coach is the subject. */
  sessionsCoached: number
  /** Activities whose default coach is the subject. */
  defaultCoachActivities: number
  /** Other persons' attendance rows the subject marked. */
  attendanceMarked: number
  /** Substitution entries the subject decided without being their previous or new coach. */
  substitutionsDecided: number
  /** Contact reads by the subject's account. */
  contactReads: number
}

export type ActivitiesExportInput = {
  personId: string
  attendances: readonly ExportAttendance[]
  tokens: readonly ExportDeclarationToken[]
  contactReads: readonly ExportContactRead[]
  substitutions: readonly ExportSubstitution[]
  /** The live sessions the rows above point at, by id (a deleted session is absent). */
  sessions: ReadonlyMap<string, ExportSession>
  /** Display names of the coaches of the sessions the subject attended, by person id. */
  coachNames: ReadonlyMap<string, string>
  counts: ActivitiesActorCounts
}

type PersonRef = 'subject' | { relation: string; name?: string }

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null
}

/** The subject, or another person by relation, with the name only when one is given (art. 15(4), DD-X03). */
function ref(
  personId: string | null | undefined,
  subjectId: string,
  relation: string,
  name?: string,
): PersonRef | null {
  if (!personId) return null
  if (personId === subjectId) return 'subject'
  const trimmed = name?.trim()
  return trimmed ? { relation, name: trimmed } : { relation }
}

/** The session columns a row carries: club record ids and the date, never a person id. */
function sessionColumns(session: ExportSession | undefined): DataExportRow {
  return {
    activityId: session?.activityId ?? null,
    groupId: session?.groupId ?? null,
    occurrenceDate: session?.occurrenceDate ?? null,
    startAt: iso(session?.startAt),
  }
}

/** The ids of the persons whose names the file may show: the coaches of the sessions the subject attended. */
export function attendedCoachIds(
  personId: string,
  attendances: readonly Pick<ExportAttendance, 'occurrenceId'>[],
  sessions: ReadonlyMap<string, Pick<ExportSession, 'coachPersonId'>>,
): string[] {
  const ids = attendances.flatMap((row) => {
    const coach = sessions.get(row.occurrenceId)?.coachPersonId
    return coach && coach !== personId ? [coach] : []
  })
  return [...new Set(ids)]
}

/** The ids of every session the rows point at. */
export function exportSessionIds(rows: readonly { occurrenceId: string }[]): string[] {
  return [...new Set(rows.map((row) => row.occurrenceId))]
}

function attendanceRow(row: ExportAttendance, input: ActivitiesExportInput): DataExportRow {
  const session = input.sessions.get(row.occurrenceId)
  const coachId = session?.coachPersonId
  return {
    id: row.id,
    occurrenceId: row.occurrenceId,
    ...sessionColumns(session),
    coach: ref(coachId, input.personId, 'coach', coachId ? input.coachNames.get(coachId) : undefined),
    declared: row.declared,
    // A declaration for the subject by someone else: a staff member (`source: staff`) or a guardian.
    declaredBy: ref(row.declaredByPersonId, input.personId, row.source === 'staff' ? 'staff' : 'guardian'),
    declaredAt: iso(row.declaredAt),
    declarationStatus: row.declarationStatus,
    guardianDecidedAt: iso(row.guardianDecidedAt),
    pendingUntil: iso(row.pendingUntil),
    timeoutOutcome: row.timeoutOutcome ?? null,
    actual: row.actual ?? null,
    markedBy: ref(row.markedByPersonId, input.personId, 'staff'),
    markedAsRole: row.markedAsRole ?? null,
    source: row.source,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  }
}

function substitutionRow(row: ExportSubstitution, input: ActivitiesExportInput): DataExportRow {
  const asPrevious = row.previousCoachPersonId === input.personId
  return {
    id: row.id,
    occurrenceId: row.occurrenceId,
    ...sessionColumns(input.sessions.get(row.occurrenceId)),
    role: asPrevious ? 'previous_coach' : 'new_coach',
    kind: row.kind,
    previousCoach: ref(row.previousCoachPersonId, input.personId, 'coach'),
    newCoach: ref(row.newCoachPersonId, input.personId, 'coach'),
    decidedBy: ref(row.decidedByPersonId, input.personId, 'staff'),
    actingRole: row.actingRole,
    reason: row.reason ?? null,
    createdAt: iso(row.createdAt),
  }
}

/** The four `activities` sections (none portable) and the actor counts of five tables. */
export function activitiesExportPart(input: ActivitiesExportInput): DataExportPart {
  const section = { module: ACTIVITIES_EXPORT_MODULE, portable: false }
  const count = (table: string, value: number) => ({ module: ACTIVITIES_EXPORT_MODULE, table, count: value })
  return {
    sections: [
      {
        ...section,
        table: 'activities_attendances',
        activity: ACTIVITIES_EXPORT_ACTIVITY,
        rows: input.attendances.map((row) => attendanceRow(row, input)),
      },
      {
        ...section,
        table: 'activities_declaration_tokens',
        activity: ACTIVITIES_EXPORT_ACTIVITY,
        rows: input.tokens.map((row) => ({
          id: row.id,
          purpose: DECLARATION_LINK_PURPOSE,
          occurrenceId: row.occurrenceId,
          ...sessionColumns(input.sessions.get(row.occurrenceId)),
          createdAt: iso(row.createdAt),
          expiresAt: iso(row.expiresAt),
          usedCount: row.usedCount,
          lastUsedAt: iso(row.lastUsedAt),
        })),
      },
      {
        ...section,
        table: 'activities_contact_access_log',
        activity: CONTACT_ACCESS_EXPORT_ACTIVITY,
        rows: input.contactReads.map((row) => ({
          id: row.id,
          readAt: iso(row.createdAt),
          purpose: row.purpose,
          resourceKind: row.resourceKind,
          occurrenceId: row.occurrenceId,
          ...sessionColumns(input.sessions.get(row.occurrenceId)),
          // The reader as a role label only: no user id, no name (art. 15(1)(c) recipients).
          reader: { relation: 'staff', actingRole: row.actingRole },
        })),
      },
      {
        ...section,
        table: 'activities_substitution_entries',
        activity: ACTIVITIES_EXPORT_ACTIVITY,
        reviewFields: ['reason'],
        rows: input.substitutions.map((row) => substitutionRow(row, input)),
      },
    ],
    actorCounts: [
      count('activities_occurrences', input.counts.sessionsCoached),
      count('activities_activities', input.counts.defaultCoachActivities),
      count('activities_attendances', input.counts.attendanceMarked),
      count('activities_substitution_entries', input.counts.substitutionsDecided),
      count('activities_contact_access_log', input.counts.contactReads),
    ],
  }
}
