// `GET /api/payments/lookups?kind=` (payments spec DD-33; issue #245): the names the Finance forms offer — the fee's
// group or activity, the order campaign's section and the groups of a section, the custom discount's and the manual
// charge's person. The treasurer holds no `groups.*`, `activities.*`, `people.*` or `club_core.*` feature, so the forms
// read these names here, through the owning modules' DI directories, within the club-wide `payments` grant. Persons:
// `search` (three letters or more) through the people directory's name index; without one, the persons the club
// already charges (debtors and payers); `ids` answers exactly those persons (the labels of a saved selection).
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import {
  assertInScope,
  commandContextForRequest,
  errorResponse,
  scopeContract,
  trustedScopeOf,
} from '@/modules/foundation'
import { lookupsQuerySchema } from '../../data/validators'
import { lookupPage } from '../../lib/lookups'
import { lookupItems } from '../../services/lookups'
import { PAYMENTS_READ_KINDS, errorSchema } from '../shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['payments.view'] },
}

const itemSchema = z.object({
  id: z.uuid(),
  label: z.string(),
  sectionId: z.string().nullable().describe('The section of a group or an activity'),
  sectionName: z.string().nullable().describe('The section name of a group'),
})

const responseSchema = z.object({
  items: z.array(itemSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
  totalPages: z.number().int(),
})

export async function GET(request: Request): Promise<Response> {
  try {
    const ctx = await commandContextForRequest(request)
    const scope = ctx ? trustedScopeOf(ctx) : null
    if (!ctx || !scope) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const query = lookupsQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams))
    await assertInScope(await scopeContract.resolve(ctx), PAYMENTS_READ_KINDS, {
      id: scope.organizationId,
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
    })
    const found = await lookupItems(ctx.container, scope, query)
    // Persons arrive already narrowed by the name index (or by `ids`); the other kinds are matched here.
    const search = query.kind === 'persons' || query.ids ? undefined : query.search
    const ids = query.ids ? new Set(query.ids) : null
    return Response.json(
      lookupPage(ids ? found.filter((item) => ids.has(item.id)) : found, {
        search,
        page: query.page,
        pageSize: query.pageSize,
      }),
    )
  } catch (error: unknown) {
    return errorResponse(error, 'payments.lookups')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Payments',
  summary: 'Names for the Finance forms',
  methods: {
    GET: {
      summary: 'Groups, activities, sections or persons a Finance form offers',
      description:
        "The club's live active groups (optionally of one `sectionId`), activities or sections, or persons, by name. For groups, activities and sections `search` matches every word of the name. For persons, `search` (three letters or more) matches the name through the people directory; without it, the persons the club already charges are offered. `ids` (comma-separated) answers exactly those records — the labels of a saved selection.",
      query: lookupsQuerySchema,
      responses: [{ status: 200, description: 'The names', schema: responseSchema }],
      errors: [
        { status: 400, description: 'Invalid input', schema: errorSchema },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 403, description: 'scope_denied', schema: errorSchema },
      ],
    },
  },
}
