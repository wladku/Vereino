// `facilities.closures.create|update|delete` (facilities spec glossary *Closure*, DD-22, the CRUD row and the
// `facilities.closure.created` row of *Events*; REQ-013; #121): a period on a place with a reason, entered by the club
// administrator on behalf of the owner. An end not after the start answers 422 `closure_period_invalid`, an unknown
// place 422 `facilities_reference_invalid`. After the commit, in a transaction of its own (DD-43), the planned sessions
// on the place and its sub-places that overlap the closure get `needs_reschedule` through `activities.placeSessions`;
// so do the rentals that hold their slot there (#122); the result counts both for the toast "Marked to be moved: n
// sessions, n rentals". Moving a closure flags again; deleting or undoing one never clears a flag — the
// coordinator decides what to do with a session already marked.
import { randomUUID } from 'node:crypto'
import type { EntityManager } from '@mikro-orm/postgresql'
import { registerCommand, type CommandHandler, type CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { authorizeScoped, lockOccupancy, trustedScopeOf } from '@/modules/foundation'
import { Closure } from '../data/entities'
import { flagRentalsForReschedule } from '../data/queries'
import { closureCreateSchema, closureDeleteSchema, closureUpdateSchema } from '../data/validators'
import { closurePeriodProblem, closureWindowChanged, type RescheduleCounts } from '../lib/closures'
import { flagSessionsForReschedule, placeFamily, type FacilitiesScope } from '../services/directory'
import {
  MANAGE_KINDS,
  assertPlaces,
  authorizeReplay,
  emitAfterCommit,
  existingSpec,
  facilitiesLog,
  facilityTarget,
  inWriteTransaction,
  rowLoader,
  throwFieldError,
  type FacilitiesCommandResult,
} from './shared'

export const CLOSURE_RESOURCE_KIND = 'facilities.closure'

export type ClosureSnapshot = {
  id: string
  tenantId: string
  organizationId: string
  placeId: string
  startsAt: string
  endsAt: string
  reason: Closure['reason']
  note: string | null
}

export type ClosureCommandResult = FacilitiesCommandResult<Closure, ClosureSnapshot> & { flagged: RescheduleCounts }

export function closureSnapshot(row: Closure): ClosureSnapshot {
  return {
    id: row.id,
    tenantId: row.tenantId,
    organizationId: row.organizationId,
    placeId: row.placeId,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    reason: row.reason,
    note: row.note ?? null,
  }
}

function restoreClosure(row: Closure, before: ClosureSnapshot): void {
  row.placeId = before.placeId
  row.startsAt = new Date(before.startsAt)
  row.endsAt = new Date(before.endsAt)
  row.reason = before.reason
  row.note = before.note
}

async function assertPeriod(startsAt: Date, endsAt: Date): Promise<void> {
  if (closurePeriodProblem(startsAt, endsAt)) await throwFieldError('closure_period_invalid', 'endsAt')
}

/**
 * Flags the planned sessions and the rentals holding their slot under the closure (the place and its sub-places)
 * after the commit, each in a transaction of its own (DD-43), and counts them. A session on an ancestor cannot exist
 * (sessions point at a leaf), so the ancestors are not read.
 */
async function flagUnderClosure(ctx: CommandRuntimeContext, row: Closure): Promise<RescheduleCounts> {
  const scope: FacilitiesScope = { tenantId: row.tenantId, organizationId: row.organizationId }
  const family = await placeFamily(ctx.container, scope, row.placeId)
  const placeIds = [row.placeId, ...(family?.descendantIds ?? [])]
  const window = { start: row.startsAt, end: row.endsAt }
  const flagged = await flagSessionsForReschedule(ctx.container, scope, placeIds, window)
  const em = ctx.container.resolve<EntityManager>('em').fork()
  const rentals = await em.transactional((tx) => flagRentalsForReschedule(tx, scope, placeIds, window))
  for (const id of rentals) await emitAfterCommit('facilities.rental.updated', scope, { id, placeId: row.placeId })
  return { sessions: flagged.length, rentals: rentals.length }
}

async function emitClosure(row: Closure, action: 'created' | 'updated' | 'deleted'): Promise<void> {
  await emitAfterCommit(
    `facilities.closure.${action}`,
    { tenantId: row.tenantId, organizationId: row.organizationId },
    { id: row.id, placeId: row.placeId },
  )
}

/** A closure adds occupancy: it takes the organization's occupancy lock before any row lock (DD-43). */
async function lockClosureOccupancy(ctx: CommandRuntimeContext, em: EntityManager): Promise<void> {
  const scope = trustedScopeOf(ctx)
  if (scope) await lockOccupancy(em, scope.organizationId)
}

const NONE_FLAGGED: RescheduleCounts = { sessions: 0, rentals: 0 }

const createClosureCommand: CommandHandler<Record<string, unknown>, ClosureCommandResult> = {
  id: 'facilities.closures.create',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const id = randomUUID()
    const result = await inWriteTransaction(ctx, 'facilities.closures.create', async (em) => {
      await lockClosureOccupancy(ctx, em)
      const authorized = await authorizeScoped(
        {
          input: closureCreateSchema,
          resourceKind: CLOSURE_RESOURCE_KIND,
          allowedKinds: MANAGE_KINDS,
          resolveTarget: (_parsed, _entity, scope) => facilityTarget({ id, ...scope }),
        },
        rawInput,
        ctx,
        em,
      )
      const { parsed, tenantId, organizationId } = authorized
      const scope = { tenantId, organizationId }
      const startsAt = new Date(parsed.startsAt)
      const endsAt = new Date(parsed.endsAt)
      await assertPeriod(startsAt, endsAt)
      await assertPlaces(ctx, em, scope, [parsed.placeId])
      const row = em.create(Closure, {
        id,
        ...scope,
        placeId: parsed.placeId,
        startsAt,
        endsAt,
        reason: parsed.reason,
        note: parsed.note ?? null,
      })
      em.persist(row)
      return { entity: row, actingRole: authorized.actingRole, before: null }
    })
    await emitClosure(result.entity, 'created')
    // A replay (redo) runs inside the audit transaction: the flags follow the first execution only.
    const flagged = ctx.transactionalEm ? NONE_FLAGGED : await flagUnderClosure(ctx, result.entity)
    return { ...result, flagged }
  },
  buildLog: ({ result }) =>
    facilitiesLog({
      result,
      resourceKind: CLOSURE_RESOURCE_KIND,
      labelKey: 'facilities.audit.closures.create',
      fallback: 'Create a closure',
      after: closureSnapshot(result.entity),
      context: { flagged: result.flagged },
    }),
  async authorizeReplay({ ctx, logEntry }) {
    await authorizeReplay(ctx, CLOSURE_RESOURCE_KIND, logEntry.resourceId, rowLoader(ctx, Closure, true))
  },
  async undo({ ctx, logEntry }) {
    const row = await authorizeReplay(ctx, CLOSURE_RESOURCE_KIND, logEntry.resourceId, rowLoader(ctx, Closure))
    row.deletedAt = new Date()
    row.updatedAt = new Date()
    await (ctx.transactionalEm as EntityManager).flush()
    await emitClosure(row, 'deleted')
  },
}

const updateClosureCommand: CommandHandler<Record<string, unknown>, ClosureCommandResult> = {
  id: 'facilities.closures.update',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const result = await inWriteTransaction(ctx, 'facilities.closures.update', async (em) => {
      await lockClosureOccupancy(ctx, em)
      const authorized = await authorizeScoped(
        existingSpec(closureUpdateSchema, CLOSURE_RESOURCE_KIND, rowLoader(ctx, Closure)),
        rawInput,
        ctx,
        em,
      )
      const row = authorized.entity as Closure
      const patch = authorized.parsed
      const before = closureSnapshot(row)
      const startsAt = patch.startsAt !== undefined ? new Date(patch.startsAt) : row.startsAt
      const endsAt = patch.endsAt !== undefined ? new Date(patch.endsAt) : row.endsAt
      await assertPeriod(startsAt, endsAt)
      if (patch.placeId !== undefined && patch.placeId !== row.placeId) {
        await assertPlaces(ctx, em, { tenantId: row.tenantId, organizationId: row.organizationId }, [patch.placeId])
        row.placeId = patch.placeId
      }
      row.startsAt = startsAt
      row.endsAt = endsAt
      if (patch.reason !== undefined) row.reason = patch.reason
      if (patch.note !== undefined) row.note = patch.note
      row.updatedAt = new Date()
      return { entity: row, actingRole: authorized.actingRole, before }
    })
    await emitClosure(result.entity, 'updated')
    const before = result.before
    const moved = closureWindowChanged(
      { placeId: before.placeId, startsAt: new Date(before.startsAt), endsAt: new Date(before.endsAt) },
      result.entity,
    )
    const flagged = moved && !ctx.transactionalEm ? await flagUnderClosure(ctx, result.entity) : NONE_FLAGGED
    return { ...result, flagged }
  },
  buildLog: ({ result }) =>
    facilitiesLog({
      result,
      resourceKind: CLOSURE_RESOURCE_KIND,
      labelKey: 'facilities.audit.closures.update',
      fallback: 'Change a closure',
      after: closureSnapshot(result.entity),
      context: { flagged: result.flagged },
    }),
  async authorizeReplay({ ctx, logEntry }) {
    await authorizeReplay(ctx, CLOSURE_RESOURCE_KIND, logEntry.resourceId, rowLoader(ctx, Closure))
  },
  async undo({ ctx, logEntry }) {
    const before = logEntry.snapshotBefore as ClosureSnapshot | null | undefined
    if (!before?.id) throw new Error('[internal] missing closure snapshot for undo')
    const row = await authorizeReplay(ctx, CLOSURE_RESOURCE_KIND, before.id, rowLoader(ctx, Closure))
    restoreClosure(row, before)
    row.updatedAt = new Date()
    await (ctx.transactionalEm as EntityManager).flush()
    await emitClosure(row, 'updated')
  },
}

const deleteClosureCommand: CommandHandler<Record<string, unknown>, ClosureCommandResult> = {
  id: 'facilities.closures.delete',
  isUndoable: true,
  atomicReplay: true,
  async execute(rawInput, ctx) {
    const result = await inWriteTransaction(ctx, 'facilities.closures.delete', async (em) => {
      const authorized = await authorizeScoped(
        existingSpec(closureDeleteSchema, CLOSURE_RESOURCE_KIND, rowLoader(ctx, Closure)),
        rawInput,
        ctx,
        em,
      )
      const row = authorized.entity as Closure
      const before = closureSnapshot(row)
      const now = new Date()
      row.deletedAt = now
      row.updatedAt = now
      return { entity: row, actingRole: authorized.actingRole, before }
    })
    await emitClosure(result.entity, 'deleted')
    return { ...result, flagged: NONE_FLAGGED }
  },
  buildLog: ({ result }) =>
    facilitiesLog({
      result,
      resourceKind: CLOSURE_RESOURCE_KIND,
      labelKey: 'facilities.audit.closures.delete',
      fallback: 'Delete a closure',
      after: null,
    }),
  async authorizeReplay({ ctx, logEntry }) {
    await authorizeReplay(ctx, CLOSURE_RESOURCE_KIND, logEntry.resourceId, rowLoader(ctx, Closure, true))
  },
  async undo({ ctx, logEntry }) {
    const before = logEntry.snapshotBefore as ClosureSnapshot | null | undefined
    if (!before?.id) throw new Error('[internal] missing closure snapshot for undo')
    const row = await authorizeReplay(ctx, CLOSURE_RESOURCE_KIND, before.id, rowLoader(ctx, Closure, true))
    restoreClosure(row, before)
    row.deletedAt = null
    row.updatedAt = new Date()
    await (ctx.transactionalEm as EntityManager).flush()
    await emitClosure(row, 'created')
  },
}

registerCommand(createClosureCommand)
registerCommand(updateClosureCommand)
registerCommand(deleteClosureCommand)
