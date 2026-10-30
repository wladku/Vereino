// `activities.activities.create|update|delete` (club spec glossary *Activity*, D02, DD-10, REQ-005, TEST-007, TEST-012;
// foundation II DD-G01…DD-G05): an activity of one group — a weekly series of the RRULE subset or a one-off activity —
// planned by the coordinator of the group's section or by the club administrator. Creating it generates the sessions
// of the 16-week horizon; changing its rule, times, place, coach, dates or activity re-plans the future sessions and
// leaves past, detached and pinned ones untouched. A conflict on the place tree beyond its capacity, or a coach booked
// twice, refuses the whole write (409 with the list). An activity with history (a past, cancelled or done session) is
// deactivated, not deleted (409 `activity_has_sessions`).
import { randomUUID } from 'node:crypto'
import type { EntityManager } from '@mikro-orm/postgresql'
import { registerCommand, type CommandHandler, type CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { z } from 'zod'
import { normalizeLocalTime, type Scope } from '@vereino/core'
import { authorizeScoped, type AuthorizeScopedSpec, type TargetLock } from '@/modules/foundation'
import { activitiesErrors } from '../api/errors'
import { Activity, Occurrence } from '../data/entities'
import { activityCreateSchema, activityDeleteSchema, activityUpdateSchema } from '../data/validators'
import type { ActivityType } from '../lib/activities-rules'
import { clubClock } from '../services/directory'
import { assertSeriesShape, replanSeries, restoreSessions, storedRule, type Clock } from '../services/series'
import {
  PLAN_KINDS,
  activitiesLog,
  assertReferences,
  emitAfterCommit,
  groupTarget,
  hasSessionChanges,
  inWriteTransaction,
  lookupGroup,
  scheduleTarget,
  trustedTenantId,
  type ActivitiesCommandResult,
  type SessionChanges,
} from './shared'

export const ACTIVITY_RESOURCE_KIND = 'activities.activity'

export type ActivitySnapshot = {
  id: string
  tenantId: string
  organizationId: string
  sectionId: string
  groupId: string
  name: string
  type: ActivityType
  defaultPlaceId: string
  defaultCoachPersonId: string | null
  opponentExternalTeamId: string | null
  invitedExternalTeamIds: string[]
  recurrenceRule: string | null
  startsOn: string
  endsOn: string | null
  defaultStartTime: string
  defaultEndTime: string
  description: string | null
  isActive: boolean
  /** The sessions a delete removed, so its undo restores exactly them. */
  removedSessionIds?: string[]
}

export type ActivityCommandResult = ActivitiesCommandResult<Activity, ActivitySnapshot> & { changes: SessionChanges }

export function activitySnapshot(row: Activity): ActivitySnapshot {
  return {
    id: row.id,
    tenantId: row.tenantId,
    organizationId: row.organizationId,
    sectionId: row.sectionId,
    groupId: row.groupId,
    name: row.name,
    type: row.type,
    defaultPlaceId: row.defaultPlaceId,
    defaultCoachPersonId: row.defaultCoachPersonId ?? null,
    opponentExternalTeamId: row.opponentExternalTeamId ?? null,
    invitedExternalTeamIds: [...row.invitedExternalTeamIds],
    recurrenceRule: row.recurrenceRule ?? null,
    startsOn: row.startsOn,
    endsOn: row.endsOn ?? null,
    defaultStartTime: row.defaultStartTime,
    defaultEndTime: row.defaultEndTime,
    description: row.description ?? null,
    isActive: row.isActive,
  }
}

function restoreActivity(row: Activity, before: ActivitySnapshot): void {
  row.name = before.name
  row.type = before.type
  row.defaultPlaceId = before.defaultPlaceId
  row.defaultCoachPersonId = before.defaultCoachPersonId
  row.opponentExternalTeamId = before.opponentExternalTeamId
  row.invitedExternalTeamIds = [...before.invitedExternalTeamIds]
  row.recurrenceRule = before.recurrenceRule
  row.startsOn = before.startsOn
  row.endsOn = before.endsOn
  row.defaultStartTime = before.defaultStartTime
  row.defaultEndTime = before.defaultEndTime
  row.description = before.description
  row.isActive = before.isActive
}

/** The fields whose change re-plans the future sessions. */
function seriesKey(row: Activity): string {
  return JSON.stringify([
    row.recurrenceRule ?? null,
    row.startsOn,
    row.endsOn ?? null,
    normalizeLocalTime(row.defaultStartTime),
    normalizeLocalTime(row.defaultEndTime),
    row.defaultPlaceId,
    row.defaultCoachPersonId ?? null,
    row.isActive,
  ])
}

function loadActivity(ctx: CommandRuntimeContext, includeDeleted = false) {
  return (em: EntityManager, id: string, lock: TargetLock): Promise<Activity | null> => {
    const tenantId = trustedTenantId(ctx)
    if (!tenantId) return Promise.resolve(null)
    return em.findOne(Activity, { id, tenantId, ...(includeDeleted ? {} : { deletedAt: null }) }, lock)
  }
}

function existingSpec<TSchema extends z.ZodType<{ id: string }>>(
  input: TSchema,
  load: (em: EntityManager, id: string, lock: TargetLock) => Promise<Activity | null>,
): AuthorizeScopedSpec<TSchema, Activity> {
  return {
    input,
    resourceKind: ACTIVITY_RESOURCE_KIND,
    allowedKinds: PLAN_KINDS,
    loadTarget: (parsed, em, lock) => load(em, parsed.id, lock),
    resolveTarget: (_parsed, entity) => scheduleTarget(entity as Activity),
  }
}

async function authorizeActivityReplay(
  ctx: CommandRuntimeContext,
  id: string | null | undefined,
  includeDeleted = false,
): Promise<{ row: Activity; scope: Scope }> {
  const em = ctx.transactionalEm
  if (!em || !id) throw new Error('[internal] activity replay needs the replay transaction and the id')
  const authorized = await authorizeScoped(
    existingSpec(z.object({ id: z.uuid() }), loadActivity(ctx, includeDeleted)),
    { id },
    ctx,
    em,
    { mode: 'replay' },
  )
  return { row: authorized.entity as Activity, scope: authorized.scope }
}

async function emitActivityEffects(
  row: Activity,
  action: 'created' | 'updated' | 'deleted',
  changes: SessionChanges,
): Promise<void> {
  const scope = { tenantId: row.tenantId, organizationId: row.organizationId }
  await emitAfterCommit(`activities.activity.${action}`, scope, { id: row.id })
  if (hasSessionChanges(changes)) {
    await emitAfterCommit('activities.occurrence.generated', scope, { id: row.id, ...changes })
  }
}

/** Soft-deletes the live sessions of an activity; refuses (409) when any of them has history. */
async function removeAllSessions(em: EntityManager, row: Activity, clock: Clock): Promise<string[]> {
  const sessions = await em.find(Occurrence, {
    tenantId: row.tenantId,
    organizationId: row.organizationId,
    activityId: row.id,
    deletedAt: null,
  })
  if (sessions.some((session) => session.status !== 'planned' || session.occurrenceDate < clock.today)) {
    await activitiesErrors.throw('activity_has_sessions')
  }
  const now = new Date()
  for (const session of sessions) {
    session.deletedAt = now
    session.updatedAt = now
  }
  return sessions.map((session) => session.id)
}

const createActivityCommand: CommandHandler<Record<string, unknown>, ActivityCommandResult> = {
  id: 'activities.activities.create',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const id = randomUUID()
    const result = await inWriteTransaction(ctx, 'activities.activities.create', async (em) => {
      const authorized = await authorizeScoped(
        {
          input: activityCreateSchema,
          resourceKind: ACTIVITY_RESOURCE_KIND,
          allowedKinds: PLAN_KINDS,
          loadTarget: async (parsed, txEm) => ({ group: await lookupGroup(ctx, parsed.groupId, txEm) }),
          lock: 'none',
          resolveTarget: (_parsed, holder, scope) => groupTarget(id, scope, holder?.group ?? null),
        },
        rawInput,
        ctx,
        em,
      )
      const { parsed, tenantId, organizationId } = authorized
      const scope = { tenantId, organizationId }
      const group = authorized.entity?.group ?? null
      await assertReferences(ctx, em, scope, {
        group,
        type: parsed.type,
        placeId: parsed.placeId,
        coachPersonId: parsed.coachPersonId ?? null,
        externalTeamIds: [
          ...(parsed.invitedExternalTeamIds ?? []),
          ...(parsed.opponentExternalTeamId ? [parsed.opponentExternalTeamId] : []),
        ],
      })
      const clock = await clubClock(ctx.container, scope)
      const { rule, text } = await storedRule(parsed.recurrenceRule, parsed.exdates, parsed.startsOn)
      await assertSeriesShape(
        {
          startTime: parsed.startTime,
          endTime: parsed.endTime,
          startsOn: parsed.startsOn,
          endsOn: parsed.endsOn ?? null,
          rule,
        },
        clock,
      )
      const row = em.create(Activity, {
        id,
        ...scope,
        sectionId: (group as NonNullable<typeof group>).sectionId,
        groupId: parsed.groupId,
        name: parsed.name,
        type: parsed.type,
        defaultPlaceId: parsed.placeId,
        defaultCoachPersonId: parsed.coachPersonId ?? null,
        opponentExternalTeamId: parsed.opponentExternalTeamId ?? null,
        invitedExternalTeamIds: [...new Set(parsed.invitedExternalTeamIds ?? [])],
        recurrenceRule: text,
        startsOn: parsed.startsOn,
        endsOn: parsed.endsOn ?? null,
        defaultStartTime: normalizeLocalTime(parsed.startTime),
        defaultEndTime: normalizeLocalTime(parsed.endTime),
        description: parsed.description ?? null,
        isActive: parsed.isActive ?? true,
      })
      em.persist(row)
      const changes = await replanSeries(ctx, em, row, clock)
      return { entity: row, actingRole: authorized.actingRole, before: null, changes }
    })
    await emitActivityEffects(result.entity, 'created', result.changes)
    return result
  },
  buildLog: ({ result }) =>
    activitiesLog({
      result,
      resourceKind: ACTIVITY_RESOURCE_KIND,
      labelKey: 'activities.audit.activities.create',
      fallback: 'Create an activity',
      after: activitySnapshot(result.entity),
      context: { sessionsCreated: result.changes.createdIds.length },
    }),
  async authorizeReplay({ ctx, logEntry }) {
    await authorizeActivityReplay(ctx, logEntry.resourceId)
  },
  async undo({ ctx, logEntry }) {
    const { row } = await authorizeActivityReplay(ctx, logEntry.resourceId)
    const em = ctx.transactionalEm as EntityManager
    const clock = await clubClock(ctx.container, { tenantId: row.tenantId, organizationId: row.organizationId })
    const removedIds = await removeAllSessions(em, row, clock)
    row.deletedAt = new Date()
    row.updatedAt = new Date()
    await em.flush()
    await emitActivityEffects(row, 'deleted', { createdIds: [], updatedIds: [], removedIds })
  },
}

const updateActivityCommand: CommandHandler<Record<string, unknown>, ActivityCommandResult> = {
  id: 'activities.activities.update',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const result = await inWriteTransaction(ctx, 'activities.activities.update', async (em) => {
      const authorized = await authorizeScoped(existingSpec(activityUpdateSchema, loadActivity(ctx)), rawInput, ctx, em)
      const row = authorized.entity as Activity
      const patch = authorized.parsed
      const scope = { tenantId: row.tenantId, organizationId: row.organizationId }
      const before = activitySnapshot(row)
      const beforeKey = seriesKey(row)
      const type = patch.type ?? row.type
      const group =
        patch.type !== undefined || (patch.isActive === true && !row.isActive)
          ? await lookupGroup(ctx, row.groupId, em)
          : undefined
      await assertReferences(ctx, em, scope, {
        group,
        type,
        placeId: patch.placeId !== undefined && patch.placeId !== row.defaultPlaceId ? patch.placeId : undefined,
        coachPersonId:
          patch.coachPersonId !== undefined && patch.coachPersonId !== row.defaultCoachPersonId
            ? patch.coachPersonId
            : null,
        externalTeamIds: [
          ...(patch.invitedExternalTeamIds ?? []),
          ...(patch.opponentExternalTeamId ? [patch.opponentExternalTeamId] : []),
        ],
      })
      const clock = await clubClock(ctx.container, scope)
      const startsOn = patch.startsOn ?? row.startsOn
      const ruleText = patch.recurrenceRule !== undefined ? patch.recurrenceRule : (row.recurrenceRule ?? null)
      const { rule, text } = await storedRule(ruleText, patch.exdates, startsOn)
      const endsOn = patch.endsOn !== undefined ? patch.endsOn : (row.endsOn ?? null)
      const startTime = patch.startTime ?? row.defaultStartTime
      const endTime = patch.endTime ?? row.defaultEndTime
      await assertSeriesShape({ startTime, endTime, startsOn, endsOn, rule }, clock)
      row.name = patch.name ?? row.name
      row.type = type
      row.defaultPlaceId = patch.placeId ?? row.defaultPlaceId
      if (patch.coachPersonId !== undefined) row.defaultCoachPersonId = patch.coachPersonId
      if (patch.opponentExternalTeamId !== undefined) row.opponentExternalTeamId = patch.opponentExternalTeamId
      if (patch.invitedExternalTeamIds !== undefined)
        row.invitedExternalTeamIds = [...new Set(patch.invitedExternalTeamIds)]
      row.recurrenceRule = text
      row.startsOn = startsOn
      row.endsOn = endsOn
      row.defaultStartTime = normalizeLocalTime(startTime)
      row.defaultEndTime = normalizeLocalTime(endTime)
      if (patch.description !== undefined) row.description = patch.description
      if (patch.isActive !== undefined) row.isActive = patch.isActive
      row.updatedAt = new Date()
      const changes =
        seriesKey(row) !== beforeKey
          ? await replanSeries(ctx, em, row, clock)
          : { createdIds: [], updatedIds: [], removedIds: [] }
      return { entity: row, actingRole: authorized.actingRole, before, changes }
    })
    await emitActivityEffects(result.entity, 'updated', result.changes)
    return result
  },
  buildLog: ({ result }) =>
    activitiesLog({
      result,
      resourceKind: ACTIVITY_RESOURCE_KIND,
      labelKey: 'activities.audit.activities.update',
      fallback: 'Change an activity',
      after: activitySnapshot(result.entity),
      context: {
        sessionsCreated: result.changes.createdIds.length,
        sessionsUpdated: result.changes.updatedIds.length,
        sessionsRemoved: result.changes.removedIds.length,
      },
    }),
  async authorizeReplay({ ctx, logEntry }) {
    await authorizeActivityReplay(ctx, logEntry.resourceId)
  },
  async undo({ ctx, logEntry }) {
    const before = logEntry.snapshotBefore as ActivitySnapshot | null | undefined
    if (!before?.id) throw new Error('[internal] missing activity snapshot for undo')
    const { row } = await authorizeActivityReplay(ctx, before.id)
    const em = ctx.transactionalEm as EntityManager
    const clock = await clubClock(ctx.container, { tenantId: row.tenantId, organizationId: row.organizationId })
    restoreActivity(row, before)
    row.updatedAt = new Date()
    const changes = await replanSeries(ctx, em, row, clock)
    await emitActivityEffects(row, 'updated', changes)
  },
}

const deleteActivityCommand: CommandHandler<Record<string, unknown>, ActivityCommandResult> = {
  id: 'activities.activities.delete',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const result = await inWriteTransaction(ctx, 'activities.activities.delete', async (em) => {
      const authorized = await authorizeScoped(existingSpec(activityDeleteSchema, loadActivity(ctx)), rawInput, ctx, em)
      const row = authorized.entity as Activity
      const clock = await clubClock(ctx.container, { tenantId: row.tenantId, organizationId: row.organizationId })
      const removedIds = await removeAllSessions(em, row, clock)
      const before = { ...activitySnapshot(row), removedSessionIds: removedIds }
      row.deletedAt = new Date()
      row.updatedAt = new Date()
      return {
        entity: row,
        actingRole: authorized.actingRole,
        before,
        changes: { createdIds: [], updatedIds: [], removedIds },
      }
    })
    await emitActivityEffects(result.entity, 'deleted', result.changes)
    return result
  },
  buildLog: ({ result }) =>
    activitiesLog({
      result,
      resourceKind: ACTIVITY_RESOURCE_KIND,
      labelKey: 'activities.audit.activities.delete',
      fallback: 'Delete an activity',
      after: null,
    }),
  async authorizeReplay({ ctx, logEntry }) {
    await authorizeActivityReplay(ctx, logEntry.resourceId, true)
  },
  async undo({ ctx, logEntry }) {
    const before = logEntry.snapshotBefore as ActivitySnapshot | null | undefined
    if (!before?.id) throw new Error('[internal] missing activity snapshot for undo')
    const { row } = await authorizeActivityReplay(ctx, before.id, true)
    const em = ctx.transactionalEm as EntityManager
    restoreActivity(row, before)
    row.deletedAt = null
    row.updatedAt = new Date()
    await em.flush()
    const ids = before.removedSessionIds ?? []
    const sessions =
      ids.length > 0
        ? await em.find(Occurrence, {
            id: { $in: ids },
            tenantId: row.tenantId,
            organizationId: row.organizationId,
            activityId: row.id,
          })
        : []
    const restoredIds = await restoreSessions(ctx, em, sessions)
    await emitActivityEffects(row, 'created', { createdIds: restoredIds, updatedIds: [], removedIds: [] })
  },
}

registerCommand(createActivityCommand)
registerCommand(updateActivityCommand)
registerCommand(deleteActivityCommand)
