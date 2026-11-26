// `GET /api/enrolment/applications` (sign-up form spec M-J2, B-J1, REQ-J10, REQ-J11, BR-J5; #799): the applications
// of the sections the caller decides — a coordinator their sections, the club administrator every section — by tab
// (`new`, `trial`, `waiting`, `closed`), with the section, group, overdue and name filters. Never an unconfirmed
// application. Names are encrypted without a hash, so `q` filters in memory over the scoped rows; the Closed tab
// (the last 30 days) is not searchable. Waiting numbers are computed per group (DD-J09).
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { errorResponse } from '@/modules/foundation'
import { applicationListQuerySchema } from '../../data/validators'
import { listApplications } from '../../services/views'
import { errorSchema, listItemSchema, memberContext } from '../shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['enrolment.applications.view'] },
}

export async function GET(request: Request): Promise<Response> {
  try {
    const member = await memberContext(request)
    if (!member.ok) return member.error
    const url = new URL(request.url)
    const query = applicationListQuerySchema.parse(Object.fromEntries(url.searchParams))
    const list = await listApplications(
      { container: member.ctx.container, scope: member.scope, grants: member.grants },
      query,
    )
    return Response.json(list, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error: unknown) {
    return errorResponse(error, 'enrolment.applications.list')
  }
}

const listSchema = z.object({
  items: z.array(listItemSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
  totalPages: z.number().int(),
})

export const openApi: OpenApiRouteDoc = {
  tag: 'Enrolment',
  summary: 'Applications',
  methods: {
    GET: {
      summary: 'Applications of the sections the caller decides',
      query: applicationListQuerySchema,
      responses: [{ status: 200, description: 'A page of applications', schema: listSchema }],
      errors: [
        { status: 400, description: 'Invalid query', schema: errorSchema },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
      ],
    },
  },
}
