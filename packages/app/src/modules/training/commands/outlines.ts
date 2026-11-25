// The outline commands (training outlines spec *API, Command, and Error Contracts*, DD-O07, BR-O2, BR-O3; REQ-O06,
// REQ-O07; E24-S03, #683):
// - `training.outlines.create|update|delete` — an own outline, a session's outline or a recurring activity's series
//   outline; creating a series outline copies it into the activity's planned future sessions in the same transaction.
//   A session's outline is read-only 72 hours after the session's end (409 `outline_locked`); a session or an activity
//   has at most one live outline (409 `outline_exists`). An edit keeps only the images the outline already referenced
//   (images are added by their upload route) and releases the files it dropped after the commit.
// - `training.outlines.attach` — copies an outline into a session, or as the series outline of a recurring activity
//   (with its sessions' copies); the original stays where it was, so an own outline is a reusable template.
// - `training.outlines.ensure_copy` — the session's copy of its activity's series outline when it still has none
//   (the session widget calls it; idempotent, never a write inside a GET).
// - `training.outlines.sync_sessions` — the job the `activities.occurrence.generated` subscriber runs: a created
//   session of an activity with a series outline gets its copy; a removed session's unedited copy is deleted and an
//   edited one is kept, detached from the session (it becomes its author's own outline). A moved session keeps its
//   copy and a cancelled one keeps it too, so neither needs a rule here.
import type { EntityManager } from '@mikro-orm/postgresql'
import { registerCommand, type CommandHandler, type CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import type { ActingRole } from '@vereino/core'
import {
  assertInScope,
  authorizeScoped,
  foundationErrors,
  prefetchSessionScope,
  trustedScopeOf,
} from '@/modules/foundation'
import { Outline } from '../data/entities'
import {
  ensureCopySchema,
  outlineAttachSchema,
  outlineCreateSchema,
  outlineDeleteSchema,
  outlineUpdateSchema,
  sessionChangesSchema,
} from '../data/validators'
import {
  droppedImages,
  isUneditedCopy,
  keepKnownImages,
  outlineContent,
  outlineImages,
  readParts,
  type OutlineContent,
  type OutlineImageRef,
} from '../lib/outline'
import {
  findActivity,
  findGroups,
  findOccurrence,
  findOccurrences,
  upcomingSessions,
  type TrainingScope,
} from '../services/directory'
import { releaseUnusedImages } from '../services/images'
import {
  OUTLINE_KINDS,
  OUTLINE_RESOURCE_KIND,
  SESSION_KINDS,
  assertFree,
  assertNotLocked,
  copyIntoSessions,
  inWriteTransaction,
  outlineLoader,
  outlineTarget,
  scheduleTarget,
  selfPersonId,
  sessionOutline,
  throwFieldError,
  trainingLog,
  contentOf,
  outlineSnapshot,
  restoreOutline,
  type OutlineSnapshot,
  type TrainingCommandResult,
} from './shared'

export type OutlineCommandResult = TrainingCommandResult<OutlineSnapshot> & {
  /** The session copies the command created (a series outline's, DD-O07). */
  copyIds: string[]
  /** `ensure_copy`: whether the copy was made now (201) or existed (200); null when there is nothing to copy. */
  created?: boolean
}

const scopeOf = (row: { tenantId: string; organizationId: string }): TrainingScope => ({
  tenantId: row.tenantId,
  organizationId: row.organizationId,
})

/** Releases the images an edit dropped, after the commit (their files are deleted only when nothing references them). */
async function releaseDropped(ctx: CommandRuntimeContext, scope: TrainingScope, images: OutlineImageRef[]) {
  if (images.length > 0) await releaseUnusedImages(ctx.container, scope, images)
}

/** The session of an outline being changed, for the lock (BR-O3); null for an outline of no session. */
async function sessionOf(ctx: CommandRuntimeContext, row: Outline, em: EntityManager) {
  return row.occurrenceId ? findOccurrence(ctx.container, scopeOf(row), row.occurrenceId, em) : null
}

/** The group and section of the session, activity or group a create names; null when it names none or an unknown one. */
type CreateReference = { groupId: string; sectionId: string } | null

async function createReference(
  ctx: CommandRuntimeContext,
  em: EntityManager,
  scope: TrainingScope,
  parsed: { occurrenceId?: string; activityId?: string; groupId?: string },
): Promise<CreateReference> {
  if (parsed.occurrenceId) return findOccurrence(ctx.container, scope, parsed.occurrenceId, em)
  if (parsed.activityId) return findActivity(ctx.container, scope, parsed.activityId, em)
  if (parsed.groupId) {
    const group = (await findGroups(ctx.container, scope, [parsed.groupId], em)).get(parsed.groupId)
    return group ? { groupId: group.id, sectionId: group.sectionId } : null
  }
  return null
}

const createOutlineCommand: CommandHandler<Record<string, unknown>, OutlineCommandResult> = {
  id: 'training.outlines.create',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    // The caller's grants are read before the write transaction (#549); an own outline's target is the caller.
    const sessionScope = await prefetchSessionScope(ctx)
    const self = sessionScope ? selfPersonId(sessionScope.scope) : null
    return inWriteTransaction(ctx, 'training.outlines.create', async (em) => {
      // The session, activity or group is read before the scope check: its group and section are the target.
      const trusted = trustedScopeOf(ctx)
      const probe = outlineCreateSchema.safeParse(rawInput)
      const reference = trusted && probe.success ? await createReference(ctx, em, trusted, probe.data) : null
      const authorized = await authorizeScoped(
        {
          input: outlineCreateSchema,
          resourceKind: OUTLINE_RESOURCE_KIND,
          allowedKinds: OUTLINE_KINDS,
          resolveTarget: (parsed, _entity, scope) => {
            const named = parsed.occurrenceId ?? parsed.activityId ?? parsed.groupId
            // An unknown session, activity or group matches only a club-wide grant; the reference check answers 422.
            if (named) {
              return {
                id: named,
                ...scope,
                groupId: reference?.groupId ?? null,
                sectionId: reference?.sectionId ?? null,
                occurrenceId: parsed.occurrenceId ?? null,
              }
            }
            return { id: scope.organizationId, ...scope, personId: self }
          },
          lock: 'none',
        },
        rawInput,
        ctx,
        em,
        { sessionScope },
      )
      const { parsed, tenantId, organizationId } = authorized
      const scope = { tenantId, organizationId }
      const author = selfPersonId(authorized.scope)
      if (!author) return foundationErrors.throw('scope_unlinked')
      const content: OutlineContent = { ...parsed, parts: keepKnownImages(parsed.parts, []) }
      let row: Outline
      let copies: Outline[] = []
      if (parsed.occurrenceId) {
        const session = await findOccurrence(ctx.container, scope, parsed.occurrenceId, em)
        if (!session) return throwFieldError('outline_reference_invalid', 'occurrenceId')
        await assertNotLocked(session)
        await assertFree(em, scope, { occurrenceId: session.id })
        row = sessionOutline(em, scope, session, content, author, null)
      } else if (parsed.activityId) {
        const activity = await findActivity(ctx.container, scope, parsed.activityId, em)
        if (!activity) return throwFieldError('outline_reference_invalid', 'activityId')
        if (!activity.recurring) return throwFieldError('outline_activity_not_recurring', 'activityId')
        await assertFree(em, scope, { activityId: activity.id })
        row = em.create(Outline, {
          ...scope,
          authorPersonId: author,
          sectionId: activity.sectionId,
          groupId: activity.groupId,
          activityId: activity.id,
          occurrenceId: null,
          sourceOutlineId: null,
          ...outlineContent(content),
        })
        em.persist(row)
        await em.flush()
        copies = await copyIntoSessions(
          em,
          scope,
          row,
          await upcomingSessions(ctx.container, scope, activity.id, new Date(), em),
        )
      } else {
        if (parsed.groupId && !reference) return throwFieldError('outline_reference_invalid', 'groupId')
        row = em.create(Outline, {
          ...scope,
          authorPersonId: author,
          sectionId: reference?.sectionId ?? null,
          groupId: reference?.groupId ?? null,
          activityId: null,
          occurrenceId: null,
          sourceOutlineId: null,
          ...outlineContent(content),
        })
        em.persist(row)
      }
      await em.flush()
      return {
        entity: row,
        actingRole: authorized.actingRole,
        before: null,
        copyIds: copies.map((copy) => copy.id),
      }
    })
  },
  buildLog: ({ result }) =>
    trainingLog({
      result,
      labelKey: 'training.audit.outlines.create',
      fallback: 'Create a training outline',
      after: outlineSnapshot(result.entity),
      context: { copyIds: result.copyIds },
    }),
  async undo({ ctx, logEntry }) {
    const em = ctx.transactionalEm as EntityManager
    const context = (logEntry.contextJson ?? {}) as { copyIds?: unknown }
    const copyIds: unknown[] = Array.isArray(context.copyIds) ? context.copyIds : []
    const ids = [logEntry.resourceId, ...copyIds].filter((id): id is string => typeof id === 'string')
    const rows = await replayRows(ctx, em, ids)
    const now = new Date()
    for (const row of rows) {
      row.deletedAt = now
      row.updatedAt = now
    }
    await em.flush()
  },
}

/** The live (or, for an undo, deleted) outlines among `ids` in the replay's trusted tenant, after a scope check. */
async function replayRows(ctx: CommandRuntimeContext, em: EntityManager, ids: string[]): Promise<Outline[]> {
  const rows: Outline[] = []
  for (const id of ids) {
    const { entity } = await authorizeScoped(
      {
        input: outlineDeleteSchema,
        resourceKind: OUTLINE_RESOURCE_KIND,
        allowedKinds: OUTLINE_KINDS,
        loadTarget: (parsed, tx, lock) => outlineLoader(ctx, true)(tx, parsed.id, lock),
        resolveTarget: (_parsed, row) => outlineTarget(row as Outline),
      },
      { id },
      ctx,
      em,
      { mode: 'replay' },
    )
    if (entity) rows.push(entity)
  }
  return rows
}

/** The spec of a command on an existing outline: row-locked load, then the scope check on its target. */
function existingSpec<TSchema extends typeof outlineUpdateSchema | typeof outlineDeleteSchema>(
  ctx: CommandRuntimeContext,
  input: TSchema,
) {
  return {
    input,
    resourceKind: OUTLINE_RESOURCE_KIND,
    allowedKinds: OUTLINE_KINDS,
    loadTarget: (parsed: { id: string }, em: EntityManager, lock: Parameters<ReturnType<typeof outlineLoader>>[2]) =>
      outlineLoader(ctx)(em, parsed.id, lock),
    resolveTarget: (_parsed: unknown, row: Outline | null) => outlineTarget(row as Outline),
  }
}

const updateOutlineCommand: CommandHandler<Record<string, unknown>, OutlineCommandResult> = {
  id: 'training.outlines.update',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const box: { dropped: OutlineImageRef[] } = { dropped: [] }
    const result = await inWriteTransaction(ctx, 'training.outlines.update', async (em) => {
      const authorized = await authorizeScoped(existingSpec(ctx, outlineUpdateSchema), rawInput, ctx, em)
      const row = authorized.entity as Outline
      await assertNotLocked(await sessionOf(ctx, row, em))
      const before = outlineSnapshot(row)
      const patch = authorized.parsed
      if (patch.language !== undefined) row.language = patch.language
      if (patch.topic !== undefined) row.topic = patch.topic
      if (patch.goal !== undefined) row.goal = patch.goal
      if (patch.specificGoals !== undefined) row.specificGoals = patch.specificGoals
      if (patch.ageCategory !== undefined) row.ageCategory = patch.ageCategory
      if (patch.durationMinutes !== undefined) row.durationMinutes = patch.durationMinutes
      if (patch.playersCount !== undefined) row.playersCount = patch.playersCount
      if (patch.equipment !== undefined) row.equipment = patch.equipment
      if (patch.parts !== undefined) {
        const current = readParts(row.parts)
        const next = keepKnownImages(patch.parts, outlineImages(current))
        box.dropped = droppedImages(current, next)
        row.parts = next
      }
      row.updatedAt = new Date()
      return { entity: row, actingRole: authorized.actingRole, before, copyIds: [] }
    })
    await releaseDropped(ctx, scopeOf(result.entity), box.dropped)
    return result
  },
  buildLog: ({ result }) =>
    trainingLog({
      result,
      labelKey: 'training.audit.outlines.update',
      fallback: 'Change a training outline',
      after: outlineSnapshot(result.entity),
    }),
  async undo({ ctx, logEntry }) {
    const before = logEntry.snapshotBefore as OutlineSnapshot | null | undefined
    if (!before?.id) throw new Error('[internal] missing outline snapshot for undo')
    const em = ctx.transactionalEm as EntityManager
    const [row] = await replayRows(ctx, em, [before.id])
    restoreOutline(row, before)
    row.updatedAt = new Date()
    await em.flush()
  },
}

const deleteOutlineCommand: CommandHandler<Record<string, unknown>, OutlineCommandResult> = {
  id: 'training.outlines.delete',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    return inWriteTransaction(ctx, 'training.outlines.delete', async (em) => {
      const authorized = await authorizeScoped(existingSpec(ctx, outlineDeleteSchema), rawInput, ctx, em)
      const row = authorized.entity as Outline
      await assertNotLocked(await sessionOf(ctx, row, em))
      const before = outlineSnapshot(row)
      const now = new Date()
      row.deletedAt = now
      row.updatedAt = now
      return { entity: row, actingRole: authorized.actingRole, before, copyIds: [] }
    })
  },
  buildLog: ({ result }) =>
    trainingLog({
      result,
      labelKey: 'training.audit.outlines.delete',
      fallback: 'Delete a training outline',
      after: null,
    }),
  async undo({ ctx, logEntry }) {
    const before = logEntry.snapshotBefore as OutlineSnapshot | null | undefined
    if (!before?.id) throw new Error('[internal] missing outline snapshot for undo')
    const em = ctx.transactionalEm as EntityManager
    const [row] = await replayRows(ctx, em, [before.id])
    // The session or activity may have got another outline meanwhile (BR-O2): the unique index refuses the undo then.
    if (before.occurrenceId) await assertFree(em, scopeOf(row), { occurrenceId: before.occurrenceId })
    if (before.activityId) await assertFree(em, scopeOf(row), { activityId: before.activityId })
    restoreOutline(row, before)
    row.deletedAt = null
    row.updatedAt = new Date()
    await em.flush()
  },
}

const attachOutlineCommand: CommandHandler<Record<string, unknown>, OutlineCommandResult> = {
  id: 'training.outlines.attach',
  isUndoable: false,
  async execute(rawInput, ctx) {
    return inWriteTransaction(ctx, 'training.outlines.attach', async (em) => {
      const authorized = await authorizeScoped(
        {
          input: outlineAttachSchema,
          resourceKind: OUTLINE_RESOURCE_KIND,
          allowedKinds: OUTLINE_KINDS,
          loadTarget: (parsed, tx, lock) => outlineLoader(ctx)(tx, parsed.id, lock),
          resolveTarget: (_parsed, row) => outlineTarget(row as Outline),
          // The source is read, not edited: its version is not needed to copy it.
          lock: 'none',
        },
        rawInput,
        ctx,
        em,
      )
      const source = authorized.entity as Outline
      const { parsed, tenantId, organizationId } = authorized
      const scope = { tenantId, organizationId }
      const author = selfPersonId(authorized.scope)
      if (!author) return foundationErrors.throw('scope_unlinked')
      const content = contentOf(source)
      let actingRole: ActingRole
      let row: Outline
      let copies: Outline[] = []
      if (parsed.occurrenceId) {
        const session = await findOccurrence(ctx.container, scope, parsed.occurrenceId, em)
        if (!session) return throwFieldError('outline_reference_invalid', 'occurrenceId')
        actingRole = await assertInScope(
          authorized.scope,
          SESSION_KINDS,
          scheduleTarget(session.id, scope, session, session.id),
        )
        await assertNotLocked(session)
        await assertFree(em, scope, { occurrenceId: session.id })
        row = sessionOutline(em, scope, session, content, author, source.id)
      } else {
        const activityId = parsed.activityId as string
        const activity = await findActivity(ctx.container, scope, activityId, em)
        if (!activity) return throwFieldError('outline_reference_invalid', 'activityId')
        actingRole = await assertInScope(authorized.scope, SESSION_KINDS, scheduleTarget(activity.id, scope, activity))
        if (!activity.recurring) return throwFieldError('outline_activity_not_recurring', 'activityId')
        await assertFree(em, scope, { activityId: activity.id })
        row = em.create(Outline, {
          ...scope,
          authorPersonId: author,
          sectionId: activity.sectionId,
          groupId: activity.groupId,
          activityId: activity.id,
          occurrenceId: null,
          sourceOutlineId: source.id,
          ...outlineContent(content),
        })
        em.persist(row)
        await em.flush()
        copies = await copyIntoSessions(
          em,
          scope,
          row,
          await upcomingSessions(ctx.container, scope, activity.id, new Date(), em),
        )
      }
      await em.flush()
      return { entity: row, actingRole, before: null, copyIds: copies.map((copy) => copy.id) }
    })
  },
  buildLog: ({ result }) =>
    trainingLog({
      result,
      labelKey: 'training.audit.outlines.attach',
      fallback: 'Attach a training outline',
      after: outlineSnapshot(result.entity),
      context: { copyIds: result.copyIds, sourceOutlineId: result.entity.sourceOutlineId ?? null },
    }),
}

const ensureCopyCommand: CommandHandler<Record<string, unknown>, OutlineCommandResult | { entity: null }> = {
  id: 'training.outlines.ensure_copy',
  isUndoable: false,
  async execute(rawInput, ctx) {
    return inWriteTransaction(ctx, 'training.outlines.ensure_copy', async (em) => {
      const box: { session: Awaited<ReturnType<typeof findOccurrence>> } = { session: null }
      const authorized = await authorizeScoped(
        {
          input: ensureCopySchema,
          resourceKind: OUTLINE_RESOURCE_KIND,
          allowedKinds: SESSION_KINDS,
          loadTarget: async (parsed, tx) => {
            const scope = trustedScopeOf(ctx)
            box.session = scope ? await findOccurrence(ctx.container, scope, parsed.occurrenceId, tx) : null
            return box.session ? { id: box.session.id } : null
          },
          resolveTarget: (parsed, _entity, trusted) =>
            scheduleTarget(
              parsed.occurrenceId,
              trusted,
              box.session as NonNullable<typeof box.session>,
              parsed.occurrenceId,
            ),
          lock: 'none',
        },
        rawInput,
        ctx,
        em,
      )
      const session = box.session as NonNullable<typeof box.session>
      const scope = { tenantId: authorized.tenantId, organizationId: authorized.organizationId }
      const existing = await em.findOne(Outline, { ...scope, occurrenceId: session.id, deletedAt: null })
      if (existing) {
        return { entity: existing, actingRole: authorized.actingRole, before: null, copyIds: [], created: false }
      }
      const series = await em.findOne(Outline, { ...scope, activityId: session.activityId, deletedAt: null })
      if (!series) return { entity: null }
      const [copy] = await copyIntoSessions(em, scope, series, [session])
      await em.flush()
      return { entity: copy, actingRole: authorized.actingRole, before: null, copyIds: [copy.id], created: true }
    })
  },
  buildLog: ({ result }) =>
    result.entity && 'created' in result && result.created
      ? trainingLog({
          result,
          labelKey: 'training.audit.outlines.ensureCopy',
          fallback: 'Copy the series outline into a session',
          after: outlineSnapshot(result.entity),
        })
      : null,
}

export type SessionSyncResult = { copied: number; removed: number; detached: number }

const syncSessionsCommand: CommandHandler<Record<string, unknown>, SessionSyncResult> = {
  id: 'training.outlines.sync_sessions',
  isUndoable: false,
  async execute(rawInput, ctx) {
    return inWriteTransaction(ctx, 'training.outlines.sync_sessions', async (em) => {
      const authorized = await authorizeScoped(
        {
          input: sessionChangesSchema,
          resourceKind: 'training.organization',
          allowedKinds: ['system_job'],
          resolveTarget: (_parsed, _entity, trusted) => ({ id: trusted.organizationId, ...trusted }),
          lock: 'none',
          scopeSource: { job: true },
        },
        rawInput,
        ctx,
        em,
      )
      const scope = { tenantId: authorized.tenantId, organizationId: authorized.organizationId }
      const counts: SessionSyncResult = { copied: 0, removed: 0, detached: 0 }
      // Created sessions of an activity with a series outline get their copy (DD-O07); an existing copy is kept.
      const created = [...(await findOccurrences(ctx.container, scope, authorized.parsed.createdIds, em)).values()]
      const activityIds = [...new Set(created.map((session) => session.activityId))]
      if (activityIds.length > 0) {
        const series = await em.find(Outline, { ...scope, activityId: { $in: activityIds }, deletedAt: null })
        for (const outline of series) {
          const copies = await copyIntoSessions(
            em,
            scope,
            outline,
            created.filter((session) => session.activityId === outline.activityId),
          )
          counts.copied += copies.length
        }
      }
      // Removed sessions: an unedited copy goes, an edited one stays as its author's own outline.
      const removedIds = authorized.parsed.removedIds
      if (removedIds.length > 0) {
        const outlines = await em.find(Outline, { ...scope, occurrenceId: { $in: removedIds }, deletedAt: null })
        const sourceIds = [...new Set(outlines.flatMap((row) => (row.sourceOutlineId ? [row.sourceOutlineId] : [])))]
        const sources = sourceIds.length
          ? new Map((await em.find(Outline, { ...scope, id: { $in: sourceIds } })).map((row) => [row.id, row]))
          : new Map<string, Outline>()
        const now = new Date()
        for (const row of outlines) {
          const source = row.sourceOutlineId ? (sources.get(row.sourceOutlineId) ?? null) : null
          const unedited = isUneditedCopy(contentOf(row), source ? contentOf(source) : null)
          if (unedited) {
            row.deletedAt = now
            counts.removed += 1
          } else {
            row.occurrenceId = null
            counts.detached += 1
          }
          row.updatedAt = now
        }
      }
      await em.flush()
      return counts
    })
  },
}

registerCommand(createOutlineCommand)
registerCommand(updateOutlineCommand)
registerCommand(deleteOutlineCommand)
registerCommand(attachOutlineCommand)
registerCommand(ensureCopyCommand)
registerCommand(syncSessionsCommand)
