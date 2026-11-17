// `activities.occurrences.update` and `activities.occurrences.cancel` (club spec glossary *Session*, *Session
// cancellation*, *Session conflict*; DD-10; foundation II DD-G03, DD-G04; #31):
// - moving or re-staffing one planned session detaches it from its series (`is_detached`), so a later series change
//   never touches it; the move is refused when it overbooks the place tree or the coach (409 with the list) — by the
//   coordinator of the session's section or the club administrator, and by a coach of the group for the session of a
//   one-off event (REQ-A08, DD-A05; a session of a series answers 403 `coach_edit_series_session`). The session of a
//   one-off event may move to a typed venue and back (422 `venue_requires_one_off` for a series session);
// - cancelling a planned session with a reason (`planned → cancelled`; a cancelled or done session answers 409
//   `invalid_transition`) — also by a coach of the session's group; `activities.occurrence.cancelled` after commit
//   sends the in-app notice (`subscribers/notify-occurrence-cancelled.ts`). Where the club setting `coach_may_cancel`
//   is off (#199), a coach cancels only through a coordinator or administrator grant they also hold; otherwise 403
//   `coach_cancel_disabled`;
// - restoring a cancelled session that has not ended (`cancelled → planned`) — by the club administrator only (#268).
import type { EntityManager } from '@mikro-orm/postgresql'
import { registerCommand, type CommandHandler, type CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { z } from 'zod'
import type { AwilixContainer } from 'awilix'
import { findActingRole, type ActingRole, type GrantKind, type Scope } from '@vereino/core'
import { assertTransition, authorizeScoped, type TargetLock } from '@/modules/foundation'
import { activitiesErrors } from '../api/errors'
import { Activity, Occurrence } from '../data/entities'
import { lockSchedule } from '../data/queries'
import { occurrenceCancelSchema, occurrenceRestoreSchema, occurrenceUpdateSchema } from '../data/validators'
import { permittedCancelRole, sessionTransitions, type OccurrenceStatus } from '../lib/activities-rules'
import { attendanceSettings, coachMayCancel } from '../services/directory'
import { nextConfirmByMinutes } from '../lib/confirm-by'
import { gatheringOffset } from '../lib/gathering'
import { chooseLocation, storedVenue } from '../lib/venue'
import { sessionChangeOf, type SessionChange, type SessionFacts } from '../lib/session-change'
import { assertNoConflicts, findConflicts } from '../services/schedule'
import {
  COACH_KINDS,
  PLAN_KINDS,
  activitiesLog,
  assertReferences,
  emitAfterCommit,
  inWriteTransaction,
  scheduleTarget,
  selfPersonId,
  trustedTenantId,
  type ActivitiesCommandResult,
} from './shared'

export const OCCURRENCE_RESOURCE_KIND = 'activities.occurrence'

export type OccurrenceSnapshot = {
  id: string
  tenantId: string
  organizationId: string
  activityId: string
  occurrenceDate: string
  startAt: string
  endAt: string
  /** Null at a typed venue (REQ-A08). */
  placeId: string | null
  /** Absent in a snapshot written before REQ-A08 (#270): a club place, no venue. */
  venueName?: string | null
  venueAddress?: string | null
  coachPersonId: string | null
  status: OccurrenceStatus
  cancelReason: string | null
  isDetached: boolean
  needsReschedule: boolean
  gatheringMinutesBefore?: number | null
  /** Absent in a snapshot written before REQ-A07 (#269): no deadline. */
  confirmByMinutesBefore?: number | null
}

export type OccurrenceCommandResult = ActivitiesCommandResult<Occurrence, OccurrenceSnapshot> & {
  /** The announced change of a move or a restore (REQ-A09), null when nothing is announced. */
  change?: SessionChange | null
}

export function occurrenceSnapshot(row: Occurrence): OccurrenceSnapshot {
  return {
    id: row.id,
    tenantId: row.tenantId,
    organizationId: row.organizationId,
    activityId: row.activityId,
    occurrenceDate: row.occurrenceDate,
    startAt: row.startAt.toISOString(),
    endAt: row.endAt.toISOString(),
    placeId: row.placeId,
    venueName: row.venueName ?? null,
    venueAddress: row.venueAddress ?? null,
    coachPersonId: row.coachPersonId ?? null,
    status: row.status,
    cancelReason: row.cancelReason ?? null,
    isDetached: row.isDetached,
    needsReschedule: row.needsReschedule,
    gatheringMinutesBefore: row.gatheringMinutesBefore ?? null,
    confirmByMinutesBefore: row.confirmByMinutesBefore ?? null,
  }
}

function restoreOccurrence(row: Occurrence, before: OccurrenceSnapshot): void {
  row.startAt = new Date(before.startAt)
  row.endAt = new Date(before.endAt)
  row.placeId = before.placeId
  row.venueName = before.venueName ?? null
  row.venueAddress = before.venueAddress ?? null
  row.coachPersonId = before.coachPersonId
  row.status = before.status
  row.cancelReason = before.cancelReason
  row.isDetached = before.isDetached
  row.needsReschedule = before.needsReschedule
  // A snapshot written before DD-43 has no gathering field: no gathering time.
  row.gatheringMinutesBefore = before.gatheringMinutesBefore ?? null
  row.confirmByMinutesBefore = before.confirmByMinutesBefore ?? null
}

function loadOccurrence(ctx: CommandRuntimeContext) {
  return (em: EntityManager, id: string, lock: TargetLock): Promise<Occurrence | null> => {
    const tenantId = trustedTenantId(ctx)
    if (!tenantId) return Promise.resolve(null)
    return em.findOne(Occurrence, { id, tenantId, deletedAt: null }, lock)
  }
}

function occurrenceSpec<TSchema extends z.ZodType<{ id: string }>>(
  ctx: CommandRuntimeContext,
  input: TSchema,
  kinds: readonly GrantKind[],
) {
  const load = loadOccurrence(ctx)
  return {
    input,
    resourceKind: OCCURRENCE_RESOURCE_KIND,
    allowedKinds: kinds,
    loadTarget: (parsed: z.output<TSchema>, em: EntityManager, lock: TargetLock) => load(em, parsed.id, lock),
    resolveTarget: (_parsed: z.output<TSchema>, entity: Occurrence | null) =>
      scheduleTarget(entity as Occurrence, (entity as Occurrence).id),
  }
}

async function authorizeOccurrenceReplay(
  ctx: CommandRuntimeContext,
  id: string | null | undefined,
  kinds: readonly GrantKind[],
): Promise<Occurrence> {
  const em = ctx.transactionalEm
  if (!em || !id) throw new Error('[internal] session replay needs the replay transaction and the id')
  const authorized = await authorizeScoped(occurrenceSpec(ctx, z.object({ id: z.uuid() }), kinds), { id }, ctx, em, {
    mode: 'replay',
  })
  return authorized.entity as Occurrence
}

type SessionActivity = Pick<Activity, 'type' | 'recurrenceRule'>

/** The session's activity: its type (the declaration kind) and whether it is a one-off event (no rule). */
async function sessionActivity(em: EntityManager, row: Occurrence): Promise<SessionActivity> {
  const scope = { tenantId: row.tenantId, organizationId: row.organizationId }
  const activity = await em.findOne(
    Activity,
    { id: row.activityId, ...scope },
    { fields: ['id', 'type', 'recurrenceRule'] },
  )
  return { type: activity?.type ?? 'other', recurrenceRule: activity?.recurrenceRule ?? null }
}

/** Whether the session's declaration kind is `confirm` (the club setting for its activity type, D-026). */
async function confirmKind(ctx: CommandRuntimeContext, row: Occurrence, activity: SessionActivity): Promise<boolean> {
  const settings = await attendanceSettings(ctx.container, {
    tenantId: row.tenantId,
    organizationId: row.organizationId,
  })
  return (settings.declarationKinds[activity.type] ?? 'confirm') === 'confirm'
}

/**
 * DD-A05: a caller who edits a session only as a coach of its group (no coordinator or administrator grant on it) edits
 * the session of a one-off event, never one of a series — 403 `coach_edit_series_session`.
 */
async function assertCoachMayEdit(grants: Scope, row: Occurrence, activity: SessionActivity): Promise<void> {
  if (!mayEditSession(grants, row, Boolean(activity.recurrenceRule))) {
    await activitiesErrors.throw('coach_edit_series_session')
  }
}

/**
 * Whether `grants` may edit the session (DD-A05), as the update command decides it: a coordinator or the club
 * administrator any session in scope, a coach of its group only the session of a one-off event. For the reads that
 * offer "Edit" (M-04).
 */
export function mayEditSession(
  grants: Scope,
  row: Pick<Occurrence, 'id' | 'tenantId' | 'organizationId' | 'sectionId' | 'groupId'>,
  recurring: boolean,
): boolean {
  const target = scheduleTarget(row, row.id)
  if (findActingRole(grants, PLAN_KINDS, target)) return true
  return !recurring && findActingRole(grants, COACH_KINDS, target) !== null
}

/** The undo of a session edit is authorized like the edit: a coach only for the session of a one-off event. */
async function authorizeSessionEditReplay(
  ctx: CommandRuntimeContext,
  id: string | null | undefined,
): Promise<{ row: Occurrence; scope: Scope; actingRole: string }> {
  const em = ctx.transactionalEm
  if (!em || !id) throw new Error('[internal] session replay needs the replay transaction and the id')
  const authorized = await authorizeScoped(
    occurrenceSpec(ctx, z.object({ id: z.uuid() }), COACH_KINDS),
    { id },
    ctx,
    em,
    { mode: 'replay' },
  )
  const row = authorized.entity as Occurrence
  await assertCoachMayEdit(authorized.scope, row, await sessionActivity(em, row))
  return { row, scope: authorized.scope, actingRole: authorized.actingRole }
}

/** The facts of a session a notice compares (REQ-A09), read before a write changes them. */
function sessionFacts(row: Occurrence): SessionFacts {
  return {
    status: row.status,
    startAt: row.startAt,
    endAt: row.endAt,
    placeId: row.placeId,
    venueName: row.venueName ?? null,
    venueAddress: row.venueAddress ?? null,
    gatheringMinutesBefore: row.gatheringMinutesBefore ?? null,
  }
}

/**
 * `activities.occurrence.updated` after commit (REQ-A09, #271): the ids, and for an announced change (a move, its undo,
 * a restore) the `change` with the values before it, who made it and in which role, and the version it wrote — the
 * key of the notices. An event without `change` (a coach or deadline change, the `needs_reschedule` flag) is silent.
 */
function emitSessionUpdated(
  row: Occurrence,
  change: SessionChange | null,
  actor: { userId: string | null; personId: string | null; actingRole: string },
): Promise<void> {
  return emitAfterCommit(
    'activities.occurrence.updated',
    { tenantId: row.tenantId, organizationId: row.organizationId },
    {
      id: row.id,
      activityId: row.activityId,
      groupId: row.groupId,
      ...(change ? { change } : {}),
      actorUserId: actor.userId,
      actorPersonId: actor.personId,
      actingRole: actor.actingRole,
      updatedAt: row.updatedAt.toISOString(),
    },
  )
}

/** The session's place tree and coach must stay free for its (new) time — 409 with the list otherwise. */
async function assertSessionFits(ctx: CommandRuntimeContext, em: EntityManager, row: Occurrence): Promise<void> {
  if (row.status !== 'planned') return
  await lockSchedule(em, row.organizationId)
  await assertNoConflicts(
    await findConflicts(
      ctx.container,
      em,
      { tenantId: row.tenantId, organizationId: row.organizationId },
      {
        candidates: [{ key: row.id, startAt: row.startAt, endAt: row.endAt }],
        placeId: row.placeId,
        coachPersonId: row.coachPersonId ?? null,
        ignoreIds: [row.id],
      },
      'save',
    ),
  )
}

const updateOccurrenceCommand: CommandHandler<Record<string, unknown>, OccurrenceCommandResult> = {
  id: 'activities.occurrences.update',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const result = await inWriteTransaction(ctx, 'activities.occurrences.update', async (em) => {
      const authorized = await authorizeScoped(
        occurrenceSpec(ctx, occurrenceUpdateSchema, COACH_KINDS),
        rawInput,
        ctx,
        em,
      )
      const row = authorized.entity as Occurrence
      const patch = authorized.parsed
      const activity = await sessionActivity(em, row)
      await assertCoachMayEdit(authorized.scope, row, activity)
      if (row.status !== 'planned') await activitiesErrors.throw('occurrence_not_planned', { status: row.status })
      const scope = { tenantId: row.tenantId, organizationId: row.organizationId }
      // REQ-A08: a submitted place or venue replaces the other; untouched, the session stays where it is.
      const relocated = patch.placeId !== undefined || patch.venue !== undefined
      const chosen = chooseLocation(
        relocated ? { placeId: patch.placeId, venue: patch.venue } : { placeId: row.placeId, venue: storedVenue(row) },
      )
      if (!chosen.ok) return activitiesErrors.throw(chosen.code)
      if (chosen.location.venue && activity.recurrenceRule) await activitiesErrors.throw('venue_requires_one_off')
      await assertReferences(ctx, em, scope, {
        placeId: patch.placeId !== undefined && patch.placeId !== row.placeId ? patch.placeId : undefined,
        coachPersonId:
          patch.coachPersonId !== undefined && patch.coachPersonId !== row.coachPersonId ? patch.coachPersonId : null,
      })
      const startAt = patch.startAt ? new Date(patch.startAt) : row.startAt
      const endAt = patch.endAt ? new Date(patch.endAt) : row.endAt
      if (endAt.getTime() <= startAt.getTime()) await activitiesErrors.throw('activity_times_inverted')
      // DD-43: a moved session keeps its offset; a submitted gathering instant sets the offset from the new start.
      let gatheringMinutesBefore = row.gatheringMinutesBefore ?? null
      if (patch.gatheringAt === null) gatheringMinutesBefore = null
      else if (patch.gatheringAt !== undefined) {
        const offset = gatheringOffset(startAt, new Date(patch.gatheringAt))
        if (!offset.ok) return activitiesErrors.throw(offset.code)
        gatheringMinutesBefore = offset.minutes
      }
      // REQ-A07, DD-A01: the deadline keeps its offset too, but a move that puts a deadline with effect (a `confirm`
      // kind) in the past must send `confirmBy` — a new instant or null.
      const moved = startAt.getTime() !== row.startAt.getTime()
      const confirmBy = nextConfirmByMinutes({
        startAt,
        moved,
        current: row.confirmByMinutesBefore ?? null,
        submitted: patch.confirmBy,
        applies: moved && (await confirmKind(ctx, row, activity)),
        now: new Date(),
      })
      if (!confirmBy.ok) return activitiesErrors.throw(confirmBy.code)
      const before = occurrenceSnapshot(row)
      const beforeFacts = sessionFacts(row)
      row.startAt = startAt
      row.endAt = endAt
      row.placeId = chosen.location.placeId
      row.venueName = chosen.location.venue?.name ?? null
      row.venueAddress = chosen.location.venue?.address ?? null
      if (patch.coachPersonId !== undefined) row.coachPersonId = patch.coachPersonId
      row.gatheringMinutesBefore = gatheringMinutesBefore
      row.confirmByMinutesBefore = confirmBy.minutes
      row.isDetached = true
      row.needsReschedule = false
      row.updatedAt = new Date()
      await assertSessionFits(ctx, em, row)
      return {
        entity: row,
        actingRole: authorized.actingRole,
        before,
        change: sessionChangeOf(beforeFacts, sessionFacts(row), row.updatedAt),
        actorPersonId: selfPersonId(authorized.scope),
      }
    })
    const row = result.entity
    await emitSessionUpdated(row, result.change, {
      userId: ctx.auth?.sub ?? null,
      personId: result.actorPersonId,
      actingRole: result.actingRole,
    })
    return { entity: row, actingRole: result.actingRole, before: result.before, change: result.change }
  },
  buildLog: ({ result }) =>
    activitiesLog({
      result,
      resourceKind: OCCURRENCE_RESOURCE_KIND,
      labelKey: 'activities.audit.occurrences.update',
      fallback: 'Move a session',
      after: occurrenceSnapshot(result.entity),
      parent: { resourceKind: 'activities.activity', resourceId: result.entity.activityId },
    }),
  async authorizeReplay({ ctx, logEntry }) {
    await authorizeSessionEditReplay(ctx, logEntry.resourceId)
  },
  async undo({ ctx, logEntry }) {
    const before = logEntry.snapshotBefore as OccurrenceSnapshot | null | undefined
    if (!before?.id) throw new Error('[internal] missing session snapshot for undo')
    const { row, scope, actingRole } = await authorizeSessionEditReplay(ctx, before.id)
    const em = ctx.transactionalEm as EntityManager
    const beforeFacts = sessionFacts(row)
    restoreOccurrence(row, before)
    row.updatedAt = new Date()
    await assertSessionFits(ctx, em, row)
    await em.flush()
    // A move back by undo is a move and is announced again (J-A03 step 5).
    await emitSessionUpdated(row, sessionChangeOf(beforeFacts, sessionFacts(row), row.updatedAt), {
      userId: ctx.auth?.sub ?? null,
      personId: selfPersonId(scope),
      actingRole,
    })
  },
}

/**
 * The role the caller cancels the session in (#199): the first of their `COACH_KINDS` grants on the session
 * (least-privileged first), except that where the club setting `coach_may_cancel` is off a coach cancels only through
 * a coordinator or administrator grant they also hold; null when they may not cancel. The command and the member reads
 * (M-04, M-05) and the backend session reads (B-15, #215) share it, so "Cancel" is offered only when the cancellation
 * would be accepted — an assigned coach of another group, who reads the session through `self`, is not offered it.
 */
export async function cancelRoleOf(
  container: AwilixContainer,
  grants: Scope,
  row: CancelTargetRow,
): Promise<ActingRole | null> {
  return (await cancelRolesOf(container, grants, [row])).get(row.id) ?? null
}

type CancelTargetRow = Pick<Occurrence, 'id' | 'tenantId' | 'organizationId' | 'sectionId' | 'groupId'>

/**
 * `cancelRoleOf` for the sessions of one club page (#215): the role per session id, reading the club setting
 * `coach_may_cancel` at most once and only when a session is reached through a coach grant.
 */
export async function cancelRolesOf(
  container: AwilixContainer,
  grants: Scope,
  rows: CancelTargetRow[],
): Promise<Map<string, ActingRole | null>> {
  const roles = new Map<string, ActingRole | null>()
  let mayCancel: Promise<boolean> | undefined
  for (const row of rows) {
    const target = scheduleTarget(row, row.id)
    // The command's own check (`COACH_KINDS` on the schedule target), so a read never promises more than it accepts.
    const actingRole = findActingRole(grants, COACH_KINDS, target)
    if (actingRole !== 'coach') {
      roles.set(row.id, actingRole)
      continue
    }
    mayCancel ??= coachMayCancel(container, { tenantId: row.tenantId, organizationId: row.organizationId })
    roles.set(row.id, permittedCancelRole(await mayCancel, actingRole, findActingRole(grants, PLAN_KINDS, target)))
  }
  return roles
}

const cancelOccurrenceCommand: CommandHandler<Record<string, unknown>, OccurrenceCommandResult> = {
  id: 'activities.occurrences.cancel',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const result = await inWriteTransaction(ctx, 'activities.occurrences.cancel', async (em) => {
      const authorized = await authorizeScoped(
        occurrenceSpec(ctx, occurrenceCancelSchema, COACH_KINDS),
        rawInput,
        ctx,
        em,
      )
      const row = authorized.entity as Occurrence
      const actingRole = await cancelRoleOf(ctx.container, authorized.scope, row)
      if (!actingRole) return activitiesErrors.throw('coach_cancel_disabled', { setting: 'coach_may_cancel' })
      await assertTransition(sessionTransitions, row.status, 'cancelled')
      const before = occurrenceSnapshot(row)
      row.status = 'cancelled'
      row.cancelReason = authorized.parsed.reason
      row.updatedAt = new Date()
      return {
        entity: row,
        actingRole,
        before,
        actorPersonId: selfPersonId(authorized.scope),
      }
    })
    const row = result.entity
    // #139: the payload names who cancelled and in which role (R01), for the coordinators' notice and the thread.
    await emitAfterCommit(
      'activities.occurrence.cancelled',
      { tenantId: row.tenantId, organizationId: row.organizationId },
      {
        id: row.id,
        activityId: row.activityId,
        groupId: row.groupId,
        actorUserId: ctx.auth?.sub ?? null,
        actorPersonId: result.actorPersonId,
        actingRole: result.actingRole,
        updatedAt: row.updatedAt.toISOString(),
      },
    )
    return { entity: result.entity, actingRole: result.actingRole, before: result.before }
  },
  buildLog: ({ result }) =>
    activitiesLog({
      result,
      resourceKind: OCCURRENCE_RESOURCE_KIND,
      labelKey: 'activities.audit.occurrences.cancel',
      fallback: 'Cancel a session',
      after: occurrenceSnapshot(result.entity),
      parent: { resourceKind: 'activities.activity', resourceId: result.entity.activityId },
    }),
  async authorizeReplay({ ctx, logEntry }) {
    await authorizeOccurrenceReplay(ctx, logEntry.resourceId, COACH_KINDS)
  },
  async undo({ ctx, logEntry }) {
    const before = logEntry.snapshotBefore as OccurrenceSnapshot | null | undefined
    if (!before?.id) throw new Error('[internal] missing session snapshot for undo')
    const row = await authorizeOccurrenceReplay(ctx, before.id, COACH_KINDS)
    const em = ctx.transactionalEm as EntityManager
    // The undo of a cancellation puts the session back on the schedule, so it must still fit there.
    restoreOccurrence(row, before)
    row.updatedAt = new Date()
    await assertSessionFits(ctx, em, row)
    await em.flush()
    await emitAfterCommit(
      'activities.occurrence.updated',
      { tenantId: row.tenantId, organizationId: row.organizationId },
      { id: row.id, activityId: row.activityId },
    )
  },
}

/** Only the club administrator restores a cancelled session (club spec glossary *Session*; Q-A20). */
const RESTORE_KINDS: readonly GrantKind[] = ['club_admin']

/**
 * `activities.occurrences.restore` (REQ-A05 of the groups and activities parity spec, #268): a cancelled session
 * becomes `planned` again with the administrator's reason (3–500 characters, kept in the audit log), only while its end
 * is in the future (409 `occurrence_already_ended`), and only when the place tree and the coach are still free (409 with
 * the list). Another status answers 409 `occurrence_not_cancelled`. A restore is announced as a session change (#271).
 */
const restoreOccurrenceCommand: CommandHandler<
  Record<string, unknown>,
  OccurrenceCommandResult & { reason: string }
> = {
  id: 'activities.occurrences.restore',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const result = await inWriteTransaction(ctx, 'activities.occurrences.restore', async (em) => {
      const authorized = await authorizeScoped(
        occurrenceSpec(ctx, occurrenceRestoreSchema, RESTORE_KINDS),
        rawInput,
        ctx,
        em,
      )
      const row = authorized.entity as Occurrence
      if (row.status !== 'cancelled') {
        return activitiesErrors.throw('occurrence_not_cancelled', { status: row.status })
      }
      if (row.endAt.getTime() <= Date.now()) {
        return activitiesErrors.throw('occurrence_already_ended', { endAt: row.endAt.toISOString() })
      }
      await assertTransition(sessionTransitions, row.status, 'planned')
      const before = occurrenceSnapshot(row)
      const beforeFacts = sessionFacts(row)
      row.status = 'planned'
      row.cancelReason = null
      row.updatedAt = new Date()
      await assertSessionFits(ctx, em, row)
      return {
        entity: row,
        actingRole: authorized.actingRole,
        before,
        reason: authorized.parsed.reason,
        change: sessionChangeOf(beforeFacts, sessionFacts(row), row.updatedAt),
        actorPersonId: selfPersonId(authorized.scope),
      }
    })
    const row = result.entity
    // REQ-A09: a restore is announced — the session takes place after all (TEST-A07).
    await emitSessionUpdated(row, result.change, {
      userId: ctx.auth?.sub ?? null,
      personId: result.actorPersonId,
      actingRole: result.actingRole,
    })
    return {
      entity: row,
      actingRole: result.actingRole,
      before: result.before,
      reason: result.reason,
      change: result.change,
    }
  },
  buildLog: ({ result }) =>
    activitiesLog({
      result,
      resourceKind: OCCURRENCE_RESOURCE_KIND,
      labelKey: 'activities.audit.occurrences.restore',
      fallback: 'Restore a session',
      after: occurrenceSnapshot(result.entity),
      parent: { resourceKind: 'activities.activity', resourceId: result.entity.activityId },
      context: { reason: result.reason },
    }),
  async authorizeReplay({ ctx, logEntry }) {
    await authorizeOccurrenceReplay(ctx, logEntry.resourceId, RESTORE_KINDS)
  },
  async undo({ ctx, logEntry }) {
    const before = logEntry.snapshotBefore as OccurrenceSnapshot | null | undefined
    if (!before?.id) throw new Error('[internal] missing session snapshot for undo')
    const row = await authorizeOccurrenceReplay(ctx, before.id, RESTORE_KINDS)
    const em = ctx.transactionalEm as EntityManager
    // The undo cancels the session again, so nothing on the schedule has to be checked.
    restoreOccurrence(row, before)
    row.updatedAt = new Date()
    await em.flush()
    await emitAfterCommit(
      'activities.occurrence.updated',
      { tenantId: row.tenantId, organizationId: row.organizationId },
      { id: row.id, activityId: row.activityId },
    )
  },
}

registerCommand(updateOccurrenceCommand)
registerCommand(cancelOccurrenceCommand)
registerCommand(restoreOccurrenceCommand)
