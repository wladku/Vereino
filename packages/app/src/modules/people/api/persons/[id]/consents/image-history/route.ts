// `GET /api/people/persons/{id}/consents/image-history` (event photos spec API table, REQ-I07; #871): the club
// administrator reads any person's image consent history on B-10 (the `club_admin` grant through `assertInScope`; a
// person of another club, an unknown id, and a coordinator's read answer 404 or 403 as every person route does).
import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import {
  assertInScope,
  commandContextForRequest,
  errorResponse,
  scopeContract,
  trustedScopeOf,
} from '@/modules/foundation'
import { clubToday } from '../../../../../services/club-clock'
import { imageHistory } from '../../../../../services/image-history'
import { findPerson } from '../../../../../services/people-read'
import { errorSchema, imageHistoryQuerySchema, imageHistorySchema } from '../../../../shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['people.manage'] },
}

const paramsSchema = z.object({ id: z.uuid() })

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = paramsSchema.parse(await context.params)
    const query = imageHistoryQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams))
    const ctx = await commandContextForRequest(request)
    const scope = ctx ? trustedScopeOf(ctx) : null
    if (!ctx?.auth || !scope) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const person = await findPerson(ctx.container, scope, id)
    if (!person) return Response.json({ error: 'Not found' }, { status: 404 })
    await assertInScope(await scopeContract.resolve(ctx), ['club_admin'], {
      id: person.id,
      tenantId: person.tenantId,
      organizationId: person.organizationId,
      personId: person.id,
    })
    const em = ctx.container.resolve<EntityManager>('em').fork()
    const today = await clubToday(ctx.container, scope, undefined, em)
    const history = await imageHistory(em, ctx.container, scope, person.id, query.page, query.pageSize, today)
    return Response.json(history, { headers: { 'cache-control': 'private, no-store' } })
  } catch (error: unknown) {
    return errorResponse(error, 'people.persons.image_history')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'People',
  summary: 'Image consent history (club administrator)',
  methods: {
    GET: {
      summary: "A person's image consent history",
      description:
        'Each decision of the image consent with its date, its author (a family member by name, staff by role) and whether it was given to the current wording, newest first; `earlier` lists decisions stored before history was kept. The club administrator only (`club_admin` grant).',
      query: imageHistoryQuerySchema,
      responses: [{ status: 200, description: 'One page of the history', schema: imageHistorySchema }],
      errors: [
        { status: 400, description: 'Validation failed', schema: errorSchema },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 403, description: 'scope_denied', schema: errorSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
      ],
    },
  },
}
