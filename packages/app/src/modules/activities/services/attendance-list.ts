// The coach's attendance list behind `GET /api/activities/occurrences/{id}/attendance` (club spec UI row
// `/club/occurrences/[id]/attendance`, glossary *Actual attendance*; R11, D-026; AC-007; #33): the group's participants
// on the session date and anyone with an attendance row, each with what the declarations say (per the kind: expected or
// absent under `absence_only`, confirmed, declined or unanswered under `confirm`), the actual attendance and who marked
// it in which role, plus the summary line and whether the check-off is open. Read by the same grants that check off: a
// coach of another group gets 403 `scope_denied`, an unknown session 404.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import type { ActingRole } from '@vereino/core'
import { assertInScope, scopeContract } from '@/modules/foundation'
import { CHECK_OFF_KINDS, checkOffRole, checkOffTarget, listedPersonIds } from '../commands/check-off'
import { Attendance, Occurrence } from '../data/entities'
import {
  checkOffWindow,
  declarationSummary,
  expectationOf,
  type ActualAttendance,
  type CheckOffWindow,
  type Declared,
  type DeclarationKind,
  type DeclarationStatus,
  type DeclarationSummary,
  type Expectation,
} from '../lib/policy'
import { activityOf, describeOccurrence, type CalendarOccurrenceView } from './calendar'
import { attendanceSettings, findPersons, type ActivitiesScope } from './directory'

export type AttendanceListRow = {
  personId: string
  firstName: string | null
  lastName: string | null
  /** A participant of the group on the session date (others are on the list through their attendance row). */
  onRoster: boolean
  declared: Declared | null
  declarationStatus: DeclarationStatus | null
  expectation: Expectation
  actual: ActualAttendance | null
  markedByPersonId: string | null
  markedByName: string | null
  markedAsRole: string | null
}

export type AttendanceList = {
  occurrence: CalendarOccurrenceView
  declarationKind: DeclarationKind
  summary: DeclarationSummary
  /** `open` from the start until the session is closed; `not_started` before; `not_planned` when cancelled or done. */
  checkOff: CheckOffWindow
  /** The role the caller checks off in. */
  actingRole: ActingRole
  timeZone: string
  rows: AttendanceListRow[]
}

function fullName(person: { firstName: string; lastName: string } | undefined): string | null {
  return person ? `${person.firstName} ${person.lastName}`.trim() : null
}

/** The list for one session, or null when the session does not exist in the organization. */
export async function readAttendanceList(
  ctx: CommandRuntimeContext,
  scope: ActivitiesScope,
  id: string,
  now: Date = new Date(),
): Promise<AttendanceList | null> {
  const em = ctx.container.resolve<EntityManager>('em').fork()
  const occurrence = await em.findOne(Occurrence, { id, ...scope, deletedAt: null })
  if (!occurrence) return null
  const grants = await scopeContract.resolve(ctx)
  const actingRole = checkOffRole(await assertInScope(grants, CHECK_OFF_KINDS, checkOffTarget(occurrence)))
  const attendances = await em.find(Attendance, { ...scope, occurrenceId: occurrence.id, deletedAt: null })
  const byPerson = new Map(attendances.map((row) => [row.personId, row]))
  const { rosterIds, listed } = await listedPersonIds(ctx, em, occurrence, attendances)
  const markerIds = attendances.flatMap((row) => (row.markedByPersonId ? [row.markedByPersonId] : []))
  const [persons, view, settings, activity] = await Promise.all([
    findPersons(ctx.container, scope, [...new Set([...listed, ...markerIds])], em),
    describeOccurrence(ctx, scope, occurrence),
    attendanceSettings(ctx.container, scope),
    activityOf(em, scope, occurrence.activityId),
  ])
  const kind = settings.declarationKinds[activity?.type ?? 'other'] ?? 'confirm'
  const roster = new Set(rosterIds)
  const rows = [...listed].map((personId): AttendanceListRow => {
    const person = persons.get(personId)
    const row = byPerson.get(personId)
    return {
      personId,
      firstName: person?.firstName ?? null,
      lastName: person?.lastName ?? null,
      onRoster: roster.has(personId),
      declared: row?.declared ?? null,
      declarationStatus: row?.declarationStatus ?? null,
      expectation: expectationOf(kind, row),
      actual: row?.actual ?? null,
      markedByPersonId: row?.markedByPersonId ?? null,
      markedByName: row?.markedByPersonId ? fullName(persons.get(row.markedByPersonId)) : null,
      markedAsRole: row?.markedAsRole ?? null,
    }
  })
  rows.sort(
    (a, b) =>
      (a.lastName ?? '').localeCompare(b.lastName ?? '') ||
      (a.firstName ?? '').localeCompare(b.firstName ?? '') ||
      a.personId.localeCompare(b.personId),
  )
  return {
    occurrence: view,
    declarationKind: kind,
    summary: declarationSummary(kind, rosterIds, attendances),
    checkOff: checkOffWindow(occurrence, now),
    actingRole,
    timeZone: settings.timeZone,
    rows,
  }
}
