// `GET /api/facilities/today` (facilities spec the calendar and today row of *API*; M-12 `/club/facility`; REQ-013,
// REQ-016; #126): the attendant's day at one place — the club's places to choose from, today's log in the club time
// zone and the planned sessions and rentals on the place, its ancestors and descendants, each rental with whether a
// no-show may be recorded now. Staff with `facilities.view` read every club place; the attendant's place scope
// arrives with the facility attendant role (#126, it needs a `people` migration not approved yet).
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse, trustedScopeOf } from '@/modules/foundation'
import { todayQuerySchema } from '../../data/validators'
import { facilityToday } from '../../services/today'
import { errorSchema } from '../shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['facilities.view'] },
}

const groupSchema = z.object({
  occurrenceId: z.string().nullable().optional(),
  rentalId: z.string().nullable().optional(),
  headcount: z.number(),
  adultSupervisorPresent: z.boolean(),
})

const responseSchema = z.object({
  timeZone: z.string(),
  date: z.string().describe('Today in the club time zone'),
  places: z.array(z.object({ id: z.uuid(), name: z.string(), parentName: z.string().nullable() })),
  place: z.object({ id: z.uuid(), name: z.string() }).nullable().describe('Null when the club has no place'),
  log: z
    .object({
      id: z.uuid(),
      updatedAt: z.string().describe('The lock token of the log update'),
      openedAt: z.string().nullable(),
      closedAt: z.string().nullable(),
      conditionBefore: z.string().nullable(),
      conditionAfter: z.string().nullable(),
      groupsPresent: z.array(groupSchema),
      remarks: z.string().nullable(),
    })
    .nullable(),
  entries: z.array(
    z.object({
      kind: z.enum(['session', 'rental']),
      id: z.uuid(),
      placeId: z.uuid(),
      start: z.string(),
      end: z.string(),
      label: z.string().nullable().describe('The activity or the renter'),
      status: z.string(),
      updatedAt: z.string().nullable().describe('A rental’s version: the lock token of its no-show'),
      canNoShow: z.boolean(),
    }),
  ),
})

export async function GET(request: Request): Promise<Response> {
  try {
    const ctx = await commandContextForRequest(request)
    const scope = ctx ? trustedScopeOf(ctx) : null
    if (!ctx || !scope) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const parsed = todayQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
    if (!parsed.success) return Response.json({ error: 'Invalid query', code: 'today_query_invalid' }, { status: 400 })
    const today = await facilityToday(ctx.container, scope, parsed.data.placeId, new Date())
    if (!today) return Response.json({ error: 'Not found' }, { status: 404 })
    return Response.json(today, { headers: { 'cache-control': 'no-store' } })
  } catch (error: unknown) {
    return errorResponse(error, 'facilities.today')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Facilities',
  summary: 'Today at the facility',
  methods: {
    GET: {
      summary: 'Read today at one place',
      description:
        'The day in the club time zone at the named place (or the first place of the club): its log and the planned sessions and rentals on the place, its ancestors and descendants. A rental carries its version and `canNoShow` (after its start, while requested or confirmed).',
      query: todayQuerySchema,
      responses: [{ status: 200, description: 'Today at the place', schema: responseSchema }],
      errors: [
        { status: 400, description: '`today_query_invalid`', schema: errorSchema },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 403, description: 'Without `facilities.view`', schema: errorSchema },
        { status: 404, description: 'Unknown place', schema: errorSchema },
      ],
    },
  },
}
