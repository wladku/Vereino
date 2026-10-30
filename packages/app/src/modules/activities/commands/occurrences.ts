// `activities.occurrences.update` and `activities.occurrences.cancel` (club spec glossary *Session*, *Session
// cancellation*, *Session conflict*; DD-10; foundation II DD-G03, DD-G04; #31):
// - moving or re-staffing one planned session detaches it from its series (`is_detached`), so a later series change
//   never touches it; the move is refused when it overbooks the place tree or the coach (409 with the list) — by the
//   coordinator of the session's section or the club administrator;
// - cancelling a planned session with a reason (`planned → cancelled`; a cancelled or done session answers 409
//   `invalid_transition`) — also by a coach of the session's group; `activities.occurrence.cancelled` after commit
//   sends the in-app notice (`subscribers/notify-occurrence-cancelled.ts`).
import type { EntityManager } from '@mikro-orm/postgresql'
import { registerCommand, type CommandHandler, type CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { z } from 'zod'
import type { GrantKind } from '@vereino/core'
import { assertTransition, authorizeScoped, type TargetLock } from '@/modules/foundation'
import { activitiesErrors } from '../api/errors'
import { Occurrence } from '../data/entities'
import { lockSchedule } from '../data/queries'
import { occurrenceCancelSchema, occurrenceUpdateSchema } from '../data/validators'
import { sessionTransitions, type OccurrenceStatus } from '../lib/activities-rules'
import { assertNoConflicts, findConflicts } from '../services/schedule'
import {
  COACH_KINDS,
  PLAN_KINDS,
  activitiesLog,
  assertReferences,
  emitAfterCommit,
  inWriteTransaction,
  scheduleTarget,
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
  placeId: string
  coachPersonId: string | null
  status: OccurrenceStatus
  cancelReason: string | null
  isDetached: boolean
  needsReschedule: boolean
}

export type OccurrenceCommandResult = ActivitiesCommandResult<Occurrence, OccurrenceSnapshot>

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
    coachPersonId: row.coachPersonId ?? null,
    status: row.status,
    cancelReason: row.cancelReason ?? null,
    isDetached: row.isDetached,
    needsReschedule: row.needsReschedule,
  }
}

function restoreOccurrence(row: Occurrence, before: OccurrenceSnapshot): void {
  row.startAt = new Date(before.startAt)
  row.endAt = new Date(before.endAt)
  row.placeId = before.placeId
  row.coachPersonId = before.coachPersonId
  row.status = before.status
  row.cancelReason = before.cancelReason
  row.isDetached = before.isDetached
  row.needsReschedule = before.needsReschedule
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
        occurrenceSpec(ctx, occurrenceUpdateSchema, PLAN_KINDS),
        rawInput,
        ctx,
        em,
      )
      const row = authorized.entity as Occurrence
      const patch = authorized.parsed
      if (row.status !== 'planned') await activitiesErrors.throw('occurrence_not_planned', { status: row.status })
      const scope = { tenantId: row.tenantId, organizationId: row.organizationId }
      await assertReferences(ctx, em, scope, {
        placeId: patch.placeId !== undefined && patch.placeId !== row.placeId ? patch.placeId : undefined,
        coachPersonId:
          patch.coachPersonId !== undefined && patch.coachPersonId !== row.coachPersonId ? patch.coachPersonId : null,
      })
      const startAt = patch.startAt ? new Date(patch.startAt) : row.startAt
      const endAt = patch.endAt ? new Date(patch.endAt) : row.endAt
      if (endAt.getTime() <= startAt.getTime()) await activitiesErrors.throw('activity_times_inverted')
      const before = occurrenceSnapshot(row)
      row.startAt = startAt
      row.endAt = endAt
      if (patch.placeId !== undefined) row.placeId = patch.placeId
      if (patch.coachPersonId !== undefined) row.coachPersonId = patch.coachPersonId
      row.isDetached = true
      row.needsReschedule = false
      row.updatedAt = new Date()
      await assertSessionFits(ctx, em, row)
      return { entity: row, actingRole: authorized.actingRole, before }
    })
    const row = result.entity
    await emitAfterCommit(
      'activities.occurrence.updated',
      { tenantId: row.tenantId, organizationId: row.organizationId },
      { id: row.id, activityId: row.activityId },
    )
    return result
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
    await authorizeOccurrenceReplay(ctx, logEntry.resourceId, PLAN_KINDS)
  },
  async undo({ ctx, logEntry }) {
    const before = logEntry.snapshotBefore as OccurrenceSnapshot | null | undefined
    if (!before?.id) throw new Error('[internal] missing session snapshot for undo')
    const row = await authorizeOccurrenceReplay(ctx, before.id, PLAN_KINDS)
    const em = ctx.transactionalEm as EntityManager
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
      await assertTransition(sessionTransitions, row.status, 'cancelled')
      const before = occurrenceSnapshot(row)
      row.status = 'cancelled'
      row.cancelReason = authorized.parsed.reason
      row.updatedAt = new Date()
      return { entity: row, actingRole: authorized.actingRole, before }
    })
    const row = result.entity
    await emitAfterCommit(
      'activities.occurrence.cancelled',
      { tenantId: row.tenantId, organizationId: row.organizationId },
      {
        id: row.id,
        activityId: row.activityId,
        groupId: row.groupId,
        actorUserId: ctx.auth?.sub ?? null,
        updatedAt: row.updatedAt.toISOString(),
      },
    )
    return result
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

registerCommand(updateOccurrenceCommand)
registerCommand(cancelOccurrenceCommand)
