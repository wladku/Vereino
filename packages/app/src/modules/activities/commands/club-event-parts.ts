// `activities.club_event_parts.create|update|delete|cancel` (club events spec REQ-T02, REQ-T04, REQ-T07, DD-T01…DD-T07,
// DD-T09; TEST-T02, TEST-T05): the parts of a club event, written by its managers (the club administrator; a
// coordinator of the event's section). A part with a group is a one-off activity of that group (`club_event_id`, no
// rule, not away) with one session at the event's place, written by the single-event logic (`one-off-event.ts`): the
// group must belong to the event's section (422 `club_event_part_outside_section`), a club place is checked in full
// (place tree, capacity, occupancy, opening hours, coach), an external place for the coach only (DD-T07). An open part
// (no club group) keeps its own times and status and is allowed only at an external place (DD-T04). The part's title,
// type and visiting teams are copied to its activity in the same transaction (DD-T02). Every write locks the event row
// (`FOR UPDATE`), so a cancellation and a new part never interleave; a cancelled event takes no part write.
import { randomUUID } from 'node:crypto'
import type { EntityManager } from '@mikro-orm/postgresql'
import { registerCommand, type CommandHandler, type CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { z } from 'zod'
import { assertTransition, authorizeScoped, type TargetLock } from '@/modules/foundation'
import { activitiesErrors } from '../api/errors'
import { Activity, ClubEvent, ClubEventPart, Occurrence } from '../data/entities'
import {
  clubEventPartCancelSchema,
  clubEventPartCreateSchema,
  clubEventPartDeleteSchema,
  clubEventPartUpdateSchema,
} from '../data/validators'
import { sessionTransitions, typeAllowedForGroup, type ActivityType } from '../lib/activities-rules'
import { openPartProblem, partSectionProblem, partsLimitReached } from '../lib/club-events'
import { confirmByAt } from '../lib/confirm-by'
import { sessionChangeOf, type SessionChange } from '../lib/session-change'
import { CLUB_EVENT_MANAGE_KINDS, clubEventTarget } from '../services/club-event-scope'
import { findPlaces, type ActivitiesScope } from '../services/directory'
import { assertClubEventOpen, assertSessionsUnused } from './club-events'
import { writeOneOffEvent } from './one-off-event'
import { assertSessionFits, emitSessionUpdated, sessionFacts } from './occurrences'
import {
  activitiesLog,
  assertReferences,
  emitAfterCommit,
  inWriteTransaction,
  lookupGroup,
  selfPersonId,
  trustedTenantId,
  type ActivitiesCommandResult,
} from './shared'

export const CLUB_EVENT_PART_RESOURCE_KIND = 'activities.club_event_part'

export type ClubEventPartSnapshot = {
  id: string
  tenantId: string
  organizationId: string
  clubEventId: string
  title: string
  categoryLabel: string | null
  type: ActivityType
  activityId: string | null
  visitingTeamIds: string[]
  startsAt: string | null
  endsAt: string | null
  status: string | null
  cancelReason: string | null
  /** The session's gathering and deadline offsets before an update, so its undo restores them. */
  session?: { id: string; gatheringMinutesBefore: number | null; confirmByMinutesBefore: number | null } | null
  /** The activity's copied fields before an update. */
  activity?: { name: string; type: ActivityType; invitedExternalTeamIds: string[] } | null
}

export type ClubEventPartCommandResult = ActivitiesCommandResult<ClubEventPart, ClubEventPartSnapshot> & {
  occurrenceId: string | null
}

export function clubEventPartSnapshot(row: ClubEventPart): ClubEventPartSnapshot {
  return {
    id: row.id,
    tenantId: row.tenantId,
    organizationId: row.organizationId,
    clubEventId: row.clubEventId,
    title: row.title,
    categoryLabel: row.categoryLabel ?? null,
    type: row.type,
    activityId: row.activityId ?? null,
    visitingTeamIds: [...row.visitingTeamIds],
    startsAt: row.startsAt ? row.startsAt.toISOString() : null,
    endsAt: row.endsAt ? row.endsAt.toISOString() : null,
    status: row.status ?? null,
    cancelReason: row.cancelReason ?? null,
  }
}

function scopeOf(row: { tenantId: string; organizationId: string }): ActivitiesScope {
  return { tenantId: row.tenantId, organizationId: row.organizationId }
}

/** The part and its event as one versioned target: the part's `updated_at` is the lock token. */
type PartTarget = { updatedAt: Date; part: ClubEventPart; event: ClubEvent }

/** Loads the part of the event (its row `FOR UPDATE`) and locks the event row too; null answers 404. */
function loadPartTarget(ctx: CommandRuntimeContext, includeDeleted = false) {
  return async (
    em: EntityManager,
    clubEventId: string,
    partId: string,
    lock?: TargetLock,
  ): Promise<PartTarget | null> => {
    const tenantId = trustedTenantId(ctx)
    if (!tenantId) return null
    const event = await em.findOne(ClubEvent, { id: clubEventId, tenantId, deletedAt: null }, lock)
    if (!event) return null
    const part = await em.findOne(
      ClubEventPart,
      {
        id: partId,
        tenantId,
        organizationId: event.organizationId,
        clubEventId: event.id,
        ...(includeDeleted ? {} : { deletedAt: null }),
      },
      lock,
    )
    return part ? { updatedAt: part.updatedAt, part, event } : null
  }
}

function partSpec<TSchema extends z.ZodType<{ clubEventId: string; id: string }>>(
  ctx: CommandRuntimeContext,
  input: TSchema,
  includeDeleted = false,
) {
  const load = loadPartTarget(ctx, includeDeleted)
  return {
    input,
    resourceKind: CLUB_EVENT_PART_RESOURCE_KIND,
    allowedKinds: CLUB_EVENT_MANAGE_KINDS,
    loadTarget: (parsed: z.output<TSchema>, em: EntityManager, lock: TargetLock) =>
      load(em, parsed.clubEventId, parsed.id, lock),
    resolveTarget: (_parsed: z.output<TSchema>, entity: PartTarget | null) =>
      clubEventTarget((entity as PartTarget).event),
  }
}

async function authorizePartReplay(
  ctx: CommandRuntimeContext,
  snapshot: { id?: string; clubEventId?: string } | null | undefined,
  includeDeleted = false,
): Promise<PartTarget> {
  const em = ctx.transactionalEm
  if (!em || !snapshot?.id || !snapshot.clubEventId) {
    throw new Error('[internal] part replay needs the replay transaction and the ids')
  }
  const authorized = await authorizeScoped(
    partSpec(ctx, z.object({ clubEventId: z.uuid(), id: z.uuid() }), includeDeleted),
    { clubEventId: snapshot.clubEventId, id: snapshot.id },
    ctx,
    em,
    { mode: 'replay' },
  )
  return authorized.entity as PartTarget
}

/** The part's activity and session (a part with a group), or nulls (an open part). */
async function partSessionOf(
  em: EntityManager,
  part: ClubEventPart,
  includeDeleted = false,
): Promise<{ activity: Activity | null; session: Occurrence | null }> {
  if (!part.activityId) return { activity: null, session: null }
  const scope = scopeOf(part)
  const activity = await em.findOne(Activity, { ...scope, id: part.activityId })
  const session = await em.findOne(Occurrence, {
    ...scope,
    activityId: part.activityId,
    ...(includeDeleted ? {} : { deletedAt: null }),
  })
  return { activity, session }
}

async function placeIsExternal(
  ctx: CommandRuntimeContext,
  em: EntityManager,
  scope: ActivitiesScope,
  placeId: string,
): Promise<boolean> {
  return (await findPlaces(ctx.container, scope, [placeId], em)).get(placeId)?.isExternal === true
}

/** The live visiting teams must exist (422 `activities_reference_invalid` naming `externalTeamIds`). */
async function assertTeams(
  ctx: CommandRuntimeContext,
  em: EntityManager,
  scope: ActivitiesScope,
  teamIds: readonly string[] | undefined,
): Promise<void> {
  if (teamIds && teamIds.length > 0) await assertReferences(ctx, em, scope, { externalTeamIds: teamIds })
}

const createPartCommand: CommandHandler<Record<string, unknown>, ClubEventPartCommandResult> = {
  id: 'activities.club_event_parts.create',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const id = randomUUID()
    const result = await inWriteTransaction(ctx, 'activities.club_event_parts.create', async (em) => {
      const authorized = await authorizeScoped(
        {
          input: clubEventPartCreateSchema,
          resourceKind: CLUB_EVENT_PART_RESOURCE_KIND,
          allowedKinds: CLUB_EVENT_MANAGE_KINDS,
          loadTarget: async (parsed, txEm, lock) => {
            const tenantId = trustedTenantId(ctx)
            return tenantId
              ? txEm.findOne(ClubEvent, { id: parsed.clubEventId, tenantId, deletedAt: null }, lock)
              : null
          },
          // Adding a part appends to the event: no version of the event is asked for.
          lock: 'none',
          resolveTarget: (_parsed, entity) => clubEventTarget(entity as ClubEvent),
        },
        rawInput,
        ctx,
        em,
      )
      const event = authorized.entity as ClubEvent
      const parsed = authorized.parsed
      const scope = scopeOf(event)
      await assertClubEventOpen(event)
      const live = await em.count(ClubEventPart, { ...scope, clubEventId: event.id, deletedAt: null })
      if (partsLimitReached(live)) await activitiesErrors.throw('club_event_parts_limit')
      const external = await placeIsExternal(ctx, em, scope, event.placeId)
      const visitingTeamIds = [...new Set(parsed.visitingTeamIds ?? [])]
      const startAt = new Date(parsed.startsAt)
      const endAt = new Date(parsed.endsAt)
      let activityId: string | null = null
      let occurrenceId: string | null = null
      if (parsed.groupId) {
        const group = await lookupGroup(ctx, parsed.groupId, em)
        await assertReferences(ctx, em, scope, {
          group,
          type: parsed.type,
          coachPersonId: parsed.coachPersonId ?? null,
          externalTeamIds: visitingTeamIds,
        })
        const activeGroup = group as NonNullable<typeof group>
        const problem = partSectionProblem(event.sectionId ?? null, activeGroup.sectionId)
        if (problem) await activitiesErrors.throw(problem, { field: 'groupId' })
        activityId = randomUUID()
        occurrenceId = randomUUID()
        await writeOneOffEvent(ctx, em, scope, {
          id: activityId,
          occurrenceId,
          group: activeGroup,
          name: parsed.title,
          type: parsed.type,
          placeId: event.placeId,
          venue: null,
          coachPersonId: parsed.coachPersonId ?? null,
          startAt,
          endAt,
          gatheringMinutesBefore:
            parsed.gatheringMinutesBefore !== undefined
              ? parsed.gatheringMinutesBefore
              : (event.gatheringMinutesBefore ?? null),
          confirmByMinutesBefore:
            parsed.confirmByMinutesBefore !== undefined
              ? parsed.confirmByMinutesBefore
              : (event.confirmByMinutesBefore ?? null),
          description: null,
          opponentExternalTeamId: null,
          invitedExternalTeamIds: visitingTeamIds,
          isAway: false,
          clubEventId: event.id,
          coachOnly: external,
        })
      } else {
        // DD-T04: an open part holds no place, so it is allowed only at an external place.
        const problem = openPartProblem(false, external)
        if (problem) await activitiesErrors.throw(problem, { field: 'groupId' })
        if (endAt.getTime() <= startAt.getTime()) await activitiesErrors.throw('activity_times_inverted')
        await assertTeams(ctx, em, scope, visitingTeamIds)
      }
      const row = em.create(ClubEventPart, {
        id,
        ...scope,
        clubEventId: event.id,
        title: parsed.title,
        categoryLabel: parsed.categoryLabel ?? null,
        type: parsed.type,
        activityId,
        visitingTeamIds,
        startsAt: activityId ? null : startAt,
        endsAt: activityId ? null : endAt,
        status: activityId ? null : 'planned',
        cancelReason: null,
      })
      em.persist(row)
      return { entity: row, actingRole: authorized.actingRole, before: null, occurrenceId }
    })
    const part = result.entity
    if (part.activityId && result.occurrenceId) {
      await emitAfterCommit('activities.activity.created', scopeOf(part), { id: part.activityId })
      await emitAfterCommit('activities.occurrence.generated', scopeOf(part), {
        id: part.activityId,
        createdIds: [result.occurrenceId],
        updatedIds: [],
        removedIds: [],
      })
    }
    return result
  },
  buildLog: ({ result }) =>
    activitiesLog({
      result,
      resourceKind: CLUB_EVENT_PART_RESOURCE_KIND,
      labelKey: 'activities.audit.clubEventParts.create',
      fallback: 'Add a part to a club event',
      after: clubEventPartSnapshot(result.entity),
      parent: { resourceKind: 'activities.club_event', resourceId: result.entity.clubEventId },
      context: { activityId: result.entity.activityId ?? null, occurrenceId: result.occurrenceId },
    }),
  async authorizeReplay({ ctx, logEntry }) {
    const after = logEntry.snapshotAfter as ClubEventPartSnapshot | null | undefined
    await authorizePartReplay(ctx, after)
  },
  async undo({ ctx, logEntry }) {
    const after = logEntry.snapshotAfter as ClubEventPartSnapshot | null | undefined
    const { part } = await authorizePartReplay(ctx, after)
    await removePart(ctx.transactionalEm as EntityManager, part)
  },
}

/** Soft-deletes a part with its activity and session (refused once the session is in use); emits after commit. */
async function removePart(em: EntityManager, part: ClubEventPart): Promise<string[]> {
  const { activity, session } = await partSessionOf(em, part)
  await assertSessionsUnused(em, part, session ? [session] : [])
  const now = new Date()
  for (const entity of [session, activity, part]) {
    if (!entity) continue
    entity.deletedAt = now
    entity.updatedAt = now
  }
  await em.flush()
  if (activity) {
    await emitAfterCommit('activities.activity.deleted', scopeOf(part), { id: activity.id })
    if (session) {
      await emitAfterCommit('activities.occurrence.generated', scopeOf(part), {
        id: activity.id,
        createdIds: [],
        updatedIds: [],
        removedIds: [session.id],
      })
    }
  }
  return session ? [session.id] : []
}

const updatePartCommand: CommandHandler<
  Record<string, unknown>,
  ClubEventPartCommandResult & { change: SessionChange | null; session: Occurrence | null }
> = {
  id: 'activities.club_event_parts.update',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const result = await inWriteTransaction(ctx, 'activities.club_event_parts.update', async (em) => {
      const authorized = await authorizeScoped(partSpec(ctx, clubEventPartUpdateSchema), rawInput, ctx, em)
      const { part, event } = authorized.entity as PartTarget
      const patch = authorized.parsed
      const scope = scopeOf(part)
      await assertClubEventOpen(event)
      const { activity, session } = await partSessionOf(em, part)
      // Q-T06: the group of a part is fixed; an open part never gains one.
      if (patch.groupId !== undefined && patch.groupId !== (activity?.groupId ?? null)) {
        await activitiesErrors.throw('club_event_part_group_fixed', { field: 'groupId' })
      }
      // A part with a group moves through its session (the session edit), never through its own times.
      if (activity && (patch.startsAt !== undefined || patch.endsAt !== undefined)) {
        await activitiesErrors.throw('club_event_part_has_session', { field: 'startsAt' })
      }
      const type = patch.type ?? part.type
      if (activity && patch.type !== undefined) {
        const group = await lookupGroup(ctx, activity.groupId, em)
        if (group && !typeAllowedForGroup(type, group.kind)) {
          await activitiesErrors.throw('activity_type_requires_team', { type })
        }
      }
      await assertTeams(ctx, em, scope, patch.visitingTeamIds)
      const before: ClubEventPartSnapshot = {
        ...clubEventPartSnapshot(part),
        session: session
          ? {
              id: session.id,
              gatheringMinutesBefore: session.gatheringMinutesBefore ?? null,
              confirmByMinutesBefore: session.confirmByMinutesBefore ?? null,
            }
          : null,
        activity: activity
          ? { name: activity.name, type: activity.type, invitedExternalTeamIds: [...activity.invitedExternalTeamIds] }
          : null,
      }
      const now = new Date()
      if (patch.title !== undefined) part.title = patch.title
      if (patch.categoryLabel !== undefined) part.categoryLabel = patch.categoryLabel
      part.type = type
      if (patch.visitingTeamIds !== undefined) part.visitingTeamIds = [...new Set(patch.visitingTeamIds)]
      if (!activity) {
        const startAt = patch.startsAt ? new Date(patch.startsAt) : (part.startsAt as Date)
        const endAt = patch.endsAt ? new Date(patch.endsAt) : (part.endsAt as Date)
        if (endAt.getTime() <= startAt.getTime()) await activitiesErrors.throw('activity_times_inverted')
        part.startsAt = startAt
        part.endsAt = endAt
      }
      part.updatedAt = now
      let change: SessionChange | null = null
      if (activity) {
        // DD-T02: the copies on the part's activity follow the part in the same transaction.
        activity.name = part.title
        activity.type = part.type
        activity.invitedExternalTeamIds = [...part.visitingTeamIds]
        if (patch.gatheringMinutesBefore !== undefined) activity.gatheringMinutesBefore = patch.gatheringMinutesBefore
        if (patch.confirmByMinutesBefore !== undefined) activity.confirmByMinutesBefore = patch.confirmByMinutesBefore
        activity.updatedAt = now
        if (session && session.status === 'planned') {
          const beforeFacts = sessionFacts(session)
          if (patch.gatheringMinutesBefore !== undefined) {
            session.gatheringMinutesBefore = patch.gatheringMinutesBefore
          }
          if (patch.confirmByMinutesBefore !== undefined) {
            // REQ-A07: a new deadline must still be ahead.
            const confirmBy = confirmByAt(session.startAt, patch.confirmByMinutesBefore)
            if (confirmBy && confirmBy.getTime() < now.getTime()) {
              await activitiesErrors.throw('occurrence_confirm_by_in_past')
            }
            session.confirmByMinutesBefore = patch.confirmByMinutesBefore
          }
          session.updatedAt = now
          change = sessionChangeOf(beforeFacts, sessionFacts(session), now)
        }
      }
      return {
        entity: part,
        actingRole: authorized.actingRole,
        before,
        occurrenceId: session?.id ?? null,
        change,
        session,
        actorPersonId: selfPersonId(authorized.scope),
      }
    })
    // REQ-A09: a changed gathering time of a future part session is announced like a session edit.
    if (result.session && result.change) {
      await emitSessionUpdated(result.session, result.change, {
        userId: ctx.auth?.sub ?? null,
        personId: result.actorPersonId,
        actingRole: result.actingRole,
      })
    }
    return result
  },
  buildLog: ({ result }) =>
    activitiesLog({
      result,
      resourceKind: CLUB_EVENT_PART_RESOURCE_KIND,
      labelKey: 'activities.audit.clubEventParts.update',
      fallback: 'Change a part of a club event',
      after: clubEventPartSnapshot(result.entity),
      parent: { resourceKind: 'activities.club_event', resourceId: result.entity.clubEventId },
    }),
  async authorizeReplay({ ctx, logEntry }) {
    await authorizePartReplay(ctx, logEntry.snapshotBefore as ClubEventPartSnapshot | null)
  },
  async undo({ ctx, logEntry }) {
    const before = logEntry.snapshotBefore as ClubEventPartSnapshot | null | undefined
    const { part } = await authorizePartReplay(ctx, before)
    const snapshot = before as ClubEventPartSnapshot
    const em = ctx.transactionalEm as EntityManager
    const { activity, session } = await partSessionOf(em, part)
    const now = new Date()
    part.title = snapshot.title
    part.categoryLabel = snapshot.categoryLabel
    part.type = snapshot.type
    part.visitingTeamIds = [...snapshot.visitingTeamIds]
    part.startsAt = snapshot.startsAt ? new Date(snapshot.startsAt) : null
    part.endsAt = snapshot.endsAt ? new Date(snapshot.endsAt) : null
    part.updatedAt = now
    if (activity && snapshot.activity) {
      activity.name = snapshot.activity.name
      activity.type = snapshot.activity.type
      activity.invitedExternalTeamIds = [...snapshot.activity.invitedExternalTeamIds]
      activity.updatedAt = now
    }
    if (session && snapshot.session && session.id === snapshot.session.id) {
      session.gatheringMinutesBefore = snapshot.session.gatheringMinutesBefore
      session.confirmByMinutesBefore = snapshot.session.confirmByMinutesBefore
      session.updatedAt = now
    }
    await em.flush()
  },
}

const deletePartCommand: CommandHandler<Record<string, unknown>, ClubEventPartCommandResult> = {
  id: 'activities.club_event_parts.delete',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    let removed: string[] = []
    const result = await inWriteTransaction(ctx, 'activities.club_event_parts.delete', async (em) => {
      const authorized = await authorizeScoped(partSpec(ctx, clubEventPartDeleteSchema), rawInput, ctx, em)
      const { part, event } = authorized.entity as PartTarget
      await assertClubEventOpen(event)
      const before = clubEventPartSnapshot(part)
      const { activity, session } = await partSessionOf(em, part)
      await assertSessionsUnused(em, part, session ? [session] : [])
      const now = new Date()
      for (const entity of [session, activity, part]) {
        if (!entity) continue
        entity.deletedAt = now
        entity.updatedAt = now
      }
      removed = session ? [session.id] : []
      return { entity: part, actingRole: authorized.actingRole, before, occurrenceId: session?.id ?? null }
    })
    const part = result.entity
    if (part.activityId) {
      await emitAfterCommit('activities.activity.deleted', scopeOf(part), { id: part.activityId })
      if (removed.length > 0) {
        await emitAfterCommit('activities.occurrence.generated', scopeOf(part), {
          id: part.activityId,
          createdIds: [],
          updatedIds: [],
          removedIds: removed,
        })
      }
    }
    return result
  },
  buildLog: ({ result }) =>
    activitiesLog({
      result,
      resourceKind: CLUB_EVENT_PART_RESOURCE_KIND,
      labelKey: 'activities.audit.clubEventParts.delete',
      fallback: 'Remove a part of a club event',
      after: null,
      parent: { resourceKind: 'activities.club_event', resourceId: result.entity.clubEventId },
      context: { occurrenceId: result.occurrenceId },
    }),
  async authorizeReplay({ ctx, logEntry }) {
    await authorizePartReplay(ctx, logEntry.snapshotBefore as ClubEventPartSnapshot | null, true)
  },
  async undo({ ctx, logEntry }) {
    const before = logEntry.snapshotBefore as ClubEventPartSnapshot | null | undefined
    const { part, event } = await authorizePartReplay(ctx, before, true)
    const em = ctx.transactionalEm as EntityManager
    await assertClubEventOpen(event)
    const { activity, session } = await partSessionOf(em, part, true)
    const now = new Date()
    for (const entity of [session, activity, part]) {
      if (!entity) continue
      entity.deletedAt = null
      entity.updatedAt = now
    }
    await em.flush()
    // The restored session goes back on the schedule, so it must still fit its place and coach.
    if (session) await assertSessionFits(ctx, em, session)
    if (activity) {
      await emitAfterCommit('activities.activity.created', scopeOf(part), { id: activity.id })
      if (session) {
        await emitAfterCommit('activities.occurrence.generated', scopeOf(part), {
          id: activity.id,
          createdIds: [session.id],
          updatedIds: [],
          removedIds: [],
        })
      }
    }
  },
}

const cancelPartCommand: CommandHandler<Record<string, unknown>, ClubEventPartCommandResult> = {
  id: 'activities.club_event_parts.cancel',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    return inWriteTransaction(ctx, 'activities.club_event_parts.cancel', async (em) => {
      const authorized = await authorizeScoped(partSpec(ctx, clubEventPartCancelSchema), rawInput, ctx, em)
      const { part, event } = authorized.entity as PartTarget
      await assertClubEventOpen(event)
      // A part with a group is cancelled through its session (`activities.occurrences.cancel`) and its notices.
      if (part.activityId) return activitiesErrors.throw('club_event_part_has_session')
      await assertTransition(sessionTransitions, part.status ?? 'planned', 'cancelled')
      const before = clubEventPartSnapshot(part)
      part.status = 'cancelled'
      part.cancelReason = authorized.parsed.reason
      part.updatedAt = new Date()
      return { entity: part, actingRole: authorized.actingRole, before, occurrenceId: null }
    })
  },
  buildLog: ({ result }) =>
    activitiesLog({
      result,
      resourceKind: CLUB_EVENT_PART_RESOURCE_KIND,
      labelKey: 'activities.audit.clubEventParts.cancel',
      fallback: 'Cancel an open part of a club event',
      after: clubEventPartSnapshot(result.entity),
      parent: { resourceKind: 'activities.club_event', resourceId: result.entity.clubEventId },
    }),
  async authorizeReplay({ ctx, logEntry }) {
    await authorizePartReplay(ctx, logEntry.snapshotBefore as ClubEventPartSnapshot | null)
  },
  async undo({ ctx, logEntry }) {
    const before = logEntry.snapshotBefore as ClubEventPartSnapshot | null | undefined
    const { part, event } = await authorizePartReplay(ctx, before)
    const em = ctx.transactionalEm as EntityManager
    await assertClubEventOpen(event)
    part.status = 'planned'
    part.cancelReason = null
    part.updatedAt = new Date()
    await em.flush()
  },
}

registerCommand(createPartCommand)
registerCommand(updatePartCommand)
registerCommand(deletePartCommand)
registerCommand(cancelPartCommand)
