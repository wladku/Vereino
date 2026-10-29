// Shared pieces of the `groups` commands: the write transaction, scope targets, tenant-narrowed row-locked loads, CRUD
// side-effect configs, the audit log entry and the generic undo steps. Scope checks stay in `authorizeScoped` and
// `assertInScope` (foundation spec REQ-F16): groups and memberships are written by the club administrator club-wide
// and by a coordinator within their sections; seasons and external teams, club-wide dictionaries without a section, by
// the club administrator and by any coordinator (`clubWideKinds`).
import type { EntityManager } from '@mikro-orm/postgresql'
import { LockMode, UniqueConstraintViolationException } from '@mikro-orm/core'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { withAtomicFlush } from '@open-mercato/shared/lib/commands/flush'
import { emitCrudSideEffects, emitCrudUndoSideEffects } from '@open-mercato/shared/lib/commands/helpers'
import type { CrudEventsConfig } from '@open-mercato/shared/lib/crud/types'
import type { DataEngine } from '@open-mercato/shared/lib/data/engine'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import type { ActingRole, GrantKind, ScopeMatchOptions, ScopeTarget } from '@vereino/core'
import { trustedScopeOf, type TargetLock } from '@/modules/foundation'
import { Group, type GroupMembership } from '../data/entities'

/** Groups and memberships: a coordinator within their sections, the club administrator club-wide. */
export const GROUP_WRITE_KINDS: readonly GrantKind[] = ['coordinator', 'club_admin']

/**
 * Seasons and external teams are club-wide dictionaries without a section (the opponents of every section's matches):
 * the club administrator and every coordinator maintain them, the coordinator's grant counting club-wide for them.
 */
export const DICTIONARY_WRITE_KINDS: readonly GrantKind[] = ['coordinator', 'club_admin']
export const DICTIONARY_WRITE_OPTIONS: ScopeMatchOptions = { clubWideKinds: ['coordinator'] }

export type ScopedRow = {
  id: string
  tenantId: string
  organizationId: string
  updatedAt: Date
  deletedAt?: Date | null
}

export type GroupsScope = { tenantId: string; organizationId: string }

export type GroupsCommandResult<TEntity, TSnapshot> = {
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

/** A group as a scope target: its section matches a coordinator's grant, its id a coach's. */
export function groupTarget(row: Pick<Group, 'id' | 'tenantId' | 'organizationId' | 'sectionId'>): ScopeTarget {
  return {
    id: row.id,
    tenantId: row.tenantId,
    organizationId: row.organizationId,
    sectionId: row.sectionId,
    groupId: row.id,
  }
}

/** A membership as a scope target: the section and id of its group. */
export function membershipTarget(
  id: string,
  group: Pick<Group, 'id' | 'tenantId' | 'organizationId' | 'sectionId'>,
): ScopeTarget {
  return {
    id,
    tenantId: group.tenantId,
    organizationId: group.organizationId,
    sectionId: group.sectionId,
    groupId: group.id,
  }
}

/** A club-wide dictionary record (season, external team) as a scope target. */
export function dictionaryTarget(row: Pick<ScopedRow, 'id' | 'tenantId' | 'organizationId'>): ScopeTarget {
  return { id: row.id, tenantId: row.tenantId, organizationId: row.organizationId }
}

/**
 * Row-locks a live group of the organization (`SELECT … FOR UPDATE`). Every membership write of a group takes this
 * lock before it checks for an overlapping membership, so concurrent writes for one group are serialized and the
 * overlap check cannot race.
 */
export function lockGroup(em: EntityManager, scope: GroupsScope, groupId: string): Promise<Group | null> {
  return em.findOne(Group, { id: groupId, ...scope, deletedAt: null }, { lockMode: LockMode.PESSIMISTIC_WRITE })
}

/** Loads and row-locks a live group of the trusted tenant (an `authorizeScoped` target loader). */
export function loadGroupLocked(
  em: EntityManager,
  ctx: CommandRuntimeContext,
  id: string,
  lock: TargetLock,
  includeDeleted = false,
): Promise<Group | null> {
  const tenantId = trustedTenantId(ctx)
  if (!tenantId) return Promise.resolve(null)
  return em.findOne(Group, { id, tenantId, ...(includeDeleted ? {} : { deletedAt: null }) }, lock)
}

const idsOnly = (ctx: { identifiers: { id: string; tenantId: string | null; organizationId: string | null } }) => ({
  id: ctx.identifiers.id,
  tenantId: ctx.identifiers.tenantId,
  organizationId: ctx.identifiers.organizationId,
})

/** `groups.<entity>.created|updated|deleted`; ids only (S4.6). */
export function groupsEvents<TEntity>(entity: 'group' | 'season' | 'external_team'): CrudEventsConfig<TEntity> {
  return { module: 'groups', entity, persistent: true, buildPayload: idsOnly }
}

/** `groups.membership.*`; carries the group and person ids so subscribers (the role sync) need no lookup. */
export const membershipEvents: CrudEventsConfig<GroupMembership> = {
  module: 'groups',
  entity: 'membership',
  persistent: true,
  buildPayload: (ctx) => ({ ...idsOnly(ctx), groupId: ctx.entity.groupId, personId: ctx.entity.personId }),
}

export function emitGroupsSideEffects<TEntity extends ScopedRow>(
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

export async function groupsLog<TEntity extends ScopedRow, TSnapshot>(args: {
  result: GroupsCommandResult<TEntity, TSnapshot>
  resourceKind: string
  labelKey: string
  fallback: string
  after: TSnapshot | null
  parent?: { resourceKind: string; resourceId: string }
}) {
  const { translate } = await resolveTranslations()
  return {
    actionLabel: translate(args.labelKey, args.fallback),
    resourceKind: args.resourceKind,
    resourceId: args.result.entity.id,
    tenantId: args.result.entity.tenantId,
    organizationId: args.result.entity.organizationId,
    ...(args.parent ? { parentResourceKind: args.parent.resourceKind, parentResourceId: args.parent.resourceId } : {}),
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
  await emitGroupsSideEffects(ctx, row, 'deleted', events, true)
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
  await emitGroupsSideEffects(ctx, row, action, events, true)
}
