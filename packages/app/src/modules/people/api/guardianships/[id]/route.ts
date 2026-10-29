// `GET /api/people/guardianships/{id}` — one guardianship, guarded by `assertInScope` with the list's grant kinds and
// options; the consents only for the club administrator (`people.manage`) or a guardian of the ward.
import { z } from 'zod'
import type { RbacService } from '@open-mercato/core/modules/auth/services/rbacService'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import {
  assertInScope,
  commandContextForRequest,
  errorResponse,
  scopeContract,
  trustedScopeOf,
} from '@/modules/foundation'
import { findGuardianship } from '../../../services/people-read'
import {
  GUARDIANSHIP_READ_KINDS,
  PEOPLE_READ_OPTIONS,
  consentsVisible,
  errorSchema,
  guardianshipView,
  guardianshipViewSchema,
} from '../../shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['people.view'] },
}

const paramsSchema = z.object({ id: z.uuid() })

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = paramsSchema.parse(await context.params)
    const ctx = await commandContextForRequest(request)
    const scope = ctx ? trustedScopeOf(ctx) : null
    if (!ctx?.auth || !scope) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const row = await findGuardianship(ctx.container, scope, id)
    if (!row) return Response.json({ error: 'Not found' }, { status: 404 })
    const actingRole = await assertInScope(
      await scopeContract.resolve(ctx),
      GUARDIANSHIP_READ_KINDS,
      { id: row.id, tenantId: row.tenantId, organizationId: row.organizationId, personId: row.wardPersonId },
      PEOPLE_READ_OPTIONS,
    )
    const rbac = ctx.container.resolve<RbacService>('rbacService')
    const canManage = await rbac.userHasAllFeatures(ctx.auth.sub, ['people.manage'], scope)
    return Response.json(guardianshipView(row, { withConsents: consentsVisible(actingRole, canManage) }))
  } catch (error: unknown) {
    return errorResponse(error, 'people.guardianships.detail')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'People',
  summary: 'Guardianship detail',
  methods: {
    GET: {
      summary: 'Read one guardianship',
      description:
        "Returns the guardianship when its ward is in the caller's record scope; `consents` only for `people.manage` or a guardian of the ward (never for a coordinator).",
      responses: [{ status: 200, description: 'The guardianship', schema: guardianshipViewSchema }],
      errors: [
        { status: 403, description: 'scope_denied', schema: errorSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
      ],
    },
  },
}
