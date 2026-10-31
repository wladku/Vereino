// `POST /api/people/role-assignments/{id}/end` — `people.role_assignments.end`: `validTo` becomes the last active day
// (default: today in the club zone); the role sync revokes the role once it has passed.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import type { RoleAssignmentCommandResult } from '../../../../commands/role-assignments'
import { errorSchema, roleAssignmentView, roleAssignmentViewSchema } from '../../../shared'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['people.roles.manage'] },
}

const paramsSchema = z.object({ id: z.uuid() })
const bodySchema = z.object({ validTo: z.string().optional() })

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = paramsSchema.parse(await context.params)
    const ctx = await commandContextForRequest(request)
    if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const body: unknown = await request.json().catch(() => ({}))
    const commandBus = ctx.container.resolve<CommandBus>('commandBus')
    const { result } = await commandBus.execute<unknown, RoleAssignmentCommandResult>('people.role_assignments.end', {
      input: { ...(typeof body === 'object' && body !== null ? body : {}), id },
      ctx,
    })
    return Response.json(roleAssignmentView(result.assignment))
  } catch (error: unknown) {
    return errorResponse(error, 'people.role_assignments.end')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'People',
  summary: 'End a role assignment',
  methods: {
    POST: {
      summary: 'End a staff role assignment',
      description:
        'Sets the last active day; send the lock token in the platform optimistic-lock header (400 `lock_token_required` without it). Errors: 403 `scope_denied`, 409 `optimistic_lock_conflict`, 422 `validity_inverted`.',
      requestBody: { contentType: 'application/json', schema: bodySchema },
      responses: [{ status: 200, description: 'The ended assignment', schema: roleAssignmentViewSchema }],
      errors: [
        { status: 403, description: 'scope_denied', schema: errorSchema },
        { status: 409, description: 'optimistic_lock_conflict', schema: errorSchema },
        { status: 422, description: 'validity_inverted', schema: errorSchema },
      ],
    },
  },
}
