// P-03 scope resolver (DD-F03): the registered scope provider (`people.scopeService`, registered under
// `vereino.scopeProvider`) supplies the person grants; the foundation adds `self_user` from `ctx.auth.sub`.
// No provider, no linked person or no organization yields only `self_user`, so record reads see nothing.
import { getTelemetryRuntime } from '@open-mercato/shared/lib/telemetry/runtime'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { sanitizeProviderGrants, unionScopes, type Scope } from '@vereino/core'

/** DI token under which exactly one module registers its `ScopeProvider` (the `people` module). */
export const SCOPE_PROVIDER_TOKEN = 'vereino.scopeProvider'

/** The user whose grants are resolved, in the trusted tenant and organization of the request. */
export type ScopeSubject = {
  userId: string
  tenantId: string
  organizationId: string
}

/** The person whose grants a token link carries (P-10), in the tenant and organization of the link. */
export type PersonScopeSubject = {
  personId: string
  tenantId: string
  organizationId: string
}

/**
 * Contract of the scope provider: the grants of the person linked to the user (an empty list when no person is
 * linked), and the grants of a person by id for a token link's subject (an empty list for an unknown person). Only
 * the kinds `club_admin`, `coordinator`, `coach`, `guardian` and `self` are accepted; any other or malformed grant
 * is dropped.
 */
export type ScopeProvider = {
  grantsForUser(subject: ScopeSubject): Promise<Scope>
  grantsForPerson(subject: PersonScopeSubject): Promise<Scope>
}

export type ScopeResolutionContext = Pick<CommandRuntimeContext, 'container' | 'auth' | 'selectedOrganizationId'>

/**
 * Resolves the session user's scope. A provider that throws fails closed: the error is reported with the
 * fingerprint `foundation.scope.provider_failed` and an uncoded 500 follows.
 */
export async function resolveScope(ctx: ScopeResolutionContext): Promise<Scope> {
  const userId = ctx.auth?.sub
  if (!userId) return []
  const selfUser: Scope = [{ kind: 'self_user', ids: [userId] }]
  const tenantId = ctx.auth?.tenantId
  const organizationId = ctx.selectedOrganizationId ?? ctx.auth?.orgId
  if (!tenantId || !organizationId || !ctx.container.hasRegistration(SCOPE_PROVIDER_TOKEN)) return selfUser
  const provider = ctx.container.resolve<ScopeProvider>(SCOPE_PROVIDER_TOKEN)
  let grants: unknown
  try {
    grants = await provider.grantsForUser({ userId, tenantId, organizationId })
  } catch (error: unknown) {
    getTelemetryRuntime()?.reportError(error, { module: 'foundation', code: 'foundation.scope.provider_failed' })
    throw new Error('[internal] the scope provider failed', { cause: error })
  }
  return unionScopes(sanitizeProviderGrants(grants), selfUser)
}

/**
 * The current grants of a token link's subject (P-10; foundation spec REQ-F07): the person's grants on today's date,
 * without `self_user` (a link carries no session). No provider yields no grants; a provider that throws fails closed
 * like `resolveScope`.
 */
export async function resolveScopeForPerson(
  ctx: Pick<CommandRuntimeContext, 'container'>,
  subject: PersonScopeSubject,
): Promise<Scope> {
  if (!ctx.container.hasRegistration(SCOPE_PROVIDER_TOKEN)) return []
  const provider = ctx.container.resolve<ScopeProvider>(SCOPE_PROVIDER_TOKEN)
  let grants: unknown
  try {
    grants = await provider.grantsForPerson(subject)
  } catch (error: unknown) {
    getTelemetryRuntime()?.reportError(error, { module: 'foundation', code: 'foundation.scope.provider_failed' })
    throw new Error('[internal] the scope provider failed', { cause: error })
  }
  return sanitizeProviderGrants(grants)
}

/** The scope contract consumed by commands (`authorizeScoped`), list routes (`scopeWhere`) and detail guards. */
export const scopeContract = { resolve: resolveScope, resolveForPerson: resolveScopeForPerson } as const
