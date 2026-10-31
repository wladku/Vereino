// `activities.attendance.mark` (club spec glossary *Actual attendance*, API row `PUT
// /api/activities/occurrences/{id}/attendance`; REQ-007, REQ-008; R11, D-026; TEST-009, TEST-011; #33):
// - the coach of the session's group, the session's assigned coach, the coordinator of the section or the club
//   administrator checks off `present` / `absent` / `late` (or clears a mark) for the persons on the list — the group's
//   participants on the session date and anyone with an attendance row — from the session's start until it is closed;
// - each changed row records who marked it and in which role; a row the coach did not change keeps its marker;
// - the whole list is saved against the session version (`updatedAt`): every save moves it, so a second coach with a
//   stale list gets 409 instead of overwriting the first;
// - `complete` closes the session (`planned → done`); a cancelled or done session answers 409.
import type { EntityManager } from '@mikro-orm/postgresql'
import { registerCommand, type CommandHandler, type CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { enforceCommandOptimisticLock } from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { z } from 'zod'
import type { ActingRole, GrantKind, ScopeTarget } from '@vereino/core'
import { assertTransition, authorizeScoped, type TargetLock } from '@/modules/foundation'
import { activitiesErrors } from '../api/errors'
import { Attendance, Occurrence } from '../data/entities'
import { attendanceMarkSchema } from '../data/validators'
import { sessionTransitions } from '../lib/activities-rules'
import { checkOffWindow } from '../lib/policy'
import { rosterOn } from '../services/directory'
import { attendanceSnapshot, restoreAttendance, type AttendanceSnapshot } from './attendance'
import { OCCURRENCE_RESOURCE_KIND, occurrenceSnapshot, type OccurrenceSnapshot } from './occurrences'
import {
  COACH_KINDS,
  activitiesLog,
  emitAfterCommit,
  inWriteTransaction,
  scheduleTarget,
  selfPersonId,
  trustedTenantId,
  type ActivitiesCommandResult,
} from './shared'

/**
 * Who checks off: a coach of the group, the coordinator, the administrator — and the session's assigned coach (a
 * re-staffed session), matched through their own person (`self` on the target's `personId`), least-privileged last.
 */
export const CHECK_OFF_KINDS: readonly GrantKind[] = [...COACH_KINDS, 'self']

/** The scope target of a check-off: the session (its section, group and id) and its assigned coach. */
export function checkOffTarget(occurrence: Occurrence): ScopeTarget {
  return { ...scheduleTarget(occurrence, occurrence.id), personId: occurrence.coachPersonId ?? null }
}

/** The role recorded on the rows: the assigned coach matched through `self` marks as a coach. */
export function checkOffRole(actingRole: ActingRole): ActingRole {
  return actingRole === 'self' ? 'coach' : actingRole
}

/** The session and the rows a check-off changed, before or after it. */
export type CheckOffSnapshot = {
  occurrence: OccurrenceSnapshot
  /** The session version; an undo refuses (409) when the session changed since the check-off. */
  occurrenceUpdatedAt: string
  attendances: AttendanceSnapshot[]
  /** Rows the check-off created (an undo removes them). */
  createdIds: string[]
}

export type CheckOffCommandResult = ActivitiesCommandResult<Occurrence, CheckOffSnapshot> & {
  after: CheckOffSnapshot
  /** The persons whose actual attendance changed. */
  changedPersonIds: string[]
  completed: boolean
}

function loadOccurrence(ctx: CommandRuntimeContext) {
  return (em: EntityManager, id: string, lock: TargetLock): Promise<Occurrence | null> => {
    const tenantId = trustedTenantId(ctx)
    if (!tenantId) return Promise.resolve(null)
    return em.findOne(Occurrence, { id, tenantId, deletedAt: null }, lock)
  }
}

/** The persons on the list: the group's participants on the session date and anyone with a live attendance row. */
export async function listedPersonIds(
  ctx: CommandRuntimeContext,
  em: EntityManager,
  occurrence: Occurrence,
  rows: readonly Attendance[],
): Promise<{ rosterIds: string[]; listed: Set<string> }> {
  const scope = { tenantId: occurrence.tenantId, organizationId: occurrence.organizationId }
  const roster = await rosterOn(ctx.container, scope, occurrence.groupId, occurrence.occurrenceDate, em)
  const rosterIds = [...new Set(roster.filter((member) => member.role === 'participant').map((m) => m.personId))]
  return { rosterIds, listed: new Set([...rosterIds, ...rows.map((row) => row.personId)]) }
}

async function emitMarked(
  occurrence: Occurrence,
  personIds: string[],
  actingRole: ActingRole,
  completed: boolean,
  actorUserId: string | null,
  undo = false,
): Promise<void> {
  const scope = { tenantId: occurrence.tenantId, organizationId: occurrence.organizationId }
  await emitAfterCommit('activities.attendance.marked', scope, {
    occurrenceId: occurrence.id,
    personIds,
    actingRole,
    completed,
    actorUserId,
    undo,
  })
}

const markCommand: CommandHandler<Record<string, unknown>, CheckOffCommandResult> = {
  id: 'activities.attendance.mark',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const now = new Date()
    const result = await inWriteTransaction(ctx, 'activities.attendance.mark', async (em) => {
      const load = loadOccurrence(ctx)
      // The default lock compares the session version the client sent with the locked row (409 when stale).
      const authorized = await authorizeScoped(
        {
          input: attendanceMarkSchema,
          resourceKind: OCCURRENCE_RESOURCE_KIND,
          allowedKinds: CHECK_OFF_KINDS,
          loadTarget: (parsed, txEm, lock) => load(txEm, parsed.id, lock),
          resolveTarget: (_parsed, entity) => checkOffTarget(entity as Occurrence),
        },
        rawInput,
        ctx,
        em,
      )
      const occurrence = authorized.entity as Occurrence
      const { parsed } = authorized
      const actingRole = checkOffRole(authorized.actingRole)
      const window = checkOffWindow(occurrence, now)
      if (window === 'not_planned')
        await activitiesErrors.throw('occurrence_not_planned', { status: occurrence.status })
      if (window === 'not_started') await activitiesErrors.throw('attendance_not_started')
      const scope = { tenantId: occurrence.tenantId, organizationId: occurrence.organizationId }
      const rows = await em.find(Attendance, { ...scope, occurrenceId: occurrence.id, deletedAt: null })
      const byPerson = new Map(rows.map((row) => [row.personId, row]))
      const { listed } = await listedPersonIds(ctx, em, occurrence, rows)
      for (const entry of parsed.entries) {
        if (!listed.has(entry.personId)) {
          await activitiesErrors.throw('attendance_person_not_listed', { personId: entry.personId })
        }
      }

      const before: CheckOffSnapshot = {
        occurrence: occurrenceSnapshot(occurrence),
        occurrenceUpdatedAt: occurrence.updatedAt.toISOString(),
        attendances: [],
        createdIds: [],
      }
      const markerId = selfPersonId(authorized.scope)
      const changed: Attendance[] = []
      const created: Attendance[] = []
      for (const entry of parsed.entries) {
        const existing = byPerson.get(entry.personId)
        // An unchanged mark keeps who made it; clearing a mark nobody made writes nothing.
        if ((existing?.actual ?? null) === entry.actual) continue
        if (existing) before.attendances.push(attendanceSnapshot(existing))
        const row =
          existing ??
          em.create(Attendance, {
            ...scope,
            occurrenceId: occurrence.id,
            personId: entry.personId,
            declared: 'unknown',
            declarationStatus: 'final',
            source: 'staff',
          })
        if (!existing) created.push(row)
        row.actual = entry.actual
        row.markedByPersonId = entry.actual === null ? null : markerId
        row.markedAsRole = entry.actual === null ? null : actingRole
        row.updatedAt = now
        em.persist(row)
        changed.push(row)
      }
      const completed = parsed.complete === true
      if (completed) {
        await assertTransition(sessionTransitions, occurrence.status, 'done')
        occurrence.status = 'done'
      }
      // The session version moves with every save, so the next stale list answers 409.
      occurrence.updatedAt = now
      await em.flush()
      // Ids of created rows exist after the flush.
      before.createdIds = created.map((row) => row.id)
      const after: CheckOffSnapshot = {
        occurrence: occurrenceSnapshot(occurrence),
        occurrenceUpdatedAt: occurrence.updatedAt.toISOString(),
        attendances: changed.map(attendanceSnapshot),
        createdIds: before.createdIds,
      }
      return {
        entity: occurrence,
        actingRole,
        before,
        after,
        changedPersonIds: changed.map((row) => row.personId),
        completed,
      }
    })
    const occurrence = result.entity
    const actorUserId = ctx.auth?.sub ?? null
    await emitMarked(occurrence, result.changedPersonIds, result.actingRole, result.completed, actorUserId)
    if (result.completed) {
      await emitAfterCommit(
        'activities.occurrence.completed',
        { tenantId: occurrence.tenantId, organizationId: occurrence.organizationId },
        { id: occurrence.id, activityId: occurrence.activityId, groupId: occurrence.groupId, actorUserId },
      )
    }
    return result
  },
  buildLog: ({ result }) =>
    activitiesLog({
      result,
      resourceKind: OCCURRENCE_RESOURCE_KIND,
      labelKey: 'activities.audit.attendance.mark',
      fallback: 'Check off attendance',
      after: result.after,
      parent: { resourceKind: 'activities.activity', resourceId: result.entity.activityId },
      context: { changed: result.changedPersonIds.length, completed: result.completed },
    }),
  async authorizeReplay({ ctx, logEntry }) {
    await authorizeCheckOffReplay(ctx, logEntry.resourceId)
  },
  async undo({ ctx, logEntry }) {
    const { occurrence, actingRole } = await authorizeCheckOffReplay(ctx, logEntry.resourceId)
    const em = ctx.transactionalEm as EntityManager
    const before = logEntry.snapshotBefore as CheckOffSnapshot | null | undefined
    const after = logEntry.snapshotAfter as CheckOffSnapshot | null | undefined
    if (!before || !after) throw new Error('[internal] missing check-off snapshots for undo')
    // Only the last save of the list is undone: a later save or a change of the session wins (409).
    enforceCommandOptimisticLock({
      resourceKind: OCCURRENCE_RESOURCE_KIND,
      resourceId: occurrence.id,
      current: occurrence.updatedAt,
      expected: after.occurrenceUpdatedAt,
    })
    const scope = { tenantId: occurrence.tenantId, organizationId: occurrence.organizationId }
    const now = new Date()
    const ids = [...before.attendances.map((row) => row.id), ...before.createdIds]
    const rows = ids.length > 0 ? await em.find(Attendance, { ...scope, id: { $in: ids } }) : []
    const byId = new Map(rows.map((row) => [row.id, row]))
    for (const snapshot of before.attendances) {
      const row = byId.get(snapshot.id)
      if (!row) throw new Error('[internal] a checked-off row is missing for undo: ' + snapshot.id)
      restoreAttendance(row, snapshot)
      row.updatedAt = now
    }
    for (const id of before.createdIds) {
      const row = byId.get(id)
      if (row) {
        row.deletedAt = now
        row.updatedAt = now
      }
    }
    const reopened = occurrence.status !== before.occurrence.status
    if (reopened) {
      await assertTransition(sessionTransitions, occurrence.status, before.occurrence.status)
      occurrence.status = before.occurrence.status
    }
    occurrence.updatedAt = now
    await em.flush()
    const personIds = after.attendances.map((row) => row.personId)
    await emitMarked(occurrence, personIds, actingRole, false, ctx.auth?.sub ?? null, true)
    if (reopened) {
      await emitAfterCommit('activities.occurrence.updated', scope, {
        id: occurrence.id,
        activityId: occurrence.activityId,
      })
    }
  },
}

/** The undo of a check-off is authorized like the check-off, through the session. */
async function authorizeCheckOffReplay(
  ctx: CommandRuntimeContext,
  id: string | null | undefined,
): Promise<{ occurrence: Occurrence; actingRole: ActingRole }> {
  const em = ctx.transactionalEm
  if (!em || !id) throw new Error('[internal] check-off replay needs the replay transaction and the id')
  const load = loadOccurrence(ctx)
  const authorized = await authorizeScoped(
    {
      input: z.object({ id: z.uuid() }),
      resourceKind: OCCURRENCE_RESOURCE_KIND,
      allowedKinds: CHECK_OFF_KINDS,
      loadTarget: (parsed, txEm, lock) => load(txEm, parsed.id, lock),
      resolveTarget: (_parsed, entity) => checkOffTarget(entity as Occurrence),
    },
    { id },
    ctx,
    em,
    { mode: 'replay' },
  )
  return { occurrence: authorized.entity as Occurrence, actingRole: checkOffRole(authorized.actingRole) }
}

registerCommand(markCommand)
