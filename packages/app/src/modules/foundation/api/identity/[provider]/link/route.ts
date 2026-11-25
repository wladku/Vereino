// `POST /api/foundation/identity/{provider}/link` (social sign-in spec API table; REQ-S02; #566): the signed-in user
// asks to connect a provider. Refuses a disabled provider (404 `identity_provider_disabled`) and a provider already
// linked to this user (409 `identity_already_linked`); otherwise answers 303 to `start`, which — with this session —
// runs the round trip with the `link` purpose, and the callback runs the command `foundation.identity.link`.
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { buildSafeRedirectResponse } from '@open-mercato/core/modules/auth/lib/requestRedirect'
import { foundationErrors } from '../../../errors'
import { trustedScopeOf } from '../../../../services/authorize-scoped'
import { ownLinkCount } from '../../../../services/identity-links'
import { providerConfig } from '../../../../services/identity-providers'
import { commandContextForRequest, errorResponse } from '../../../../services/route-context'
import { identityErrorSchema, providerParamsSchema } from '../../shared'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['foundation.identity.self'] },
}

export async function POST(request: Request, context: { params: Promise<{ provider: string }> }): Promise<Response> {
  try {
    const ctx = await commandContextForRequest(request)
    const scope = ctx ? trustedScopeOf(ctx) : null
    if (!ctx?.auth || !scope) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const params = providerParamsSchema.safeParse(await context.params)
    if (!params.success || !providerConfig(params.data.provider)) {
      return await foundationErrors.throw('identity_provider_disabled')
    }
    const provider = params.data.provider
    if ((await ownLinkCount(ctx.container, scope, ctx.auth.sub, provider)) > 0) {
      return await foundationErrors.throw('identity_already_linked')
    }
    return buildSafeRedirectResponse(request, `/api/foundation/identity/${provider}/start`, 303)
  } catch (error: unknown) {
    return errorResponse(error, 'foundation.identity.link')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Foundation',
  summary: 'Connect a sign-in provider',
  methods: {
    POST: {
      summary: 'Start linking a provider to the signed-in user',
      description:
        'Answers 303 to the provider `start` route, which runs the round trip with the link purpose for this session. The link itself is created by the callback (command `foundation.identity.link`).',
      responses: [{ status: 303, description: 'Redirect to `start`', mediaType: 'text/html' }],
      errors: [
        { status: 401, description: 'Unauthorized', schema: identityErrorSchema },
        { status: 404, description: '`identity_provider_disabled`', schema: identityErrorSchema },
        { status: 409, description: '`identity_already_linked`', schema: identityErrorSchema },
      ],
    },
  },
}
