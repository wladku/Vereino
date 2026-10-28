// `GET /api/people/persons/{id}` — one person, guarded by `assertInScope` with the list's grant kinds; the PESEL is
// returned only to a user with `people.pesel.view` (club spec *Data Models*, TEST-004; foundation TEST-F06).
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
import { findPerson } from '../../../services/people-read'
import { PERSON_READ_KINDS, errorSchema, personView, personViewSchema } from '../../shared'

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
    const person = await findPerson(ctx.container, scope, id)
    if (!person) return Response.json({ error: 'Not found' }, { status: 404 })
    await assertInScope(await scopeContract.resolve(ctx), PERSON_READ_KINDS, {
      id: person.id,
      tenantId: person.tenantId,
      organizationId: person.organizationId,
      personId: person.id,
    })
    const rbac = ctx.container.resolve<RbacService>('rbacService')
    const withPesel = await rbac.userHasAllFeatures(ctx.auth.sub, ['people.pesel.view'], scope)
    return Response.json(personView(person, { withPesel }))
  } catch (error: unknown) {
    return errorResponse(error, 'people.persons.detail')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'People',
  summary: 'Person detail',
  methods: {
    GET: {
      summary: 'Read one person',
      description: "Returns the person when it is in the caller's record scope; `pesel` only with `people.pesel.view`.",
      responses: [{ status: 200, description: 'The person', schema: personViewSchema }],
      errors: [
        { status: 403, description: 'scope_denied', schema: errorSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
      ],
    },
  },
}
