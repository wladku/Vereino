// Shared pieces of the `club_core` structure commands (sections, places, institutions): the write transaction, the
// scope target, tenant-narrowed loads, CRUD side-effect configs and the generic create/update/delete undo steps.
// Scope checks stay in `authorizeScoped` (foundation spec REQ-F16); club structure is written by the club
// administrator only.
import { UniqueConstraintViolationException } from '@mikro-orm/core'
import type { EntityManager } from '@mikro-orm/postgresql'
import { z } from 'zod'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { withAtomicFlush } from '@open-mercato/shared/lib/commands/flush'
import { emitCrudSideEffects, emitCrudUndoSideEffects } from '@open-mercato/shared/lib/commands/helpers'
import type { CrudEventsConfig } from '@open-mercato/shared/lib/crud/types'
import type { DataEngine } from '@open-mercato/shared/lib/data/engine'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import type { ActingRole, GrantKind, ScopeTarget } from '@vereino/core'
import { authorizeScoped, trustedScopeOf, type AuthorizeScopedSpec, type TargetLock } from '@/modules/foundation'

/** Club structure (sections, places, institutions) is changed by the club administrator only. */
export const STRUCTURE_WRITE_KINDS: readonly GrantKind[] = ['club_admin']

type ScopedRow = { id: string; tenantId: string; organizationId: string; updatedAt: Date; deletedAt?: Date | null }

export type StructureCommandResult<TEntity, TSnapshot> = {
  entity: TEntity
  actingRole: ActingRole
  before: TSnapshot | null
}

/**
 * Runs `phase` in one write transaction and returns its value. Uses the replay transaction when the command bus
 * provides one (`atomicReplay` redo), else a fresh fork of the request EntityManager.
 */
export async function inWriteTransaction<T>(
  ctx: CommandRuntimeContext,
  label: string,
  phase: (em: EntityManager) => Promise<T>,
): Promise<T> {
  const em = ctx.transactionalEm ?? ctx.container.resolve<EntityManager>('em').fork()
  const box: { value?: T } = {}
  await withAtomicFlush(
    em,
    [
      async () => {
        box.value = await phase(em)
      },
    ],
    { transaction: true, label },
  )
  if (!('value' in box)) throw new Error('[internal] the write transaction produced no result: ' + label)
  return box.value as T
}

/** True for a violated unique index (the club's public slug, a section's slug). */
export function isUniqueViolation(error: unknown): boolean {
  if (error instanceof UniqueConstraintViolationException) return true
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === '23505'
}

/** The tenant a command may load targets from; null fails closed later in `authorizeScoped`. */
export function trustedTenantId(ctx: CommandRuntimeContext): string | null {
  return trustedScopeOf(ctx)?.tenantId ?? null
}

/** The decryption scope of the session. */
export function decryptionScope(ctx: CommandRuntimeContext) {
  const scope = trustedScopeOf(ctx)
  return { tenantId: scope?.tenantId ?? null, organizationId: scope?.organizationId ?? null }
}

/** A structure record as a scope target; `sectionId` lets a section match a coordinator's grant. */
export function structureTarget(
  row: Pick<ScopedRow, 'id' | 'tenantId' | 'organizationId'>,
  section = false,
): ScopeTarget {
  return {
    id: row.id,
    tenantId: row.tenantId,
    organizationId: row.organizationId,
    ...(section ? { sectionId: row.id } : {}),
  }
}

/** `club_core.<entity>.created|updated|deleted`; ids only (S4.6). */
export function structureEvents<TEntity>(
  entity: 'section' | 'place' | 'institution' | 'section_material',
): CrudEventsConfig<TEntity> {
  return {
    module: 'club_core',
    entity,
    persistent: true,
    buildPayload: (ctx) => ({
      id: ctx.identifiers.id,
      tenantId: ctx.identifiers.tenantId,
      organizationId: ctx.identifiers.organizationId,
    }),
  }
}

export function emitStructure<TEntity extends ScopedRow>(
  ctx: CommandRuntimeContext,
  row: TEntity,
  action: 'created' | 'updated' | 'deleted',
  events: CrudEventsConfig<TEntity>,
  undo = false,
): Promise<void> {
  const args = {
    dataEngine: ctx.container.resolve<DataEngine>('dataEngine'),
    action,
    entity: row,
    identifiers: { id: row.id, tenantId: row.tenantId, organizationId: row.organizationId },
    events,
  }
  return undo ? emitCrudUndoSideEffects(args) : emitCrudSideEffects(args)
}

/** The spec of a command on an existing record: row-locked load in the trusted tenant, then the scope check. */
export function existingSpec<TSchema extends z.ZodType<{ id: string }>, TEntity extends ScopedRow>(
  input: TSchema,
  resourceKind: string,
  load: (em: EntityManager, id: string, lock: TargetLock) => Promise<TEntity | null>,
  section = false,
): AuthorizeScopedSpec<TSchema, TEntity> {
  return {
    input,
    resourceKind,
    allowedKinds: STRUCTURE_WRITE_KINDS,
    loadTarget: (parsed, em, lock) => load(em, parsed.id, lock),
    resolveTarget: (_parsed, entity) => structureTarget(entity as TEntity, section),
  }
}

/** Re-authorizes an undo or redo on the current scope inside the replay transaction and returns the row. */
export async function authorizeReplay<TEntity extends ScopedRow>(
  ctx: CommandRuntimeContext,
  resourceKind: string,
  id: string | null | undefined,
  load: (em: EntityManager, id: string, lock: TargetLock) => Promise<TEntity | null>,
  section = false,
): Promise<TEntity> {
  const em = ctx.transactionalEm
  if (!em || !id) throw new Error('[internal] replay needs the replay transaction and the id: ' + resourceKind)
  const { entity } = await authorizeScoped(
    existingSpec(z.object({ id: z.uuid() }), resourceKind, load, section),
    { id },
    ctx,
    em,
    { mode: 'replay' },
  )
  return entity as TEntity
}

export async function structureLog<TEntity extends ScopedRow, TSnapshot>(args: {
  result: StructureCommandResult<TEntity, TSnapshot>
  resourceKind: string
  labelKey: string
  fallback: string
  after: TSnapshot | null
}) {
  const { translate } = await resolveTranslations()
  return {
    actionLabel: translate(args.labelKey, args.fallback),
    resourceKind: args.resourceKind,
    resourceId: args.result.entity.id,
    tenantId: args.result.entity.tenantId,
    organizationId: args.result.entity.organizationId,
    snapshotBefore: args.result.before,
    snapshotAfter: args.after,
    context: { actingRole: args.result.actingRole },
  }
}

/** Undo of a create: soft-deletes the created row. */
export async function undoCreate<TEntity extends ScopedRow>(
  ctx: CommandRuntimeContext,
  row: TEntity,
  events: CrudEventsConfig<TEntity>,
): Promise<void> {
  row.deletedAt = new Date()
  await ctx.transactionalEm?.flush()
  await emitStructure(ctx, row, 'deleted', events, true)
}

/** Undo of an update or a delete: writes the snapshot back (a delete's snapshot has no `deletedAt`). */
export async function undoRestore<TEntity extends ScopedRow, TSnapshot>(
  ctx: CommandRuntimeContext,
  row: TEntity,
  before: TSnapshot,
  restore: (row: TEntity, before: TSnapshot) => void,
  events: CrudEventsConfig<TEntity>,
  action: 'updated' | 'created',
): Promise<void> {
  restore(row, before)
  row.deletedAt = null
  row.updatedAt = new Date()
  await ctx.transactionalEm?.flush()
  await emitStructure(ctx, row, action, events, true)
}
