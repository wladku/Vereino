// Helpers for the hand-written routes of Vereino modules (action and detail routes that `makeCrudRoute` does not
// cover): the command context built the way the platform's own custom routes build it, and the JSON response of a
// thrown error. Scope still comes only from the session (`getAuthFromRequest` + the organization selection).
import { getAuthFromRequest } from '@open-mercato/shared/lib/auth/server'
import { resolveSingleOrganizationIdOrDeny } from '@open-mercato/shared/lib/auth/organizationScope'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { getCommandInterceptorHttpRejection } from '@open-mercato/shared/lib/commands/errors'
import { isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { resolveOrganizationScopeForRequest } from '@open-mercato/core/modules/directory/utils/organizationScope'

const logger = createLogger('foundation').child({ component: 'route-context' })

/**
 * The command context of an authenticated request, or null without a session. The selected organization is the
 * request's (`om_selected_org`) when the user may see it, else the user's home organization.
 */
export async function commandContextForRequest(request: Request): Promise<CommandRuntimeContext | null> {
  const auth = await getAuthFromRequest(request)
  if (!auth?.sub || !auth.tenantId) return null
  const container = await createRequestContainer()
  const scope = await resolveOrganizationScopeForRequest({ container, auth, request })
  return {
    container,
    auth,
    organizationScope: scope,
    selectedOrganizationId: resolveSingleOrganizationIdOrDeny(scope, auth) ?? null,
    organizationIds: scope.filterIds ?? (auth.orgId ? [auth.orgId] : null),
    request,
  }
}

/** The JSON response for an error thrown by a hand-written route: coded errors keep their status and body. */
export function errorResponse(error: unknown, label: string): Response {
  if (isCrudHttpError(error)) return Response.json(error.body, { status: error.status })
  const rejection = getCommandInterceptorHttpRejection(error)
  if (rejection) return Response.json(rejection.body, { status: rejection.status })
  if (error instanceof Error && error.name === 'ZodError') {
    return Response.json(
      { error: 'Validation failed', details: (error as { issues?: unknown }).issues },
      { status: 400 },
    )
  }
  logger.error('Route failed', { label, err: error })
  return Response.json({ error: 'Internal server error' }, { status: 500 })
}
