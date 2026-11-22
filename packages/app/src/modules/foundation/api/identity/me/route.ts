// `GET /api/foundation/identity/me` (social sign-in spec API table; REQ-S02; #566): the signed-in user's linked
// identities in the trusted organization, whether one may be removed (`canUnlink`: false while it would leave the
// account without a password or another link) and each provider's state (enabled, linked).
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { trustedScopeOf } from '../../../services/authorize-scoped'
import { listIdentities } from '../../../services/identity-links'
import { providerConfig } from '../../../services/identity-providers'
import { commandContextForRequest, errorResponse } from '../../../services/route-context'
import { identityErrorSchema, identityListSchema } from '../shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['foundation.identity.self'] },
}

export async function GET(request: Request): Promise<Response> {
  try {
    const ctx = await commandContextForRequest(request)
    const scope = ctx ? trustedScopeOf(ctx) : null
    if (!ctx?.auth || !scope) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const list = await listIdentities(ctx.container, scope, ctx.auth.sub, (provider) => providerConfig(provider) !== null)
    return Response.json(list, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error: unknown) {
    return errorResponse(error, 'foundation.identity.me')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Foundation',
  summary: 'Own sign-in identities',
  methods: {
    GET: {
      summary: 'List own linked identities',
      description:
        'The linked identities of the signed-in user (provider, the e-mail shared at link time, dates and the lock token), `canUnlink` and the enabled providers.',
      responses: [{ status: 200, description: 'Own identities', schema: identityListSchema }],
      errors: [{ status: 401, description: 'Unauthorized', schema: identityErrorSchema }],
    },
  },
}
