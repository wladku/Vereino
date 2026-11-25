// Shared pieces of the `training` commands (training outlines spec *Users, Permissions, and Scope*, BR-O2, BR-O3;
// #683): the write transaction, the scope target of an outline, the session and activity checks, the copy of an
// outline for a session, and the audit log entry. Scope checks stay in `authorizeScoped` and `assertInScope`.
import { randomUUID } from 'node:crypto'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { withAtomicFlush } from '@open-mercato/shared/lib/commands/flush'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import type { ActingRole, GrantKind, Scope, ScopeTarget } from '@vereino/core'
import { trustedScopeOf, type TargetLock } from '@/modules/foundation'
import { trainingErrors } from '../api/errors'
import { Outline } from '../data/entities'
import type { TrainingErrorCode } from '../lib/error-codes'
import { isOutlineLocked, outlineContent, readParts, type OutlineContent } from '../lib/outline'
import type { OccurrenceFact, TrainingScope } from '../services/directory'

export const OUTLINE_RESOURCE_KIND = 'training.outline'

/**
 * Who may write an outline, least-privileged first (DD-F08): its author (`self`), a coach of its group (or of its
 * session), a coordinator of its section, the club administrator.
 */
export const OUTLINE_KINDS: readonly GrantKind[] = ['self', 'coach', 'coordinator', 'club_admin']

/** Who may attach an outline to a session or an activity: a coach of the group, a coordinator, the administrator. */
export const SESSION_KINDS: readonly GrantKind[] = ['coach', 'coordinator', 'club_admin']

export type TrainingCommandResult<TSnapshot> = {
  entity: Outline
  actingRole: ActingRole
  before: TSnapshot | null
}

/** Runs `phase` in one write transaction (the replay transaction during undo/redo) and returns its value. */
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

/** An outline as a scope target: its author, its group and section, its session. */
export function outlineTarget(
  row: Pick<
    Outline,
    'id' | 'tenantId' | 'organizationId' | 'authorPersonId' | 'sectionId' | 'groupId' | 'occurrenceId'
  >,
): ScopeTarget {
  return {
    id: row.id,
    tenantId: row.tenantId,
    organizationId: row.organizationId,
    personId: row.authorPersonId,
    sectionId: row.sectionId ?? null,
    groupId: row.groupId ?? null,
    occurrenceId: row.occurrenceId ?? null,
  }
}

/** A session or an activity as a scope target: a coach of its group or a coordinator of its section. */
export function scheduleTarget(
  id: string,
  scope: TrainingScope,
  fact: { groupId: string; sectionId: string },
  occurrenceId?: string,
): ScopeTarget {
  return { id, ...scope, groupId: fact.groupId, sectionId: fact.sectionId, occurrenceId: occurrenceId ?? null }
}

/** The person the caller is (the `self` grant); null for a caller linked to no person of the club. */
export function selfPersonId(scope: Scope): string | null {
  return scope.find((grant) => grant.kind === 'self')?.ids?.[0] ?? null
}

/** A live outline of the trusted tenant by id, row-locked as `authorizeScoped` asks. */
export function outlineLoader(ctx: CommandRuntimeContext, includeDeleted = false) {
  return (em: EntityManager, id: string, lock: TargetLock): Promise<Outline | null> => {
    const tenantId = trustedScopeOf(ctx)?.tenantId
    if (!tenantId) return Promise.resolve(null)
    return em.findOne(Outline, { id, tenantId, ...(includeDeleted ? {} : { deletedAt: null }) }, lock)
  }
}

/** Throws a coded error that also carries a field error on `field`, so a form shows it next to the field. */
export async function throwFieldError(
  code: TrainingErrorCode,
  field: string,
  details: Record<string, unknown> = {},
): Promise<never> {
  const error = await trainingErrors.create(code, { ...details, field })
  error.body = { ...error.body, fieldErrors: { [field]: String(error.body.error ?? code) } }
  throw error
}

/** 409 `outline_locked` 72 hours after the session's end (BR-O3). */
export async function assertNotLocked(session: Pick<OccurrenceFact, 'endAt'> | null, now = new Date()): Promise<void> {
  if (session && isOutlineLocked(session.endAt, now)) await trainingErrors.throw('outline_locked')
}

/** 409 `outline_exists` when the session (or the activity) already has a live outline (BR-O2). */
export async function assertFree(
  em: EntityManager,
  scope: TrainingScope,
  where: { occurrenceId: string } | { activityId: string },
): Promise<void> {
  const existing = await em.count(Outline, { ...scope, ...where, deletedAt: null })
  if (existing > 0) await trainingErrors.throw('outline_exists')
}

/** A new session outline holding `content`, copied from `source` when given (DD-O07). */
export function sessionOutline(
  em: EntityManager,
  scope: TrainingScope,
  session: OccurrenceFact,
  content: OutlineContent,
  authorPersonId: string,
  sourceOutlineId: string | null,
): Outline {
  const row = em.create(Outline, {
    id: randomUUID(),
    ...scope,
    authorPersonId,
    sectionId: session.sectionId,
    groupId: session.groupId,
    activityId: null,
    occurrenceId: session.id,
    sourceOutlineId,
    ...outlineContent(content),
  })
  em.persist(row)
  return row
}

/**
 * The series outline's copies for `sessions` that have no outline yet (DD-O07): one per session, each with its own
 * content, authored like the series outline. Returns the new copies.
 */
export async function copyIntoSessions(
  em: EntityManager,
  scope: TrainingScope,
  series: Outline,
  sessions: readonly OccurrenceFact[],
): Promise<Outline[]> {
  if (sessions.length === 0) return []
  const taken = await em.find(
    Outline,
    { ...scope, occurrenceId: { $in: sessions.map((session) => session.id) }, deletedAt: null },
    { fields: ['id', 'occurrenceId'] },
  )
  const has = new Set(taken.map((row) => row.occurrenceId))
  return sessions
    .filter((session) => !has.has(session.id))
    .map((session) => sessionOutline(em, scope, session, contentOf(series), series.authorPersonId, series.id))
}

export type OutlineSnapshot = OutlineContent & {
  id: string
  tenantId: string
  organizationId: string
  authorPersonId: string
  sectionId: string | null
  groupId: string | null
  activityId: string | null
  occurrenceId: string | null
  sourceOutlineId: string | null
}

export function outlineSnapshot(row: Outline): OutlineSnapshot {
  return {
    id: row.id,
    tenantId: row.tenantId,
    organizationId: row.organizationId,
    authorPersonId: row.authorPersonId,
    sectionId: row.sectionId ?? null,
    groupId: row.groupId ?? null,
    activityId: row.activityId ?? null,
    occurrenceId: row.occurrenceId ?? null,
    sourceOutlineId: row.sourceOutlineId ?? null,
    ...contentOf(row),
  }
}

export function restoreOutline(row: Outline, before: OutlineSnapshot): void {
  Object.assign(row, outlineContent(before))
  row.sectionId = before.sectionId
  row.groupId = before.groupId
  row.activityId = before.activityId
  row.occurrenceId = before.occurrenceId
  row.sourceOutlineId = before.sourceOutlineId
}

/** The content of a stored outline, with its parts read defensively. */
export function contentOf(row: Outline): OutlineContent {
  return outlineContent({
    language: row.language,
    topic: row.topic,
    goal: row.goal,
    specificGoals: row.specificGoals,
    ageCategory: row.ageCategory,
    durationMinutes: row.durationMinutes,
    playersCount: row.playersCount ?? null,
    equipment: row.equipment,
    parts: readParts(row.parts),
  })
}

export async function trainingLog<TSnapshot>(args: {
  result: TrainingCommandResult<TSnapshot>
  labelKey: string
  fallback: string
  after: TSnapshot | null
  context?: Record<string, unknown>
}) {
  const { translate } = await resolveTranslations()
  return {
    actionLabel: translate(args.labelKey, args.fallback),
    resourceKind: OUTLINE_RESOURCE_KIND,
    resourceId: args.result.entity.id,
    tenantId: args.result.entity.tenantId,
    organizationId: args.result.entity.organizationId,
    snapshotBefore: args.result.before,
    snapshotAfter: args.after,
    context: { actingRole: args.result.actingRole, ...(args.context ?? {}) },
  }
}
