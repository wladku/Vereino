// `GET /api/facilities/calendar` (facilities spec the calendar row of *API*; M-11 `/club/places`; REQ-023; #123): the
// staff view of the club's places. With `placeId`, the timeline of one place — the days of the window with their
// opening windows and zones, and the sessions, rentals, pending requests, internal bookings and closures on the place,
// its ancestors and descendants, with the names staff see; without it, every live active place with the entries on
// it. Staff with `facilities.view` read the whole club; the attendant's place scope and the maintenance planner's
// redacted read arrive with their stories (E08-S04, E08-S08).
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse, scopeContract, trustedScopeOf } from '@/modules/foundation'
import { calendarQuerySchema } from '../../data/validators'
import { calendarWindowProblem } from '../../lib/internal-bookings'
import { staffCalendar } from '../../services/calendar'
import { errorSchema } from '../shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['facilities.view'] },
}

const responseSchema = z.object({
  timeZone: z.string(),
  places: z.array(z.object({ id: z.uuid(), name: z.string(), parentName: z.string().nullable(), isLeaf: z.boolean() })),
  days: z.array(
    z.object({
      date: z.string(),
      opening: z
        .array(z.object({ from: z.string(), to: z.string() }))
        .nullable()
        .describe('Opening windows of the day; null = no opening-hours limit'),
      zones: z.array(z.object({ from: z.string(), to: z.string(), zone: z.string() })),
    }),
  ),
  entries: z.array(
    z.object({
      id: z.uuid(),
      kind: z.enum(['session', 'rental', 'request', 'booking', 'closure']),
      placeId: z.uuid(),
      start: z.string(),
      end: z.string(),
      label: z.string().nullable().describe('Activity, renter, booking purpose or closure reason'),
      needsReschedule: z.boolean(),
      groupId: z.string().nullable(),
      sectionId: z.string().nullable(),
      bookedByName: z.string().nullable(),
      own: z.boolean(),
      canCancel: z.boolean(),
      updatedAt: z.string().nullable().describe('An internal booking’s version: the lock token of its cancellation'),
    }),
  ),
})

export async function GET(request: Request): Promise<Response> {
  try {
    const ctx = await commandContextForRequest(request)
    const scope = ctx ? trustedScopeOf(ctx) : null
    if (!ctx || !scope) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const url = new URL(request.url)
    const parsed = calendarQuerySchema.safeParse(Object.fromEntries(url.searchParams))
    if (!parsed.success) {
      return Response.json({ error: 'Invalid query', code: 'calendar_query_invalid' }, { status: 400 })
    }
    const from = new Date(parsed.data.from)
    const to = new Date(parsed.data.to)
    const problem = calendarWindowProblem(from, to)
    if (problem) {
      return Response.json({ error: 'Invalid date range', code: 'calendar_range_invalid', problem }, { status: 400 })
    }
    const grants = await scopeContract.resolve(ctx)
    const calendar = await staffCalendar(
      ctx.container,
      scope,
      grants,
      { placeId: parsed.data.placeId, from, to },
      new Date(),
    )
    if (!calendar) return Response.json({ error: 'Not found' }, { status: 404 })
    return Response.json(calendar, { headers: { 'cache-control': 'no-store' } })
  } catch (error: unknown) {
    return errorResponse(error, 'facilities.calendar')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Facilities',
  summary: 'Staff facility calendar',
  methods: {
    GET: {
      summary: 'Read the occupancy of the club places',
      description:
        'With `placeId`: the place’s days in the window (opening windows and zones) and every session, rental, pending request, internal booking and closure on the place, its ancestors and descendants, with names. Without it: every live active place and the entries on it. `from`–`to` spans at most 31 days. Internal bookings carry `own` and `canCancel` for the caller.',
      query: calendarQuerySchema,
      responses: [{ status: 200, description: 'The calendar', schema: responseSchema }],
      errors: [
        { status: 400, description: '`calendar_query_invalid`, `calendar_range_invalid`', schema: errorSchema },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 403, description: 'Without `facilities.view`', schema: errorSchema },
        { status: 404, description: 'Unknown place', schema: errorSchema },
      ],
    },
  },
}
