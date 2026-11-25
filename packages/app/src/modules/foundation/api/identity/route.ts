// `GET /api/foundation/identity?personId=` (social sign-in spec API table; REQ-S02; #566): the club administrator's
// view of one person's linked identities, shaped as `me`. The person's account comes from the contact resolver
// (`vereino.contactResolver`, registered by `people`), so `foundation` reads no `people` table; a person without an
// account has no links.
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { z } from 'zod'
import { assertInScope, trustedScopeOf } from '../../services/authorize-scoped'
import { contactResolver } from '../../services/audience'
import { listIdentities } from '../../services/identity-links'
import { providerConfig } from '../../services/identity-providers'
import { commandContextForRequest, errorResponse } from '../../services/route-context'
import { resolveScope } from '../../services/scope-contract'
import { identityErrorSchema, identityListSchema } from './shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['foundation.identity.manage'] },
}

const querySchema = z.object({ personId: z.uuid() })

export async function GET(request: Request): Promise<Response> {
  try {
    const ctx = await commandContextForRequest(request)
    const scope = ctx ? trustedScopeOf(ctx) : null
    if (!ctx?.auth || !scope) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const { personId } = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams))
    const grants = await resolveScope(ctx)
    await assertInScope(grants, ['club_admin'], { id: personId, personId, ...scope })
    const [contact] = await contactResolver(ctx.container).contacts([personId], {
      container: ctx.container,
      ...scope,
      scope: grants,
    })
    if (!contact) return Response.json({ error: 'Not found' }, { status: 404 })
    const enabled = (provider: Parameters<typeof providerConfig>[0]) => providerConfig(provider) !== null
    const list = contact.userId
      ? await listIdentities(ctx.container, scope, contact.userId, enabled)
      : { items: [], canUnlink: false, providers: [] }
    return Response.json(list, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error: unknown) {
    return errorResponse(error, 'foundation.identity.admin_list')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Foundation',
  summary: "A person's sign-in identities",
  methods: {
    GET: {
      summary: "List a person's linked identities (club administrator)",
      description: 'The linked identities of the account of `personId`, shaped as `GET /api/foundation/identity/me`.',
      query: querySchema,
      responses: [{ status: 200, description: "The person's identities", schema: identityListSchema }],
      errors: [
        { status: 400, description: 'Validation failed', schema: identityErrorSchema },
        { status: 401, description: 'Unauthorized', schema: identityErrorSchema },
        { status: 403, description: 'Forbidden, `scope_denied`', schema: identityErrorSchema },
        { status: 404, description: 'Not found', schema: identityErrorSchema },
      ],
    },
  },
}
