// `GET /api/activities/calendar/{id}` (club spec UI row `/club/occurrences/[id]`, REQ-006, REQ-007; #32): one session of
// the member calendar — for the caller (`as=self`) or for the wards (`as=guardian`, optionally one) — with the same
// shape and the same `calledUpChildren` rule as the calendar. A session the caller's own or wards' memberships do not
// cover does not exist for them (404), so another family's session is never described.
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse, trustedScopeOf } from '@/modules/foundation'
import { calendarItemQuerySchema } from '../../../data/validators'
import { readCalendarItem } from '../../../services/calendar'
import { calendarEntrySchema, errorSchema } from '../../shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['people.self'] },
}

const paramsSchema = z.object({ id: z.uuid() })

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = paramsSchema.parse(await context.params)
    const ctx = await commandContextForRequest(request)
    const scope = ctx ? trustedScopeOf(ctx) : null
    if (!ctx || !scope) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const query = calendarItemQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams))
    const item = await readCalendarItem(ctx, scope, id, query.as, query.personId)
    if (!item) return Response.json({ error: 'Not found' }, { status: 404 })
    return Response.json(item, { headers: { 'cache-control': 'private, no-store' } })
  } catch (error: unknown) {
    return errorResponse(error, 'activities.calendar.item')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Activities',
  summary: 'One session of the member calendar',
  methods: {
    GET: {
      summary: 'Read one session as a participant or a guardian',
      description:
        'The session with its declaration kind, whether declarations are open, the concerned persons’ declarations and options, and the called-up children the club setting and the consents allow. 404 when the session is not in the caller’s (or the wards’) calendar.',
      query: calendarItemQuerySchema,
      responses: [
        { status: 200, description: 'The session entry', schema: calendarEntrySchema.extend({ timeZone: z.string() }) },
      ],
      errors: [
        { status: 403, description: 'scope_denied', schema: errorSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
      ],
    },
  },
}
