// `activities.club_events.create|update|cancel` (club events spec REQ-T01, REQ-T05, DD-T01, DD-T05, DD-T06, DD-T13,
// DD-T14; TEST-T01, TEST-T06): a club event of the club administrator (whole club or a section) or of a section's
// coordinator (own section only; 403 `scope_denied` otherwise). Its place is a live active leaf of the club's places,
// own or external. Changing the place moves every planned future part session after the collision check of each (409
// with every collision, nothing saved; an open part blocks a club place, 422
// `club_event_open_part_needs_external_place`) and announces each move as a session move does (REQ-A09). Cancelling
// the event cancels every planned future part session as the session cancellation does (its notices unchanged) and
// every planned open part; a cancelled event takes no further write (409 `club_event_cancelled`). The parts live in
// `club-event-parts.ts`.
import { randomUUID } from 'node:crypto'
import type { EntityManager } from '@mikro-orm/postgresql'
import { registerCommand, type CommandHandler, type CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { z } from 'zod'
import { findActingRole, type Scope } from '@vereino/core'
import { authorizeScoped, foundationErrors, type TargetLock } from '@/modules/foundation'
import { activitiesErrors } from '../api/errors'
import { Activity, Attendance, ClubEvent, ClubEventPart, Occurrence } from '../data/entities'
import { lockSchedule } from '../data/queries'
import { clubEventCancelSchema, clubEventCreateSchema, clubEventUpdateSchema } from '../data/validators'
import { futurePlannedSessions, openPartProblem, proposeClubEventSlug, sectionChangeProblem } from '../lib/club-events'
import { eventOutsideOpeningHours, openingLine } from '../lib/opening-hours'
import { sessionChangeOf, type SessionChange } from '../lib/session-change'
import { CLUB_EVENT_MANAGE_KINDS, clubEventTarget } from '../services/club-event-scope'
import { clubClock, findPlaces, findSections, placeOpeningHours, type ActivitiesScope } from '../services/directory'
import { findConflicts, type ConflictEntry } from '../services/schedule'
import { assertSessionFits, emitSessionUpdated, sessionFacts } from './occurrences'
import {
  activitiesLog,
  assertReferences,
  emitAfterCommit,
  inWriteTransaction,
  selfPersonId,
  trustedTenantId,
  type ActivitiesCommandResult,
} from './shared'

export const CLUB_EVENT_RESOURCE_KIND = 'activities.club_event'

export type ClubEventSnapshot = {
  id: string
  tenantId: string
  organizationId: string
  sectionId: string | null
  name: string
  publicSlug: string
  description: string | null
  placeId: string
  gatheringMinutesBefore: number | null
  confirmByMinutesBefore: number | null
  isPublic: boolean
  status: string
  cancelReason: string | null
  /** The part sessions an update moved to the new place or a cancellation cancelled, so the undo reverses exactly them. */
  sessionIds?: string[]
  /** The open parts a cancellation cancelled. */
  openPartIds?: string[]
}

export type ClubEventCommandResult = ActivitiesCommandResult<ClubEvent, ClubEventSnapshot> & {
  /** The part sessions the write moved (update) or cancelled (cancel). */
  sessionIds: string[]
}

export function clubEventSnapshot(row: ClubEvent): ClubEventSnapshot {
  return {
    id: row.id,
    tenantId: row.tenantId,
    organizationId: row.organizationId,
    sectionId: row.sectionId ?? null,
    name: row.name,
    publicSlug: row.publicSlug,
    description: row.description ?? null,
    placeId: row.placeId,
    gatheringMinutesBefore: row.gatheringMinutesBefore ?? null,
    confirmByMinutesBefore: row.confirmByMinutesBefore ?? null,
    isPublic: row.isPublic,
    status: row.status,
    cancelReason: row.cancelReason ?? null,
  }
}

function restoreClubEvent(row: ClubEvent, before: ClubEventSnapshot): void {
  row.sectionId = before.sectionId
  row.name = before.name
  row.publicSlug = before.publicSlug
  row.description = before.description
  row.placeId = before.placeId
  row.gatheringMinutesBefore = before.gatheringMinutesBefore
  row.confirmByMinutesBefore = before.confirmByMinutesBefore
  row.isPublic = before.isPublic
  row.status = before.status === 'cancelled' ? 'cancelled' : 'planned'
  row.cancelReason = before.cancelReason
}

/** Loads a live club event of the trusted tenant (with the lock `authorizeScoped` passes), or null. */
export function loadClubEvent(ctx: CommandRuntimeContext, includeDeleted = false) {
  return (em: EntityManager, id: string, lock?: TargetLock): Promise<ClubEvent | null> => {
    const tenantId = trustedTenantId(ctx)
    if (!tenantId) return Promise.resolve(null)
    return em.findOne(ClubEvent, { id, tenantId, ...(includeDeleted ? {} : { deletedAt: null }) }, lock)
  }
}

/** The replay of a club event write is authorized like the write: its managers. */
export async function authorizeClubEventReplay(
  ctx: CommandRuntimeContext,
  id: string | null | undefined,
  includeDeleted = false,
): Promise<{ row: ClubEvent; scope: Scope; actingRole: string }> {
  const em = ctx.transactionalEm
  if (!em || !id) throw new Error('[internal] club event replay needs the replay transaction and the id')
  const load = loadClubEvent(ctx, includeDeleted)
  const authorized = await authorizeScoped(
    {
      input: z.object({ id: z.uuid() }),
      resourceKind: CLUB_EVENT_RESOURCE_KIND,
      allowedKinds: CLUB_EVENT_MANAGE_KINDS,
      loadTarget: (parsed, txEm, lock) => load(txEm, parsed.id, lock),
      resolveTarget: (_parsed, entity) => clubEventTarget(entity as ClubEvent),
    },
    { id },
    ctx,
    em,
    { mode: 'replay' },
  )
  return { row: authorized.entity as ClubEvent, scope: authorized.scope, actingRole: authorized.actingRole }
}

/** A cancelled club event takes no further write (glossary *Cancelling the club event*). */
export async function assertClubEventOpen(row: ClubEvent): Promise<void> {
  if (row.status === 'cancelled') await activitiesErrors.throw('club_event_cancelled')
}

/** 409 `club_event_slug_taken` when another live club event of the club uses the slug. */
async function assertSlugFree(em: EntityManager, scope: ActivitiesScope, slug: string, selfId: string): Promise<void> {
  const other = await em.findOne(
    ClubEvent,
    { ...scope, publicSlug: slug, deletedAt: null, id: { $ne: selfId } },
    { fields: ['id'] },
  )
  if (other) await activitiesErrors.throw('club_event_slug_taken', { field: 'publicSlug' })
}

/** A live active section of the club (422 `activities_reference_invalid` naming `sectionId` otherwise). */
async function assertSection(
  ctx: CommandRuntimeContext,
  em: EntityManager,
  scope: ActivitiesScope,
  sectionId: string | null,
): Promise<void> {
  if (!sectionId) return
  const section = (await findSections(ctx.container, scope, [sectionId], em)).get(sectionId)
  if (!section?.isActive) {
    await activitiesErrors.throw('activities_reference_invalid', { field: 'sectionId' })
  }
}

/** The event's place: a live active leaf (404 / 422 `place_not_bookable`), and whether it is external. */
async function eventPlace(
  ctx: CommandRuntimeContext,
  em: EntityManager,
  scope: ActivitiesScope,
  placeId: string,
): Promise<{ isExternal: boolean }> {
  await assertReferences(ctx, em, scope, { placeId })
  const place = (await findPlaces(ctx.container, scope, [placeId], em)).get(placeId)
  return { isExternal: place?.isExternal === true }
}

/** The live parts of a club event with their activities and sessions. */
export async function eventParts(
  em: EntityManager,
  event: Pick<ClubEvent, 'id' | 'tenantId' | 'organizationId'>,
  includeDeleted = false,
): Promise<{ parts: ClubEventPart[]; activities: Activity[]; sessions: Occurrence[] }> {
  const scope = { tenantId: event.tenantId, organizationId: event.organizationId }
  const parts = await em.find(
    ClubEventPart,
    { ...scope, clubEventId: event.id, ...(includeDeleted ? {} : { deletedAt: null }) },
    { orderBy: { createdAt: 'asc' } },
  )
  const activityIds = parts.flatMap((part) => (part.activityId ? [part.activityId] : []))
  if (activityIds.length === 0) return { parts, activities: [], sessions: [] }
  const activities = await em.find(Activity, { ...scope, id: { $in: activityIds } })
  const sessions = await em.find(
    Occurrence,
    { ...scope, activityId: { $in: activityIds }, ...(includeDeleted ? {} : { deletedAt: null }) },
    { orderBy: { startAt: 'asc' } },
  )
  return { parts, activities, sessions }
}

/** Who changed the event, for the session notices (REQ-A09) and the cancellation payload (#139). */
type Actor = { userId: string | null; personId: string | null; actingRole: string }

const createClubEventCommand: CommandHandler<Record<string, unknown>, ClubEventCommandResult> = {
  id: 'activities.club_events.create',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const id = randomUUID()
    return inWriteTransaction(ctx, 'activities.club_events.create', async (em) => {
      const authorized = await authorizeScoped(
        {
          input: clubEventCreateSchema,
          resourceKind: CLUB_EVENT_RESOURCE_KIND,
          allowedKinds: CLUB_EVENT_MANAGE_KINDS,
          resolveTarget: (parsed, _entity, scope) => clubEventTarget({ id, ...scope, sectionId: parsed.sectionId }),
        },
        rawInput,
        ctx,
        em,
      )
      const { parsed, tenantId, organizationId } = authorized
      const scope = { tenantId, organizationId }
      await assertSection(ctx, em, scope, parsed.sectionId)
      await eventPlace(ctx, em, scope, parsed.placeId)
      const slug = parsed.publicSlug ?? proposeClubEventSlug(parsed.name)
      if (!slug) return activitiesErrors.throw('club_event_slug_invalid', { field: 'publicSlug' })
      await assertSlugFree(em, scope, slug, id)
      const row = em.create(ClubEvent, {
        id,
        ...scope,
        sectionId: parsed.sectionId,
        name: parsed.name,
        publicSlug: slug,
        description: parsed.description ?? null,
        placeId: parsed.placeId,
        gatheringMinutesBefore: parsed.gatheringMinutesBefore ?? null,
        confirmByMinutesBefore: parsed.confirmByMinutesBefore ?? null,
        isPublic: parsed.isPublic ?? false,
        status: 'planned',
        cancelReason: null,
      })
      em.persist(row)
      return { entity: row, actingRole: authorized.actingRole, before: null, sessionIds: [] }
    })
  },
  buildLog: ({ result }) =>
    activitiesLog({
      result,
      resourceKind: CLUB_EVENT_RESOURCE_KIND,
      labelKey: 'activities.audit.clubEvents.create',
      fallback: 'Create a club event',
      after: clubEventSnapshot(result.entity),
    }),
  async authorizeReplay({ ctx, logEntry }) {
    await authorizeClubEventReplay(ctx, logEntry.resourceId)
  },
  async undo({ ctx, logEntry }) {
    // The undo removes the event and its parts while every part session is planned and nobody declared (the API
    // table: "undoable while every part session is planned without declarations").
    const { row } = await authorizeClubEventReplay(ctx, logEntry.resourceId)
    const em = ctx.transactionalEm as EntityManager
    const { parts, activities, sessions } = await eventParts(em, row)
    await assertSessionsUnused(em, row, sessions)
    const now = new Date()
    for (const entity of [...sessions, ...activities, ...parts, row]) {
      entity.deletedAt = now
      entity.updatedAt = now
    }
    await em.flush()
    const scope = { tenantId: row.tenantId, organizationId: row.organizationId }
    for (const activity of activities) await emitAfterCommit('activities.activity.deleted', scope, { id: activity.id })
  },
}

/**
 * 409 `club_event_part_in_use` when a session is no longer planned or anyone declared or was checked off for it
 * (glossary *Removing a part*).
 */
export async function assertSessionsUnused(
  em: EntityManager,
  event: Pick<ClubEvent, 'tenantId' | 'organizationId'>,
  sessions: readonly Occurrence[],
): Promise<void> {
  if (sessions.length === 0) return
  if (sessions.some((session) => session.status !== 'planned')) {
    await activitiesErrors.throw('club_event_part_in_use')
  }
  const used = await em.count(Attendance, {
    tenantId: event.tenantId,
    organizationId: event.organizationId,
    occurrenceId: { $in: sessions.map((session) => session.id) },
    deletedAt: null,
  })
  if (used > 0) await activitiesErrors.throw('club_event_part_in_use')
}

/**
 * Moves the planned future part sessions to `placeId` (glossary *Event place*): each is checked against the place tree,
 * the capacity, the occupancy provider and the opening hours of a club place, and against its coach — the coach only at
 * an external place (DD-T07). Every collision is collected and the write refused as a whole (409 with the list).
 * Returns the moved sessions with their announced change.
 */
async function moveSessionsToPlace(
  ctx: CommandRuntimeContext,
  em: EntityManager,
  event: ClubEvent,
  sessions: readonly Occurrence[],
  activities: readonly Activity[],
  placeId: string,
  isExternal: boolean,
): Promise<{ moved: Occurrence[]; changes: Map<string, SessionChange | null> }> {
  const scope = { tenantId: event.tenantId, organizationId: event.organizationId }
  const moved = futurePlannedSessions(sessions, new Date())
  const changes = new Map<string, SessionChange | null>()
  if (moved.length === 0) return { moved, changes }
  await lockSchedule(em, event.organizationId)
  if (!isExternal) {
    const hours = (await placeOpeningHours(ctx.container, scope, [placeId], em)).get(placeId) ?? null
    const { timeZone } = await clubClock(ctx.container, scope, undefined, em)
    for (const session of moved) {
      const opening = eventOutsideOpeningHours(hours, session.startAt, session.endAt, timeZone)
      if (opening) {
        await activitiesErrors.throw('event_place_closed', {
          field: 'placeId',
          occurrenceId: session.id,
          opening,
          hours: openingLine(opening),
        })
      }
    }
  }
  const updatedAt = new Date()
  const conflicts: ConflictEntry[] = []
  for (const session of moved) {
    const before = sessionFacts(session)
    session.placeId = placeId
    session.venueName = null
    session.venueAddress = null
    session.updatedAt = updatedAt
    changes.set(session.id, sessionChangeOf(before, sessionFacts(session), updatedAt))
  }
  // The moved sessions are written first, so each is checked against the others at the new place too.
  await em.flush()
  for (const session of moved) {
    const report = await findConflicts(
      ctx.container,
      em,
      scope,
      {
        candidates: [{ key: session.id, startAt: session.startAt, endAt: session.endAt }],
        placeId: isExternal ? null : placeId,
        coachPersonId: session.coachPersonId ?? null,
        ignoreIds: [session.id],
      },
      'save',
    )
    conflicts.push(...report.conflicts)
  }
  if (conflicts.length > 0) {
    const code = conflicts.some((conflict) => conflict.kind === 'place')
      ? 'occurrence_place_conflict'
      : 'occurrence_coach_conflict'
    await activitiesErrors.throw(code, { conflicts })
  }
  const movedActivityIds = new Set(moved.map((session) => session.activityId))
  for (const activity of activities) {
    if (!movedActivityIds.has(activity.id)) continue
    activity.defaultPlaceId = placeId
    activity.venueName = null
    activity.venueAddress = null
    activity.updatedAt = updatedAt
  }
  return { moved, changes }
}

const updateClubEventCommand: CommandHandler<
  Record<string, unknown>,
  ClubEventCommandResult & { changes: Map<string, SessionChange | null> }
> = {
  id: 'activities.club_events.update',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const load = loadClubEvent(ctx)
    const result = await inWriteTransaction(ctx, 'activities.club_events.update', async (em) => {
      const authorized = await authorizeScoped(
        {
          input: clubEventUpdateSchema,
          resourceKind: CLUB_EVENT_RESOURCE_KIND,
          allowedKinds: CLUB_EVENT_MANAGE_KINDS,
          loadTarget: (parsed, txEm, lock) => load(txEm, parsed.id, lock),
          resolveTarget: (_parsed, entity) => clubEventTarget(entity as ClubEvent),
        },
        rawInput,
        ctx,
        em,
      )
      const row = authorized.entity as ClubEvent
      const patch = authorized.parsed
      const scope = { tenantId: row.tenantId, organizationId: row.organizationId }
      await assertClubEventOpen(row)
      const before = clubEventSnapshot(row)
      const { parts, activities, sessions } = await eventParts(em, row)
      if (patch.sectionId !== undefined && patch.sectionId !== (row.sectionId ?? null)) {
        const problem = sectionChangeProblem(row.sectionId ?? null, patch.sectionId, parts.length)
        if (problem) await activitiesErrors.throw(problem)
        // The new section must be the caller's too: a coordinator never hands an event to another section.
        const target = clubEventTarget({
          id: row.id,
          tenantId: row.tenantId,
          organizationId: row.organizationId,
          sectionId: patch.sectionId,
        })
        if (!findActingRole(authorized.scope, CLUB_EVENT_MANAGE_KINDS, target)) {
          await foundationErrors.throw('scope_denied')
        }
        await assertSection(ctx, em, scope, patch.sectionId)
        row.sectionId = patch.sectionId
      }
      if (patch.publicSlug !== undefined && patch.publicSlug !== row.publicSlug) {
        await assertSlugFree(em, scope, patch.publicSlug, row.id)
        row.publicSlug = patch.publicSlug
      }
      let moved: Occurrence[] = []
      let changes = new Map<string, SessionChange | null>()
      if (patch.placeId !== undefined && patch.placeId !== row.placeId) {
        const place = await eventPlace(ctx, em, scope, patch.placeId)
        const openLive = parts.some((part) => !part.activityId && part.status === 'planned')
        if (openLive) {
          const problem = openPartProblem(false, place.isExternal)
          if (problem) await activitiesErrors.throw(problem, { field: 'placeId' })
        }
        ;({ moved, changes } = await moveSessionsToPlace(
          ctx,
          em,
          row,
          sessions,
          activities,
          patch.placeId,
          place.isExternal,
        ))
        row.placeId = patch.placeId
      }
      if (patch.name !== undefined) row.name = patch.name
      if (patch.description !== undefined) row.description = patch.description
      if (patch.isPublic !== undefined) row.isPublic = patch.isPublic
      if (patch.gatheringMinutesBefore !== undefined) row.gatheringMinutesBefore = patch.gatheringMinutesBefore
      if (patch.confirmByMinutesBefore !== undefined) row.confirmByMinutesBefore = patch.confirmByMinutesBefore
      row.updatedAt = new Date()
      return {
        entity: row,
        actingRole: authorized.actingRole,
        before: { ...before, sessionIds: moved.map((session) => session.id) },
        sessionIds: moved.map((session) => session.id),
        moved,
        changes,
        actorPersonId: selfPersonId(authorized.scope),
      }
    })
    const actor: Actor = {
      userId: ctx.auth?.sub ?? null,
      personId: result.actorPersonId,
      actingRole: result.actingRole,
    }
    // REQ-T05, REQ-A09: each moved part session is announced to its own audience, once.
    for (const session of result.moved) await emitSessionUpdated(session, result.changes.get(session.id) ?? null, actor)
    return {
      entity: result.entity,
      actingRole: result.actingRole,
      before: result.before,
      sessionIds: result.sessionIds,
      changes: result.changes,
    }
  },
  buildLog: ({ result }) =>
    activitiesLog({
      result,
      resourceKind: CLUB_EVENT_RESOURCE_KIND,
      labelKey: 'activities.audit.clubEvents.update',
      fallback: 'Change a club event',
      after: clubEventSnapshot(result.entity),
      context: { sessionsMoved: result.sessionIds.length },
    }),
  async authorizeReplay({ ctx, logEntry }) {
    await authorizeClubEventReplay(ctx, logEntry.resourceId)
  },
  async undo({ ctx, logEntry }) {
    const before = logEntry.snapshotBefore as ClubEventSnapshot | null | undefined
    if (!before?.id) throw new Error('[internal] missing club event snapshot for undo')
    const { row, scope, actingRole } = await authorizeClubEventReplay(ctx, before.id)
    const em = ctx.transactionalEm as EntityManager
    const movedIds = new Set(before.sessionIds ?? [])
    let moved: Occurrence[] = []
    let changes = new Map<string, SessionChange | null>()
    if (before.placeId !== row.placeId && movedIds.size > 0) {
      const { activities, sessions } = await eventParts(em, row)
      const place = (await findPlaces(ctx.container, scopeOf(row), [before.placeId], em)).get(before.placeId)
      ;({ moved, changes } = await moveSessionsToPlace(
        ctx,
        em,
        row,
        sessions.filter((session) => movedIds.has(session.id)),
        activities,
        before.placeId,
        place?.isExternal === true,
      ))
    }
    restoreClubEvent(row, before)
    row.updatedAt = new Date()
    await em.flush()
    const actor: Actor = { userId: ctx.auth?.sub ?? null, personId: selfPersonId(scope), actingRole }
    for (const session of moved) await emitSessionUpdated(session, changes.get(session.id) ?? null, actor)
  },
}

function scopeOf(row: { tenantId: string; organizationId: string }): ActivitiesScope {
  return { tenantId: row.tenantId, organizationId: row.organizationId }
}

const cancelClubEventCommand: CommandHandler<Record<string, unknown>, ClubEventCommandResult> = {
  id: 'activities.club_events.cancel',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const load = loadClubEvent(ctx)
    const result = await inWriteTransaction(ctx, 'activities.club_events.cancel', async (em) => {
      const authorized = await authorizeScoped(
        {
          input: clubEventCancelSchema,
          resourceKind: CLUB_EVENT_RESOURCE_KIND,
          allowedKinds: CLUB_EVENT_MANAGE_KINDS,
          loadTarget: (parsed, txEm, lock) => load(txEm, parsed.id, lock),
          resolveTarget: (_parsed, entity) => clubEventTarget(entity as ClubEvent),
        },
        rawInput,
        ctx,
        em,
      )
      const row = authorized.entity as ClubEvent
      await assertClubEventOpen(row)
      const before = clubEventSnapshot(row)
      const { parts, sessions } = await eventParts(em, row)
      const now = new Date()
      const reason = authorized.parsed.reason
      // DD-T14: each planned future part session is cancelled as the session cancellation cancels it.
      const cancelled = futurePlannedSessions(sessions, now)
      for (const session of cancelled) {
        session.status = 'cancelled'
        session.cancelReason = reason
        session.updatedAt = now
      }
      const openParts = parts.filter((part) => !part.activityId && part.status === 'planned')
      for (const part of openParts) {
        part.status = 'cancelled'
        part.cancelReason = reason
        part.updatedAt = now
      }
      row.status = 'cancelled'
      row.cancelReason = reason
      row.updatedAt = now
      return {
        entity: row,
        actingRole: authorized.actingRole,
        before: {
          ...before,
          sessionIds: cancelled.map((session) => session.id),
          openPartIds: openParts.map((part) => part.id),
        },
        sessionIds: cancelled.map((session) => session.id),
        cancelled,
        actorPersonId: selfPersonId(authorized.scope),
      }
    })
    // #139: each cancellation names who cancelled and in which role, as the session cancellation does.
    for (const session of result.cancelled) {
      await emitAfterCommit('activities.occurrence.cancelled', scopeOf(session), {
        id: session.id,
        activityId: session.activityId,
        groupId: session.groupId,
        actorUserId: ctx.auth?.sub ?? null,
        actorPersonId: result.actorPersonId,
        actingRole: result.actingRole,
        updatedAt: session.updatedAt.toISOString(),
      })
    }
    return {
      entity: result.entity,
      actingRole: result.actingRole,
      before: result.before,
      sessionIds: result.sessionIds,
    }
  },
  buildLog: ({ result }) =>
    activitiesLog({
      result,
      resourceKind: CLUB_EVENT_RESOURCE_KIND,
      labelKey: 'activities.audit.clubEvents.cancel',
      fallback: 'Cancel a club event',
      after: clubEventSnapshot(result.entity),
      context: { sessionsCancelled: result.sessionIds.length },
    }),
  async authorizeReplay({ ctx, logEntry }) {
    await authorizeClubEventReplay(ctx, logEntry.resourceId)
  },
  async undo({ ctx, logEntry }) {
    // Restores the event, the sessions it cancelled (each must still fit its place and coach) and its open parts, as
    // the session cancellation's undo does (silently, *Risks and Tradeoffs*).
    const before = logEntry.snapshotBefore as ClubEventSnapshot | null | undefined
    if (!before?.id) throw new Error('[internal] missing club event snapshot for undo')
    const { row } = await authorizeClubEventReplay(ctx, before.id)
    const em = ctx.transactionalEm as EntityManager
    const { parts, sessions } = await eventParts(em, row)
    const sessionIds = new Set(before.sessionIds ?? [])
    const openPartIds = new Set(before.openPartIds ?? [])
    const now = new Date()
    const restored = sessions.filter((session) => sessionIds.has(session.id) && session.status === 'cancelled')
    for (const session of restored) {
      session.status = 'planned'
      session.cancelReason = null
      session.updatedAt = now
    }
    for (const part of parts) {
      if (!openPartIds.has(part.id)) continue
      part.status = 'planned'
      part.cancelReason = null
      part.updatedAt = now
    }
    restoreClubEvent(row, before)
    row.updatedAt = now
    await em.flush()
    for (const session of restored) await assertSessionFits(ctx, em, session)
    for (const session of restored) {
      await emitAfterCommit('activities.occurrence.updated', scopeOf(session), {
        id: session.id,
        activityId: session.activityId,
      })
    }
  },
}

registerCommand(createClubEventCommand)
registerCommand(updateClubEventCommand)
registerCommand(cancelClubEventCommand)
