// Shared pieces of the `facilities` commands (#121): the write transaction, the scope target, the post-commit events,
// the audit log entry, the place reference check and the generic replay load. Scope checks stay in `authorizeScoped`
// (foundation spec REQ-F16): the facility rules — zones, closures, rates, booking availability — are written by the
// club administrator only (`facilities.manage`).
import type { EntityManager } from '@mikro-orm/postgresql'
import { z } from 'zod'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { withAtomicFlush } from '@open-mercato/shared/lib/commands/flush'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import type { ActingRole, GrantKind, ScopeTarget } from '@vereino/core'
import {
  authorizeScoped,
  lockOccupancy,
  trustedScopeOf,
  type AuthorizeScopedSpec,
  type TargetLock,
} from '@/modules/foundation'
import { facilitiesErrors } from '../api/errors'
import { emitFacilitiesEvent, type FacilitiesEventId } from '../events'
import type { FacilitiesErrorCode } from '../lib/error-codes'
import { findPlaces, type FacilitiesScope } from '../services/directory'

/** The facility rules are written by the club administrator only. */
export const MANAGE_KINDS: readonly GrantKind[] = ['club_admin']

/** The facility rules are read by the club administrator (places carry no section). */
export const READ_KINDS: readonly GrantKind[] = ['club_admin']

/**
 * The day-to-day records of a place — rentals, the log, incidents — are written by the facility attendant within
 * their places (the `facility_operator` grant: the assigned place and its descendants, #126) and by the club
 * administrator; least-privileged first (DD-F08). The targets carry the record's `placeId`.
 */
export const PLACE_KINDS: readonly GrantKind[] = ['facility_operator', 'club_admin']

export type FacilitiesCommandResult<TEntity, TSnapshot> = {
  entity: TEntity
  actingRole: ActingRole
  before: TSnapshot | null
}

type ScopedRow = { id: string; tenantId: string; organizationId: string; updatedAt: Date; deletedAt?: Date | null }

/**
 * Runs `phase` in one write transaction and returns its value. Uses the replay transaction when the command bus
 * provides one (`atomicReplay` undo/redo), else a fresh fork of the request EntityManager.
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

/** Takes the organization's occupancy lock first (DD-43: before any row lock); no trusted scope fails closed later. */
export async function lockForOccupancy(ctx: CommandRuntimeContext, em: EntityManager): Promise<void> {
  const scope = trustedScopeOf(ctx)
  if (scope) await lockOccupancy(em, scope.organizationId)
}

/** The tenant a command may load targets from; null fails closed later in `authorizeScoped`. */
export function trustedTenantId(ctx: CommandRuntimeContext): string | null {
  return trustedScopeOf(ctx)?.tenantId ?? null
}

/** A facility record as a scope target: it carries no section, so only the club-wide grant matches it. */
export function facilityTarget(row: Pick<ScopedRow, 'id' | 'tenantId' | 'organizationId'>): ScopeTarget {
  return { id: row.id, tenantId: row.tenantId, organizationId: row.organizationId }
}

/** A record of one place as a scope target: the club-wide grant and a `facility_operator` grant of the place match it. */
export function placeTarget(
  row: Pick<ScopedRow, 'id' | 'tenantId' | 'organizationId'> & { placeId: string },
): ScopeTarget {
  return { id: row.id, tenantId: row.tenantId, organizationId: row.organizationId, placeId: row.placeId }
}

/** A row of the trusted tenant by id, row-locked as `authorizeScoped` asks; deleted rows only for a replay. */
export function rowLoader<TEntity extends ScopedRow>(
  ctx: CommandRuntimeContext,
  entity: new () => TEntity,
  includeDeleted = false,
) {
  return (em: EntityManager, id: string, lock: TargetLock): Promise<TEntity | null> => {
    const tenantId = trustedTenantId(ctx)
    if (!tenantId) return Promise.resolve(null)
    const where = { id, tenantId, ...(includeDeleted ? {} : { deletedAt: null }) }
    return em.findOne(entity, where, lock)
  }
}

/** The spec of a command on an existing record: row-locked load in the trusted tenant, then the scope check. */
export function existingSpec<TSchema extends z.ZodType<{ id: string }>, TEntity extends ScopedRow>(
  input: TSchema,
  resourceKind: string,
  load: (em: EntityManager, id: string, lock: TargetLock) => Promise<TEntity | null>,
): AuthorizeScopedSpec<TSchema, TEntity> {
  return {
    input,
    resourceKind,
    allowedKinds: MANAGE_KINDS,
    loadTarget: (parsed, em, lock) => load(em, parsed.id, lock),
    resolveTarget: (_parsed, entity) => facilityTarget(entity as TEntity),
  }
}

/** As `existingSpec`, for a record of one place: `PLACE_KINDS` (or `kinds`) and the record's place as the target. */
export function existingPlaceSpec<
  TSchema extends z.ZodType<{ id: string }>,
  TEntity extends ScopedRow & { placeId: string },
>(
  input: TSchema,
  resourceKind: string,
  load: (em: EntityManager, id: string, lock: TargetLock) => Promise<TEntity | null>,
  kinds: readonly GrantKind[] = PLACE_KINDS,
): AuthorizeScopedSpec<TSchema, TEntity> {
  return {
    input,
    resourceKind,
    allowedKinds: kinds,
    loadTarget: (parsed, em, lock) => load(em, parsed.id, lock),
    resolveTarget: (_parsed, entity) => placeTarget(entity as TEntity),
  }
}

/** Re-authorizes an undo or redo on the current scope inside the replay transaction and returns the row. */
export async function authorizeReplay<TEntity extends ScopedRow>(
  ctx: CommandRuntimeContext,
  resourceKind: string,
  id: string | null | undefined,
  load: (em: EntityManager, id: string, lock: TargetLock) => Promise<TEntity | null>,
): Promise<TEntity> {
  const em = ctx.transactionalEm
  if (!em || !id) throw new Error('[internal] replay needs the replay transaction and the id: ' + resourceKind)
  const { entity } = await authorizeScoped(
    existingSpec(z.object({ id: z.uuid() }), resourceKind, load),
    { id },
    ctx,
    em,
    { mode: 'replay' },
  )
  return entity as TEntity
}

/** Throws a coded error that also carries a field error on `field`, so `CrudForm` shows it next to the field. */
export async function throwFieldError(
  code: FacilitiesErrorCode,
  field: string,
  details: Record<string, unknown> = {},
): Promise<never> {
  const error = await facilitiesErrors.create(code, { ...details, field })
  error.body = { ...error.body, fieldErrors: { [field]: String(error.body.error ?? code) } }
  throw error
}

/** 422 `facilities_reference_invalid` at `placeId` unless every place is a live place of the club. */
export async function assertPlaces(
  ctx: CommandRuntimeContext,
  em: EntityManager,
  scope: FacilitiesScope,
  placeIds: readonly string[],
): Promise<void> {
  const places = await findPlaces(ctx.container, scope, placeIds, em)
  const missing = placeIds.filter((placeId) => !places.has(placeId))
  if (missing.length > 0) await throwFieldError('facilities_reference_invalid', 'placeId', { placeIds: missing })
}

/** Emits a `facilities.*` event after commit, persistent, with the trusted scope next to the ids-only payload. */
export function emitAfterCommit(
  eventId: FacilitiesEventId,
  scope: FacilitiesScope,
  payload: Record<string, unknown>,
): Promise<void> {
  return emitFacilitiesEvent(eventId, { ...payload, ...scope }, { persistent: true, ...scope })
}

export async function facilitiesLog<
  TEntity extends { id: string; tenantId: string; organizationId: string },
  TSnapshot,
>(args: {
  result: FacilitiesCommandResult<TEntity, TSnapshot>
  resourceKind: string
  labelKey: string
  fallback: string
  after: TSnapshot | null
  context?: Record<string, unknown>
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
    context: { actingRole: args.result.actingRole, ...(args.context ?? {}) },
  }
}
