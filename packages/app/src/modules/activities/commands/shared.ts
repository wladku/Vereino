// Shared pieces of the `activities` commands: the write transaction, scope targets, the post-commit events, the audit
// log entry and the reference checks every write runs (the group, the place leaf, the coach, the external teams).
// Scope checks stay in `authorizeScoped` and `assertInScope` (foundation spec REQ-F16): activities and sessions are
// planned by the coordinator of the group's section and by the club administrator; a one-off event also by a coach of
// the group (REQ-027); a session is cancelled also by a coach of its group.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { withAtomicFlush } from '@open-mercato/shared/lib/commands/flush'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import type { ActingRole, GrantKind, Scope, ScopeTarget } from '@vereino/core'
import { trustedScopeOf } from '@/modules/foundation'
import { activitiesErrors } from '../api/errors'
import type { Activity, Occurrence } from '../data/entities'
import { typeAllowedForGroup, type ActivityType } from '../lib/activities-rules'
import { emitActivitiesEvent, type ActivitiesEventId } from '../events'
import {
  assertBookablePlace,
  findExternalTeams,
  findGroups,
  findPersons,
  type ActivitiesScope,
} from '../services/directory'
import type { GroupDirectoryEntry } from '../../groups/services/group-directory'

/** Activities and sessions: the coordinator within their sections, the club administrator club-wide. */
export const PLAN_KINDS: readonly GrantKind[] = ['coordinator', 'club_admin']

/** A one-off event or a cancellation: also a coach of the group, least-privileged first (DD-F08). */
export const COACH_KINDS: readonly GrantKind[] = ['coach', 'coordinator', 'club_admin']

export type ActivitiesCommandResult<TEntity, TSnapshot> = {
  entity: TEntity
  actingRole: ActingRole
  before: TSnapshot | null
}

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

/** The tenant a command may load targets from; null fails closed later in `authorizeScoped`. */
export function trustedTenantId(ctx: CommandRuntimeContext): string | null {
  return trustedScopeOf(ctx)?.tenantId ?? null
}

/** An activity or session as a scope target: its section matches a coordinator's grant, its group a coach's. */
export function scheduleTarget(
  row: Pick<Activity | Occurrence, 'id' | 'tenantId' | 'organizationId' | 'sectionId' | 'groupId'>,
  occurrenceId?: string,
): ScopeTarget {
  return {
    id: row.id,
    tenantId: row.tenantId,
    organizationId: row.organizationId,
    sectionId: row.sectionId,
    groupId: row.groupId,
    ...(occurrenceId ? { occurrenceId } : {}),
  }
}

/** The person the caller is (the `self` grant), for a coach who creates an event for their group. */
export function selfPersonId(scope: Scope): string | null {
  return scope.find((grant) => grant.kind === 'self')?.ids?.[0] ?? null
}

/** A group of the trusted organization (or null), for a write's scope target before it is authorized. */
export async function lookupGroup(
  ctx: CommandRuntimeContext,
  groupId: string,
  em: EntityManager,
): Promise<GroupDirectoryEntry | null> {
  const scope = trustedScopeOf(ctx)
  if (!scope) return null
  return (await findGroups(ctx.container, scope, [groupId], em)).get(groupId) ?? null
}

/** The target of a write for a group that may not exist: an unknown group matches only a club-wide grant. */
export function groupTarget(id: string, scope: ActivitiesScope, group: GroupDirectoryEntry | null): ScopeTarget {
  return { id, ...scope, sectionId: group?.sectionId ?? null, groupId: group?.id ?? null }
}

/**
 * The references of an activity or session write (club spec glossary *Activity*, *Place*): a live, active group whose
 * kind takes the type (422 `activity_type_requires_team`), a bookable leaf place (404 / 422 `place_not_bookable`), a
 * live coach and live external teams (422 `activities_reference_invalid` naming the field).
 */
export async function assertReferences(
  ctx: CommandRuntimeContext,
  em: EntityManager,
  scope: ActivitiesScope,
  refs: {
    group?: GroupDirectoryEntry | null
    type?: ActivityType
    placeId?: string
    coachPersonId?: string | null
    externalTeamIds?: readonly string[]
  },
): Promise<void> {
  if (refs.group !== undefined) {
    if (!refs.group) await activitiesErrors.throw('activities_reference_invalid', { field: 'groupId' })
    else if (!refs.group.isActive) await activitiesErrors.throw('activity_group_inactive')
    else if (refs.type && !typeAllowedForGroup(refs.type, refs.group.kind)) {
      await activitiesErrors.throw('activity_type_requires_team', { type: refs.type })
    }
  }
  if (refs.placeId) await assertBookablePlace(ctx.container, scope, refs.placeId, em)
  if (refs.coachPersonId) {
    const persons = await findPersons(ctx.container, scope, [refs.coachPersonId], em)
    if (!persons.has(refs.coachPersonId)) {
      await activitiesErrors.throw('activities_reference_invalid', { field: 'coachPersonId' })
    }
  }
  const teamIds = [...new Set(refs.externalTeamIds ?? [])]
  if (teamIds.length > 0) {
    const teams = await findExternalTeams(ctx.container, scope, teamIds, em)
    if (teamIds.some((id) => !teams.has(id))) {
      await activitiesErrors.throw('activities_reference_invalid', { field: 'externalTeamIds' })
    }
  }
}

/** Emits an `activities.*` event after commit, persistent, with the trusted scope next to the ids-only payload. */
export function emitAfterCommit(
  eventId: ActivitiesEventId,
  scope: ActivitiesScope,
  payload: Record<string, unknown>,
): Promise<void> {
  return emitActivitiesEvent(eventId, { ...payload, ...scope }, { persistent: true, ...scope })
}

/** The session ids a series write touched, for the batched `activities.occurrence.generated` event. */
export type SessionChanges = { createdIds: string[]; updatedIds: string[]; removedIds: string[] }

export function hasSessionChanges(changes: SessionChanges): boolean {
  return changes.createdIds.length + changes.updatedIds.length + changes.removedIds.length > 0
}

export async function activitiesLog<
  TEntity extends { id: string; tenantId: string; organizationId: string },
  TSnapshot,
>(args: {
  result: ActivitiesCommandResult<TEntity, TSnapshot>
  resourceKind: string
  labelKey: string
  fallback: string
  after: TSnapshot | null
  parent?: { resourceKind: string; resourceId: string }
  context?: Record<string, unknown>
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
    context: { actingRole: args.result.actingRole, ...(args.context ?? {}) },
  }
}
