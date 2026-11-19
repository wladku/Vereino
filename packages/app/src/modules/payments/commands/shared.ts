// Shared pieces of the `payments` commands: the write transaction, the club-wide target, tenant-narrowed row-locked
// loads, CRUD side-effect configs, the audit log entry and the generic undo steps. Every `payments` write is the club
// administrator's or the treasurer's (payments spec DD-33, #245), club-wide (`authorizeScoped` with `club_admin` or
// `treasurer`).
import type { EntityManager } from '@mikro-orm/postgresql'
import { onTransactionLifetimeComplete, type CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { withAtomicFlush } from '@open-mercato/shared/lib/commands/flush'
import { emitCrudSideEffects, emitCrudUndoSideEffects } from '@open-mercato/shared/lib/commands/helpers'
import type { CrudEventsConfig } from '@open-mercato/shared/lib/crud/types'
import type { DataEngine } from '@open-mercato/shared/lib/data/engine'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import type { ActingRole, GrantKind, ScopeTarget } from '@vereino/core'
import { authorizeScoped, trustedScopeOf } from '@/modules/foundation'
import { paymentsJobSchema } from '../data/validators'
import { emitPaymentsEvent, type PaymentsEventId } from '../events'

/**
 * Every club-wide `payments` write: the club administrator and the treasurer (DD-33, #245), least-privileged first, so
 * a person holding both is recorded as acting as the treasurer.
 */
export const PAYMENTS_WRITE_KINDS: readonly GrantKind[] = ['treasurer', 'club_admin']

export type ScopedRow = {
  id: string
  tenantId: string
  organizationId: string
  updatedAt: Date
  deletedAt?: Date | null
}

export type PaymentsCommandResult<TEntity, TSnapshot> = {
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

/** The tenant a command may load targets from; null fails closed later in `authorizeScoped`. */
export function trustedTenantId(ctx: CommandRuntimeContext): string | null {
  return trustedScopeOf(ctx)?.tenantId ?? null
}

/** A club-wide `payments` record as a scope target (no section: only the club administrator's grant matches). */
export function clubTarget(row: Pick<ScopedRow, 'id' | 'tenantId' | 'organizationId'>): ScopeTarget {
  return { id: row.id, tenantId: row.tenantId, organizationId: row.organizationId }
}

const idsOnly = (ctx: { identifiers: { id: string; tenantId: string | null; organizationId: string | null } }) => ({
  id: ctx.identifiers.id,
  tenantId: ctx.identifiers.tenantId,
  organizationId: ctx.identifiers.organizationId,
})

/** `payments.<entity>.created|updated|deleted`; ids only (S4.6). */
export function paymentsEvents<TEntity>(
  entity: 'fee' | 'discount_rule' | 'settings' | 'order_campaign',
): CrudEventsConfig<TEntity> {
  return { module: 'payments', entity, persistent: true, buildPayload: idsOnly }
}

export function emitPaymentsSideEffects<TEntity extends ScopedRow>(
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

/** Emits a custom `payments.*` event after commit, persistent, with the trusted scope next to the ids-only payload. */
export function emitAfterCommit(
  eventId: PaymentsEventId,
  scope: { tenantId: string; organizationId: string },
  payload: Record<string, unknown>,
): Promise<void> {
  return emitPaymentsEvent(eventId, { ...payload, ...scope }, { persistent: true, ...scope })
}

/**
 * Emits a custom `payments.*` event from an undo once the command bus's replay transaction commits (#184). An
 * `atomicReplay` undo runs inside that transaction and the bus still writes the audit entry after the handler
 * returns, so an event emitted by the handler itself would go out even when the replay rolls back; it is dropped on
 * a rollback instead.
 */
export function emitAfterReplayCommit(
  ctx: CommandRuntimeContext,
  eventId: PaymentsEventId,
  scope: { tenantId: string; organizationId: string },
  payload: Record<string, unknown>,
): void {
  const em = ctx.transactionalEm
  if (!em) throw new Error('[internal] a replay event needs the replay transaction: ' + eventId)
  onTransactionLifetimeComplete(em, async (outcome) => {
    if (outcome === 'committed') await emitAfterCommit(eventId, scope, payload)
  })
}

export async function paymentsLog<
  TEntity extends Pick<ScopedRow, 'id' | 'tenantId' | 'organizationId'>,
  TSnapshot,
>(args: {
  result: PaymentsCommandResult<TEntity, TSnapshot>
  resourceKind: string
  labelKey: string
  fallback: string
  after: unknown
  /** Extra log context next to the acting role, e.g. a cancellation's reason (#109). */
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
    context: { ...args.context, actingRole: args.result.actingRole },
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
  await emitPaymentsSideEffects(ctx, row, 'deleted', events, true)
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
  await emitPaymentsSideEffects(ctx, row, action, events, true)
}

/** The resource kind of the scheduled `payments` jobs, whose target is the club itself (payments parity spec DD-C08). */
export const PAYMENTS_ORGANIZATION_RESOURCE_KIND = 'payments.organization'

export type PaymentsJobScope = {
  tenantId: string
  organizationId: string
  actingRole: ActingRole
  /** The run's clock: `now` from the operator CLI (`--now`) or the integration tests; a worker never sets it. */
  now: Date
}

/**
 * Authorizes a scheduled `payments` job (payments parity spec DD-C08, #301): only a session-less job context
 * (`jobCommandContext`, grant `system_job`) for the organization it was registered for. Its own short transaction;
 * the job's work runs afterwards in its own transactions.
 */
export async function authorizePaymentsJob(
  ctx: CommandRuntimeContext,
  label: string,
  rawInput: unknown,
): Promise<PaymentsJobScope> {
  const authorized = await inWriteTransaction(ctx, label, (em) =>
    authorizeScoped(
      {
        input: paymentsJobSchema,
        resourceKind: PAYMENTS_ORGANIZATION_RESOURCE_KIND,
        allowedKinds: ['system_job'],
        resolveTarget: (_parsed, _entity, scope) => ({ id: scope.organizationId, ...scope }),
        lock: 'none',
        scopeSource: { job: true },
      },
      rawInput,
      ctx,
      em,
    ),
  )
  return {
    tenantId: authorized.tenantId,
    organizationId: authorized.organizationId,
    actingRole: authorized.actingRole,
    now: authorized.parsed.now ? new Date(authorized.parsed.now) : new Date(),
  }
}

/** The audit entry of a scheduled job: the club as the resource, the run's counts as its context. */
export async function paymentsJobLog(args: {
  job: PaymentsJobScope
  labelKey: string
  fallback: string
  context: Record<string, unknown>
}) {
  const { translate } = await resolveTranslations()
  return {
    actionLabel: translate(args.labelKey, args.fallback),
    resourceKind: PAYMENTS_ORGANIZATION_RESOURCE_KIND,
    resourceId: args.job.organizationId,
    tenantId: args.job.tenantId,
    organizationId: args.job.organizationId,
    context: { ...args.context, now: args.job.now.toISOString(), actingRole: args.job.actingRole },
  }
}
