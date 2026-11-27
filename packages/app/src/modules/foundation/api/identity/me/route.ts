// `GET /api/foundation/identity/me` (social sign-in spec API table; REQ-S02; #566): the signed-in user's linked
// identities in the trusted organization, whether one may be removed (`canUnlink`: false while it would leave the
// account without a password or another link) and each provider's state (enabled, linked). `secondFactorRequired`
// (staff second factor phase 2, #841) says the user holds `foundation.second_factor.required`, for the profile line.
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { z } from 'zod'
import { trustedScopeOf } from '../../../services/authorize-scoped'
import { listIdentities } from '../../../services/identity-links'
import { providerConfig } from '../../../services/identity-providers'
import { commandContextForRequest, errorResponse } from '../../../services/route-context'
import { holdsSecondFactorRequirement } from '../../../services/second-factor/requirement'
import { identityErrorSchema, identityListSchema } from '../shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['foundation.identity.self'] },
}

export async function GET(request: Request): Promise<Response> {
  try {
    const ctx = await commandContextForRequest(request)
    const scope = ctx ? trustedScopeOf(ctx) : null
    if (!ctx?.auth || !scope) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const list = await listIdentities(
      ctx.container,
      scope,
      ctx.auth.sub,
      (provider) => providerConfig(provider) !== null,
    )
    const secondFactorRequired = await holdsSecondFactorRequirement(ctx.container, ctx.auth.sub, scope)
    return Response.json({ ...list, secondFactorRequired }, { headers: { 'Cache-Control': 'private, no-store' } })
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
        'The linked identities of the signed-in user (provider, the e-mail shared at link time, dates and the lock token), `canUnlink`, the enabled providers and `secondFactorRequired`.',
      responses: [
        {
          status: 200,
          description: 'Own identities',
          schema: identityListSchema.extend({
            secondFactorRequired: z
              .boolean()
              .describe('The user signs in with a second factor: Google, or the password and an e-mail code (#841)'),
          }),
        },
      ],
      errors: [{ status: 401, description: 'Unauthorized', schema: identityErrorSchema }],
    },
  },
}
