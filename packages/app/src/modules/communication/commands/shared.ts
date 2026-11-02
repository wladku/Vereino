// Shared pieces of the `communication` commands: the write transaction, the thread as a scope target, the dispatch
// service, the post-commit events and publish, and the audit log entry. Every `communication` command is
// non-undoable (foundation III DD-M11): a sent e-mail cannot be recalled and append-only rows are never removed.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { withAtomicFlush } from '@open-mercato/shared/lib/commands/flush'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import type { ScopeTarget } from '@vereino/core'
import type { DispatchService } from '@/modules/foundation'
import type { Thread } from '../data/entities'
import { emitCommunicationEvent, type CommunicationEventId } from '../events'

export type CommunicationScope = { tenantId: string; organizationId: string }

/** The foundation's dispatch service (P-30), scoped to the request container. */
export function dispatchService(ctx: Pick<CommandRuntimeContext, 'container'>): DispatchService {
  return ctx.container.resolve<DispatchService>('foundationDispatch')
}

/**
 * Runs `phase` in one write transaction and returns its value: the replay transaction when the command bus provides
 * one, else a fresh fork of the request EntityManager.
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

/** A thread as a scope target: its section (a coordinator), its group and session (a coach), its organization. */
export function threadTarget(
  thread: Pick<Thread, 'id' | 'tenantId' | 'organizationId' | 'sectionId' | 'groupId' | 'scopeType' | 'scopeId'>,
  personId?: string | null,
): ScopeTarget {
  return {
    id: thread.id,
    tenantId: thread.tenantId,
    organizationId: thread.organizationId,
    sectionId: thread.sectionId ?? null,
    groupId: thread.groupId ?? null,
    occurrenceId: thread.scopeType === 'occurrence' ? (thread.scopeId ?? null) : null,
    personId: personId ?? null,
  }
}

export function emitAfterCommit(
  eventId: CommunicationEventId,
  scope: CommunicationScope,
  payload: Record<string, unknown>,
): Promise<void> {
  return emitCommunicationEvent(eventId, { ...payload, ...scope }, { persistent: true, ...scope })
}

/** Publishes a committed dispatch (a failure is logged by the foundation and left to its sweeper). */
export async function publishAfterCommit(
  ctx: Pick<CommandRuntimeContext, 'container'>,
  dispatchId: string | null,
  scope: CommunicationScope,
): Promise<void> {
  if (dispatchId) await dispatchService(ctx).publish(dispatchId, scope)
}

export async function communicationLog(args: {
  labelKey: string
  fallback: string
  resourceKind: string
  resourceId: string
  scope: CommunicationScope
  actingRole: string
  parent?: { resourceKind: string; resourceId: string }
  context?: Record<string, unknown>
}) {
  const { translate } = await resolveTranslations()
  return {
    actionLabel: translate(args.labelKey, args.fallback),
    resourceKind: args.resourceKind,
    resourceId: args.resourceId,
    tenantId: args.scope.tenantId,
    organizationId: args.scope.organizationId,
    ...(args.parent ? { parentResourceKind: args.parent.resourceKind, parentResourceId: args.parent.resourceId } : {}),
    snapshotBefore: null,
    snapshotAfter: null,
    context: { actingRole: args.actingRole, ...(args.context ?? {}) },
  }
}
