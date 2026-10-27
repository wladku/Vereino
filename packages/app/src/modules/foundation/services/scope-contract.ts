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

/**
 * Contract of the scope provider: the grants of the person linked to the user (an empty list when no person is
 * linked). Only the kinds `club_admin`, `coordinator`, `coach`, `guardian` and `self` are accepted; any other
 * or malformed grant is dropped.
 */
export type ScopeProvider = {
  grantsForUser(subject: ScopeSubject): Promise<Scope>
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

/** The scope contract consumed by commands (`authorizeScoped`), list routes (`scopeWhere`) and detail guards. */
export const scopeContract = { resolve: resolveScope } as const
