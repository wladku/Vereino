// `activities.events.create` (club spec glossary *One-off event*, REQ-027, phase 2 step 8, TEST-034): a coach creates
// a `tournament` or `other` event for a group they coach — without the coordinator's consent — and so may the
// coordinator of the group's section or the club administrator. A group outside the caller's scope answers 403
// `scope_denied`; `match` or `sparring` on a class group 422 `activity_type_requires_team`; any other type than
// `tournament` / `other` 422 `event_type_not_allowed`; an overbooked place tree or coach 409. The event is a one-off
// activity (no rule) with one session at the given instants; its coach is the given person or, for a coach, the
// coach themself.
import { randomUUID } from 'node:crypto'
import type { EntityManager } from '@mikro-orm/postgresql'
import { registerCommand, type CommandHandler } from '@open-mercato/shared/lib/commands'
import { z } from 'zod'
import { authorizeScoped } from '@/modules/foundation'
import { activitiesErrors } from '../api/errors'
import { Activity, Occurrence } from '../data/entities'
import { lockSchedule } from '../data/queries'
import { eventCreateSchema } from '../data/validators'
import { EVENT_TYPES, localDateTime } from '../lib/activities-rules'
import { clubClock } from '../services/directory'
import { assertNoConflicts, findConflicts } from '../services/schedule'
import { activitySnapshot, ACTIVITY_RESOURCE_KIND, type ActivitySnapshot } from './activities'
import {
  COACH_KINDS,
  activitiesLog,
  assertReferences,
  emitAfterCommit,
  groupTarget,
  inWriteTransaction,
  lookupGroup,
  scheduleTarget,
  selfPersonId,
  trustedTenantId,
  type ActivitiesCommandResult,
} from './shared'

export type EventCommandResult = ActivitiesCommandResult<Activity, ActivitySnapshot> & { occurrenceId: string }

const createEventCommand: CommandHandler<Record<string, unknown>, EventCommandResult> = {
  id: 'activities.events.create',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const id = randomUUID()
    const occurrenceId = randomUUID()
    const result = await inWriteTransaction(ctx, 'activities.events.create', async (em) => {
      const authorized = await authorizeScoped(
        {
          input: eventCreateSchema,
          resourceKind: ACTIVITY_RESOURCE_KIND,
          allowedKinds: COACH_KINDS,
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
      const coachPersonId =
        parsed.coachPersonId !== undefined
          ? parsed.coachPersonId
          : authorized.actingRole === 'coach'
            ? selfPersonId(authorized.scope)
            : null
      await assertReferences(ctx, em, scope, {
        group,
        type: parsed.type,
        placeId: parsed.placeId,
        coachPersonId,
        externalTeamIds: parsed.invitedExternalTeamIds ?? [],
      })
      const activeGroup = group as NonNullable<typeof group>
      // `match` / `sparring` on a class group already answered 422 `activity_type_requires_team` above.
      if (!EVENT_TYPES.includes(parsed.type)) {
        await activitiesErrors.throw('event_type_not_allowed', { type: parsed.type })
      }
      const startAt = new Date(parsed.startsAt)
      const endAt = new Date(parsed.endsAt)
      if (endAt.getTime() <= startAt.getTime()) await activitiesErrors.throw('activity_times_inverted')
      const { timeZone } = await clubClock(ctx.container, scope)
      const start = localDateTime(startAt, timeZone)
      const end = localDateTime(endAt, timeZone)
      await lockSchedule(em, organizationId)
      await assertNoConflicts(
        await findConflicts(
          ctx.container,
          em,
          scope,
          { candidates: [{ key: occurrenceId, startAt, endAt }], placeId: parsed.placeId, coachPersonId },
          'save',
        ),
      )
      const row = em.create(Activity, {
        id,
        ...scope,
        sectionId: activeGroup.sectionId,
        groupId: activeGroup.id,
        name: parsed.name,
        type: parsed.type,
        defaultPlaceId: parsed.placeId,
        defaultCoachPersonId: coachPersonId,
        invitedExternalTeamIds: [...new Set(parsed.invitedExternalTeamIds ?? [])],
        recurrenceRule: null,
        startsOn: start.date,
        endsOn: end.date,
        defaultStartTime: start.time,
        defaultEndTime: end.time,
        description: parsed.description ?? null,
        isActive: true,
      })
      em.persist(row)
      em.persist(
        em.create(Occurrence, {
          id: occurrenceId,
          ...scope,
          activityId: id,
          groupId: activeGroup.id,
          sectionId: activeGroup.sectionId,
          occurrenceDate: start.date,
          startAt,
          endAt,
          placeId: parsed.placeId,
          coachPersonId,
        }),
      )
      return { entity: row, actingRole: authorized.actingRole, before: null, occurrenceId }
    })
    const scope = { tenantId: result.entity.tenantId, organizationId: result.entity.organizationId }
    await emitAfterCommit('activities.activity.created', scope, { id: result.entity.id })
    await emitAfterCommit('activities.occurrence.generated', scope, {
      id: result.entity.id,
      createdIds: [result.occurrenceId],
      updatedIds: [],
      removedIds: [],
    })
    return result
  },
  buildLog: ({ result }) =>
    activitiesLog({
      result,
      resourceKind: ACTIVITY_RESOURCE_KIND,
      labelKey: 'activities.audit.events.create',
      fallback: 'Create a one-off event',
      after: activitySnapshot(result.entity),
      context: { occurrenceId: result.occurrenceId },
    }),
  async authorizeReplay({ ctx, logEntry }) {
    await authorizeEventReplay(ctx, logEntry.resourceId)
  },
  async undo({ ctx, logEntry }) {
    const row = await authorizeEventReplay(ctx, logEntry.resourceId)
    const em = ctx.transactionalEm as EntityManager
    const sessions = await em.find(Occurrence, {
      tenantId: row.tenantId,
      organizationId: row.organizationId,
      activityId: row.id,
      deletedAt: null,
    })
    if (sessions.some((session) => session.status !== 'planned')) await activitiesErrors.throw('activity_has_sessions')
    const now = new Date()
    for (const session of sessions) {
      session.deletedAt = now
      session.updatedAt = now
    }
    row.deletedAt = now
    row.updatedAt = now
    await em.flush()
    await emitAfterCommit(
      'activities.activity.deleted',
      { tenantId: row.tenantId, organizationId: row.organizationId },
      { id: row.id },
    )
  },
}

/** The undo of an event is authorized like its creation: a coach of the group, its coordinator, the administrator. */
async function authorizeEventReplay(
  ctx: Parameters<NonNullable<typeof createEventCommand.undo>>[0]['ctx'],
  id: string | null | undefined,
): Promise<Activity> {
  const em = ctx.transactionalEm
  if (!em || !id) throw new Error('[internal] event replay needs the replay transaction and the id')
  const tenantId = trustedTenantId(ctx)
  const authorized = await authorizeScoped(
    {
      input: z.object({ id: z.uuid() }),
      resourceKind: ACTIVITY_RESOURCE_KIND,
      allowedKinds: COACH_KINDS,
      loadTarget: (parsed, txEm, lock) =>
        tenantId ? txEm.findOne(Activity, { id: parsed.id, tenantId, deletedAt: null }, lock) : Promise.resolve(null),
      resolveTarget: (_parsed, entity) => scheduleTarget(entity as Activity),
    },
    { id },
    ctx,
    em,
    { mode: 'replay' },
  )
  return authorized.entity as Activity
}

registerCommand(createEventCommand)
