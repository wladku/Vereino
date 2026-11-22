// `DELETE /api/foundation/identity/{id}` — `foundation.identity.unlink` (social sign-in spec API table; REQ-S02; #566):
// the account holder removes an own link (`foundation.identity.self`), the club administrator any link of the
// organization (`foundation.identity.manage`). The link's lock token (`updatedAt`) travels in the platform
// optimistic-lock header; the last sign-in method is kept (409 `identity_last_method`). Not undoable (DD-S06).
import type { EntityManager } from '@mikro-orm/postgresql'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { z } from 'zod'
import { IdentityLink } from '../../../data/entities'
import { trustedScopeOf } from '../../../services/authorize-scoped'
import { commandContextForRequest, errorResponse } from '../../../services/route-context'
import { identityErrorSchema, sessionHasFeatures } from '../shared'

export const metadata = {
  DELETE: { requireAuth: true },
}

const paramsSchema = z.object({ id: z.uuid() })

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const ctx = await commandContextForRequest(request)
    const scope = ctx ? trustedScopeOf(ctx) : null
    if (!ctx?.auth || !scope) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const { id } = paramsSchema.parse(await context.params)
    // The feature gate: own links need `foundation.identity.self`, anyone else's `foundation.identity.manage`. The
    // command still checks the scope (`self_user` or `club_admin`) and answers 404 for a link of another organization.
    const em = ctx.container.resolve<EntityManager>('em').fork()
    const link = await em.findOne(IdentityLink, { id, ...scope, deletedAt: null }, { fields: ['id', 'userId'] })
    const feature = link && link.userId === ctx.auth.sub ? 'foundation.identity.self' : 'foundation.identity.manage'
    if (!(await sessionHasFeatures(ctx, [feature]))) return Response.json({ error: 'Forbidden' }, { status: 403 })
    await ctx.container.resolve<CommandBus>('commandBus').execute('foundation.identity.unlink', { input: { id }, ctx })
    return new Response(null, { status: 204 })
  } catch (error: unknown) {
    return errorResponse(error, 'foundation.identity.unlink')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Foundation',
  summary: 'Unlink a sign-in identity',
  methods: {
    DELETE: {
      summary: 'Remove a linked identity',
      description:
        'Removes an own link (`foundation.identity.self`) or, for the club administrator, any link of the organization (`foundation.identity.manage`). Send the link lock token (`updatedAt`) in the platform optimistic-lock header. The last sign-in method of an account cannot be removed.',
      responses: [{ status: 204, description: 'Unlinked' }],
      errors: [
        { status: 400, description: 'Validation failed, `lock_token_required`', schema: identityErrorSchema },
        { status: 401, description: 'Unauthorized', schema: identityErrorSchema },
        { status: 403, description: 'Forbidden, `scope_denied`', schema: identityErrorSchema },
        { status: 404, description: 'Not found', schema: identityErrorSchema },
        { status: 409, description: '`identity_last_method`, `optimistic_lock_conflict`', schema: identityErrorSchema },
      ],
    },
  },
}
