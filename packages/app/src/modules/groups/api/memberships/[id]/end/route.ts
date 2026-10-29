// `POST /api/groups/memberships/{id}/end` — `groups.memberships.end`: `validTo` becomes the membership's last active
// day (default: today in the club zone); the row stays as the roster's history.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import type { MembershipCommandResult } from '../../../../commands/memberships'
import { errorSchema, membershipListItemSchema, membershipView } from '../../../shared'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['groups.manage'] },
}

const paramsSchema = z.object({ id: z.uuid() })
const bodySchema = z.object({ validTo: z.string().optional() })

const responseSchema = membershipListItemSchema.omit({ person: true }).extend({ actingRole: z.string() })

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = paramsSchema.parse(await context.params)
    const ctx = await commandContextForRequest(request)
    if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const body: unknown = await request.json().catch(() => ({}))
    const commandBus = ctx.container.resolve<CommandBus>('commandBus')
    const { result } = await commandBus.execute<unknown, MembershipCommandResult>('groups.memberships.end', {
      input: { ...(typeof body === 'object' && body !== null ? body : {}), id },
      ctx,
    })
    return Response.json({ ...membershipView(result.entity), actingRole: result.actingRole })
  } catch (error: unknown) {
    return errorResponse(error, 'groups.memberships.end')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Groups',
  summary: 'End a membership',
  methods: {
    POST: {
      summary: 'End a group membership',
      description:
        'Sets the last active day (default: today in the club zone); the membership stays in the roster history. Send the lock token in the platform optimistic-lock header. Errors: 403 `scope_denied`, 404, 409 `optimistic_lock_conflict`, 422 `validity_inverted`.',
      requestBody: { contentType: 'application/json', schema: bodySchema },
      responses: [{ status: 200, description: 'The ended membership', schema: responseSchema }],
      errors: [
        { status: 403, description: 'scope_denied', schema: errorSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
        { status: 409, description: 'optimistic_lock_conflict', schema: errorSchema },
        { status: 422, description: 'validity_inverted', schema: errorSchema },
      ],
    },
  },
}
