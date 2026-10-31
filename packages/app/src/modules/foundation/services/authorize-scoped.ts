// P-02 authorizeScoped + assertInScope (DD-F04, DD-F08, DD-F14, DD-F18). A module's `CommandHandler` calls
// `authorizeScoped` at the start of `execute`, inside its write transaction (`runCrudCommandWrite` /
// `withAtomicFlush`), and again from `authorizeReplay` with `{ mode: 'replay' }` (`atomicReplay: true`), so undo
// and redo check the current scope in the replay transaction. Never call it from `prepare`: the command bus
// keeps only `{ before }` from `prepare`, which runs before the transaction.
import { LockMode } from '@mikro-orm/core'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import type { z } from 'zod'
import { parseWithCustomFields } from '@open-mercato/shared/lib/commands/helpers'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { notFound } from '@open-mercato/shared/lib/crud/errors'
import {
  enforceCommandOptimisticLockWithGuards,
  readOptimisticLockExpected,
} from '@open-mercato/shared/lib/crud/optimistic-lock-command'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import {
  findActingRole,
  type ActingRole,
  type GrantKind,
  type Scope,
  type ScopeMatchOptions,
  type ScopeTarget,
} from '@vereino/core'
import { foundationErrors } from '../api/errors'
import { codedIssueErrorCode } from '../lib/validity-schema'
import { resolveScope } from './scope-contract'

/**
 * Where the scope comes from. Omitted: the session (`scopeContract.resolve(ctx)`). `marker`: only the `self_user`
 * grant of `ctx.auth.sub`, for commands on the caller's own user record. `job`: one `system_job` grant for the
 * organization of a scheduled job's registration (see `jobCommandContext`); accepted only by a command that
 * lists `system_job`. Token links (phase C) add a token source.
 */
export type ScopeSource = { marker: true } | { job: true }

/** Lock options `loadTarget` passes to its `findOne`: the target row is loaded `SELECT … FOR UPDATE`. */
export type TargetLock = { lockMode: LockMode.PESSIMISTIC_WRITE }

/** The trusted tenant and organization the scope was derived for. */
export type TrustedScope = { tenantId: string; organizationId: string }

export type AuthorizeScopedSpec<TSchema extends z.ZodType, TEntity extends object> = {
  /** Input schema, parsed with `parseWithCustomFields`. */
  input: TSchema
  /** Resource kind for the optimistic lock, e.g. `people.role_assignment`. */
  resourceKind: string
  /** Grant kinds the command accepts, least-privileged first (DD-F08). */
  allowedKinds: readonly GrantKind[]
  /**
   * Per-resource matching options for the scope check (`clubWideKinds`), the same the resource's list passes to
   * `scopeWhere` — e.g. a club-wide dictionary every coordinator may maintain (#30).
   */
  matchOptions?: ScopeMatchOptions
  /** Loads the target with the given lock options (omit for a create); null answers 404. */
  loadTarget?: (parsed: z.output<TSchema>, em: EntityManager, lock: TargetLock) => Promise<TEntity | null>
  /** Describes the target for the scope check; for a create, the record about to be created. */
  resolveTarget: (parsed: z.output<TSchema>, entity: TEntity | null, scope: TrustedScope) => ScopeTarget
  /**
   * `updated_at` (default) requires the client's lock token for a loaded target (400 `lock_token_required` when it
   * is missing or not a timestamp, S5.2) and compares it with the row's `updatedAt` (409 when stale). `none` is for
   * targets the caller does not edit as a versioned record: a job, a self-service declaration, an append to a parent.
   */
  lock?: 'updated_at' | 'none'
  /** The lock token when the input carries it as a field; otherwise the platform header is read. */
  expectedUpdatedAt?: (parsed: z.output<TSchema>) => string | Date | null | undefined
  /**
   * True for a row-locked target the client could not have read a version of — a singleton the command created
   * with its defaults and nobody has edited yet — so a missing token is accepted; a sent token is still compared.
   */
  acceptsMissingToken?: (entity: TEntity) => boolean
  scopeSource?: ScopeSource
}

export type AuthorizeScopedOptions = {
  /**
   * `replay` (undo/redo through `authorizeReplay`) skips the lock token; the scope is checked anew. A redo that
   * replays `execute` (the context carries the audit route's `replayTransactionGuard`) is treated the same way.
   */
  mode?: 'execute' | 'replay'
}

export type AuthorizedCommand<TSchema extends z.ZodType, TEntity extends object> = {
  parsed: z.output<TSchema>
  /** Custom-field values split off the input by `parseWithCustomFields`. */
  custom: Record<string, unknown>
  scope: Scope
  /** Server-derived role recorded in the command result and the log's `context.actingRole` (`buildLog`). */
  actingRole: ActingRole
  target: ScopeTarget
  /** The row-locked target, or null for a create. */
  entity: TEntity | null
  tenantId: string
  organizationId: string
}

type VersionedEntity = { readonly updatedAt?: Date | string | null }

function isZodError(error: unknown): error is Error & { issues: readonly object[] } {
  return error instanceof Error && error.name === 'ZodError' && Array.isArray((error as { issues?: unknown }).issues)
}

async function parseInput<TSchema extends z.ZodType>(
  schema: TSchema,
  input: unknown,
): Promise<{ parsed: z.output<TSchema>; custom: Record<string, unknown> }> {
  try {
    return parseWithCustomFields(schema, input)
  } catch (error: unknown) {
    if (isZodError(error) && codedIssueErrorCode(error.issues) === 'validity_inverted') {
      return foundationErrors.throw('validity_inverted')
    }
    throw error
  }
}

function sessionScope(ctx: CommandRuntimeContext): TrustedScope | null {
  const tenantId = ctx.auth?.tenantId
  const organizationId = ctx.selectedOrganizationId ?? ctx.auth?.orgId
  if (!ctx.auth?.sub || !tenantId || !organizationId || ctx.organizationScope?.selectionRejected) return null
  return { tenantId, organizationId }
}

function jobScope(ctx: CommandRuntimeContext): TrustedScope | null {
  // A job context has no session; a request that carries one can never act as a job.
  const tenantId = ctx.organizationScope?.tenantId
  const organizationId = ctx.selectedOrganizationId
  if (ctx.auth || ctx.systemActor !== true || !tenantId || !organizationId) return null
  return { tenantId, organizationId }
}

/**
 * The trusted tenant and organization `authorizeScoped` derives for a context: the session's
 * (`auth.tenantId`, `selectedOrganizationId ?? auth.orgId`), or the job registration's for `{ job: true }`; null
 * when the context has none. A command uses it to narrow its own target lookup to the tenant before the scope
 * check; it is a derivation, not an authorization.
 */
export function trustedScopeOf(ctx: CommandRuntimeContext, source?: ScopeSource): TrustedScope | null {
  if (source && 'job' in source) return jobScope(ctx)
  return sessionScope(ctx)
}

async function deriveScope(
  source: ScopeSource | undefined,
  ctx: CommandRuntimeContext,
): Promise<(TrustedScope & { scope: Scope }) | null> {
  if (source && 'job' in source) {
    const job = jobScope(ctx)
    return job ? { ...job, scope: [{ kind: 'system_job' }] } : null
  }
  const trusted = sessionScope(ctx)
  if (!trusted || !ctx.auth) return null
  if (source && 'marker' in source) {
    return { ...trusted, scope: [{ kind: 'self_user', ids: [ctx.auth.sub] }] }
  }
  return { ...trusted, scope: await resolveScope(ctx) }
}

/**
 * The acting role of the first allowed grant containing the target (least-privileged first); throws 403
 * `scope_denied` when none does. Detail routes use it with `scopeContract.resolve(ctx)` and the same kinds and
 * options (`clubWideKinds`) as their list's `scopeWhere`.
 */
export async function assertInScope(
  scope: Scope,
  kinds: readonly GrantKind[],
  target: ScopeTarget,
  options?: ScopeMatchOptions,
): Promise<ActingRole> {
  const actingRole = findActingRole(scope, kinds, target, options)
  if (!actingRole) return foundationErrors.throw('scope_denied')
  return actingRole
}

/**
 * The client's lock token as an ISO instant: the input field when the spec reads one, otherwise the platform header;
 * null when absent or not a timestamp (the platform would skip such a token as silently as a missing one).
 */
function lockTokenOf(explicit: string | Date | null | undefined, request: Request | null): string | null {
  const raw = explicit ?? readOptimisticLockExpected(request)
  if (raw == null) return null
  const ms = raw instanceof Date ? raw.getTime() : Date.parse(raw.trim())
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null
}

/**
 * Parses the input, derives the trusted scope, loads and row-locks the target, checks it against the allowed
 * grants (403 `scope_denied`), requires the lock token (400 `lock_token_required`), asserts it on the locked row
 * (409 `optimistic_lock_conflict`) and returns the acting role. `em` is the command's transactional EntityManager.
 */
export async function authorizeScoped<TSchema extends z.ZodType, TEntity extends object & VersionedEntity>(
  spec: AuthorizeScopedSpec<TSchema, TEntity>,
  input: unknown,
  ctx: CommandRuntimeContext,
  em: EntityManager,
  options: AuthorizeScopedOptions = {},
): Promise<AuthorizedCommand<TSchema, TEntity>> {
  if (!em.isInTransaction()) {
    throw new Error('[internal] authorizeScoped must run inside the write transaction (foundation DD-F18)')
  }
  const { parsed, custom } = await parseInput(spec.input, input)
  const derived = await deriveScope(spec.scopeSource, ctx)
  if (!derived) return foundationErrors.throw('scope_denied')
  const { tenantId, organizationId, scope } = derived

  let entity: TEntity | null = null
  if (spec.loadTarget) {
    entity = await spec.loadTarget(parsed, em, { lockMode: LockMode.PESSIMISTIC_WRITE })
    if (!entity) {
      const { translate } = await resolveTranslations()
      throw notFound(translate('foundation.errors.not_found', 'Not found'))
    }
  }

  const target = spec.resolveTarget(parsed, entity, { tenantId, organizationId })
  if (target.tenantId !== tenantId || target.organizationId !== organizationId) {
    return foundationErrors.throw('scope_denied')
  }
  const actingRole = await assertInScope(scope, spec.allowedKinds, target, spec.matchOptions)

  // A redo replays `execute` from the audit route, which sets `replayTransactionGuard` and sends no lock token: like
  // an undo it is checked against the current scope, not against a version the client never loaded.
  const replaying = options.mode === 'replay' || ctx.replayTransactionGuard !== undefined
  if (entity && (spec.lock ?? 'updated_at') === 'updated_at' && !replaying) {
    // The platform's check is a no-op without a token, so a client that sends none would overwrite newer data.
    const expected = lockTokenOf(spec.expectedUpdatedAt?.(parsed), ctx.request ?? null)
    if (expected) {
      await enforceCommandOptimisticLockWithGuards(ctx.container, {
        resourceKind: spec.resourceKind,
        resourceId: target.id,
        current: entity.updatedAt ?? null,
        expected,
        request: ctx.request ?? null,
      })
    } else if (spec.acceptsMissingToken?.(entity) !== true) {
      return foundationErrors.throw('lock_token_required')
    }
  }

  return { parsed, custom, scope, actingRole, target, entity, tenantId, organizationId }
}

/**
 * The command context a worker passes to the module command it dispatches: no session, the system-actor flag
 * and the organization of the job's registration (the scope the scheduler injected, re-validated by the worker).
 */
export function jobCommandContext(container: AwilixContainer, scope: TrustedScope): CommandRuntimeContext {
  return {
    container,
    auth: null,
    organizationScope: {
      selectedId: scope.organizationId,
      filterIds: [scope.organizationId],
      allowedIds: [scope.organizationId],
      tenantId: scope.tenantId,
    },
    selectedOrganizationId: scope.organizationId,
    organizationIds: [scope.organizationId],
    systemActor: true,
  }
}
