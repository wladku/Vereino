// `GET /api/people/role-assignments/{id}` — one assignment, guarded by `assertInScope` with the list's grant kinds.
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import {
  assertInScope,
  commandContextForRequest,
  errorResponse,
  scopeContract,
  trustedScopeOf,
} from '@/modules/foundation'
import { findRoleAssignment } from '../../../services/people-read'
import { ASSIGNMENT_READ_KINDS, errorSchema, roleAssignmentView, roleAssignmentViewSchema } from '../../shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['people.view'] },
}

const paramsSchema = z.object({ id: z.uuid() })

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = paramsSchema.parse(await context.params)
    const ctx = await commandContextForRequest(request)
    const scope = ctx ? trustedScopeOf(ctx) : null
    if (!ctx || !scope) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const row = await findRoleAssignment(ctx.container, scope, id)
    if (!row) return Response.json({ error: 'Not found' }, { status: 404 })
    await assertInScope(await scopeContract.resolve(ctx), ASSIGNMENT_READ_KINDS, {
      id: row.id,
      tenantId: row.tenantId,
      organizationId: row.organizationId,
      personId: row.personId,
      sectionId: row.sectionId ?? null,
    })
    return Response.json(roleAssignmentView(row))
  } catch (error: unknown) {
    return errorResponse(error, 'people.role_assignments.detail')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'People',
  summary: 'Role assignment detail',
  methods: {
    GET: {
      summary: 'Read one role assignment',
      description: 'Returns the assignment when it is in the record scope of the caller.',
      responses: [{ status: 200, description: 'The assignment', schema: roleAssignmentViewSchema }],
      errors: [
        { status: 403, description: 'scope_denied', schema: errorSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
      ],
    },
  },
}
