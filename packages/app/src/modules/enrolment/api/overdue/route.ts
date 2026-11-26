// `GET /api/enrolment/overdue` (sign-up form spec B-J1, REQ-J17, *Answer time*; #799): the number of the club's
// applications past the answer time — the administrator's dashboard widget.
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { errorResponse } from '@/modules/foundation'
import { overdueCount } from '../../services/views'
import { errorSchema, memberContext } from '../shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['enrolment.manage'] },
}

export async function GET(request: Request): Promise<Response> {
  try {
    const member = await memberContext(request)
    if (!member.ok) return member.error
    const count = await overdueCount({ container: member.ctx.container, scope: member.scope, grants: member.grants })
    return Response.json({ count }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error: unknown) {
    return errorResponse(error, 'enrolment.overdue')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Enrolment',
  summary: 'Overdue applications',
  methods: {
    GET: {
      summary: 'The number of applications past the answer time',
      responses: [{ status: 200, description: 'The count', schema: z.object({ count: z.number().int() }) }],
      errors: [{ status: 401, description: 'Unauthorized', schema: errorSchema }],
    },
  },
}
