// Shared pieces of the `enrolment` commands (#799): the write transaction, the decider scope (BR-J5), the post-commit
// events, the audit entry and the snapshot. Scope checks stay in `authorizeScoped` (foundation spec REQ-F16).
import type { EntityManager } from '@mikro-orm/postgresql'
import { z } from 'zod'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { withAtomicFlush } from '@open-mercato/shared/lib/commands/flush'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import type { ActingRole, GrantKind } from '@vereino/core'
import { authorizeScoped, trustedScopeOf, type AuthorizeScopedSpec, type TargetLock } from '@/modules/foundation'
import { enrolmentErrors } from '../api/errors'
import { Application } from '../data/entities'
import { emitEnrolmentEvent, type EnrolmentEventId } from '../events'
import type { EnrolmentErrorCode } from '../lib/error-codes'
import type { EnrolmentScope } from '../services/directory'

/** BR-J5: the coordinators of the application's section and the club administrators decide; least-privileged first. */
export const DECIDE_KINDS: readonly GrantKind[] = ['coordinator', 'club_admin']

export const APPLICATION_RESOURCE_KIND = 'enrolment.application'

/** The trusted acting role of an applicant: no person, no session — the slug or the token names the club. */
export const APPLICANT_ROLE = 'system' as const

export type ApplicationSnapshot = {
  id: string
  sectionId: string
  groupId: string | null
  kind: string
  state: string
  ageFit: string
  waitingSince: string | null
  confirmedAt: string | null
  decidedAt: string | null
  decidedByUserId: string | null
  closedAt: string | null
  updatedAt: string
}

/** Ids, states and times only: never a name, an address or a reason (the audit log keeps no applicant data). */
export function applicationSnapshot(row: Application): ApplicationSnapshot {
  const iso = (value: Date | null | undefined) => (value ? value.toISOString() : null)
  return {
    id: row.id,
    sectionId: row.sectionId,
    groupId: row.groupId ?? null,
    kind: row.kind,
    state: row.state,
    ageFit: row.ageFit,
    waitingSince: iso(row.waitingSince),
    confirmedAt: iso(row.confirmedAt),
    decidedAt: iso(row.decidedAt),
    decidedByUserId: row.decidedByUserId ?? null,
    closedAt: iso(row.closedAt),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export type ApplicationCommandResult = {
  entity: Application
  actingRole: ActingRole
  before: ApplicationSnapshot | null
}

/** Runs `phase` in one write transaction (the replay transaction when the command bus provides one). */
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

/** A live application of the trusted tenant, row-locked as `authorizeScoped` asks. */
export function applicationLoader(ctx: CommandRuntimeContext) {
  return (em: EntityManager, id: string, lock: TargetLock): Promise<Application | null> => {
    const tenantId = trustedScopeOf(ctx)?.tenantId
    if (!tenantId) return Promise.resolve(null)
    return em.findOne(Application, { id, tenantId, deletedAt: null, state: { $ne: 'unconfirmed' } }, lock)
  }
}

/** The spec of a decision on an application: the section is the scope target (BR-J5). */
export function decisionSpec<TSchema extends z.ZodType<{ id: string; updatedAt?: string }>>(
  input: TSchema,
  ctx: CommandRuntimeContext,
): AuthorizeScopedSpec<TSchema, Application> {
  return {
    input,
    resourceKind: APPLICATION_RESOURCE_KIND,
    allowedKinds: DECIDE_KINDS,
    loadTarget: (parsed, em, lock) => applicationLoader(ctx)(em, parsed.id, lock),
    resolveTarget: (_parsed, entity) => ({
      id: (entity as Application).id,
      tenantId: (entity as Application).tenantId,
      organizationId: (entity as Application).organizationId,
      sectionId: (entity as Application).sectionId,
    }),
    expectedUpdatedAt: (parsed) => parsed.updatedAt,
  }
}

function errorCodeOf(error: unknown): string | null {
  const body = (error as { body?: { code?: unknown } } | null)?.body
  return typeof body?.code === 'string' ? body.code : null
}

/**
 * `authorizeScoped` for a decision, where an application of a section the caller does not coordinate answers 404 like
 * an unknown one (BR-J5, D-034 style), never 403.
 */
export async function authorizeDecision<TSchema extends z.ZodType<{ id: string; updatedAt?: string }>>(
  input: TSchema,
  rawInput: unknown,
  ctx: CommandRuntimeContext,
  em: EntityManager,
) {
  try {
    return await authorizeScoped(decisionSpec(input, ctx), rawInput, ctx, em)
  } catch (error: unknown) {
    if (errorCodeOf(error) === 'scope_denied') return enrolmentErrors.throw('application_not_found')
    throw error
  }
}

/** Throws a coded error that also carries a field error on `field` (the form shows it at the field). */
export async function throwFieldError(code: EnrolmentErrorCode, field: string): Promise<never> {
  const error = await enrolmentErrors.create(code, { field })
  error.body = { ...error.body, fieldErrors: { [field]: String(error.body.error ?? code) } }
  throw error
}

/** Emits an `enrolment.*` event after commit, persistent, with the trusted scope next to the ids-only payload. */
export function emitAfterCommit(
  eventId: EnrolmentEventId,
  scope: EnrolmentScope,
  payload: Record<string, unknown>,
): Promise<void> {
  return emitEnrolmentEvent(eventId, { ...payload, ...scope }, { persistent: true, ...scope })
}

export async function enrolmentLog(args: {
  result: ApplicationCommandResult
  labelKey: string
  fallback: string
  context?: Record<string, unknown>
}) {
  const { translate } = await resolveTranslations()
  const after = applicationSnapshot(args.result.entity)
  return {
    actionLabel: translate(args.labelKey, args.fallback),
    resourceKind: APPLICATION_RESOURCE_KIND,
    resourceId: args.result.entity.id,
    tenantId: args.result.entity.tenantId,
    organizationId: args.result.entity.organizationId,
    snapshotBefore: args.result.before,
    snapshotAfter: after,
    payload: { undo: { before: args.result.before, after } },
    context: { actingRole: args.result.actingRole, ...(args.context ?? {}) },
  }
}

/** Re-authorizes an undo on the current scope inside the replay transaction and returns the row. */
export async function authorizeApplicationReplay(
  ctx: CommandRuntimeContext,
  id: string | null | undefined,
): Promise<Application> {
  const em = ctx.transactionalEm
  if (!em || !id) throw new Error('[internal] replay needs the replay transaction and the application id')
  const { entity } = await authorizeScoped(decisionSpec(z.object({ id: z.uuid() }), ctx), { id }, ctx, em, {
    mode: 'replay',
  })
  return entity as Application
}
