// `GET /api/facilities/calendar` (facilities spec the calendar row of *API*; M-11 `/club/places`; REQ-023; #123): the
// staff view of the club's places. With `placeId`, the timeline of one place — the days of the window with their
// opening windows and zones, and the sessions, rentals, pending requests, internal bookings and closures on the place,
// its ancestors and descendants, with the names staff see; without it, every live active place with the entries on
// it. Staff with `facilities.view` read the whole club; a maintainer holding only `facilities.maintenance.manage`
// reads the places assigned to them, without renter, person or group names (#128, DD-36, TEST-050; 403 for another
// place). A facility attendant reads the places of their grant with names (#126; 403 for another place).
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import type { RbacService } from '@open-mercato/core/modules/auth/services/rbacService'
import { commandContextForRequest, errorResponse, scopeContract, trustedScopeOf } from '@/modules/foundation'
import { calendarQuerySchema } from '../../data/validators'
import { calendarWindowProblem } from '../../lib/internal-bookings'
import { attendantPlaceIds } from '../../lib/place-scope'
import { staffCalendar } from '../../services/calendar'
import { errorSchema } from '../shared'

export const metadata = {
  // `facilities.view` or `facilities.maintenance.manage`: checked in the handler (the metadata requires all features).
  GET: { requireAuth: true },
}

const responseSchema = z.object({
  timeZone: z.string(),
  maintenance: z.object({
    redacted: z.boolean().describe('A maintainer without facilities.view: no names, only the assigned places'),
    canPlan: z.boolean(),
    planPlaceIds: z.array(z.string()).nullable().describe('The places the caller may plan maintenance on; null = all'),
  }),
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
      kind: z.enum(['session', 'rental', 'request', 'booking', 'closure', 'maintenance']),
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
    const userId = ctx.auth?.sub
    const rbac = ctx.container.resolve<RbacService>('rbacService')
    const canView = !!userId && (await rbac.userHasAllFeatures(userId, ['facilities.view'], scope))
    const canPlan = !!userId && (await rbac.userHasAllFeatures(userId, ['facilities.maintenance.manage'], scope))
    if (!canView && !canPlan) return Response.json({ error: 'Forbidden', code: 'scope_denied' }, { status: 403 })
    const grants = await scopeContract.resolve(ctx)
    const clubWide = grants.some((grant) => grant.kind === 'club_admin')
    const maintained = grants.flatMap((grant) => (grant.kind === 'maintenance_planner' ? [...(grant.ids ?? [])] : []))
    const calendar = await staffCalendar(
      ctx.container,
      scope,
      grants,
      { placeId: parsed.data.placeId, from, to },
      new Date(),
      {
        redacted: !canView,
        canPlan: canPlan && (clubWide || maintained.length > 0),
        planPlaceIds: clubWide ? null : maintained,
        placeIds: canView ? attendantPlaceIds(grants) : null,
      },
    )
    if (calendar === 'forbidden') return Response.json({ error: 'Forbidden', code: 'scope_denied' }, { status: 403 })
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
        'With `placeId`: the place’s days in the window (opening windows and zones) and every session, rental, pending request, internal booking, closure and planned maintenance window on the place, its ancestors and descendants, with names. Without it: every live active place and the entries on it. `from`–`to` spans at most 31 days. Internal bookings carry `own` and `canCancel` for the caller. A caller with `facilities.maintenance.manage` but without `facilities.view` (a place maintainer) reads only the places assigned to them, and every entry except maintenance without its label, names or group (`maintenance.redacted`). A facility attendant reads only the places of their assignments and their descendants.',
      query: calendarQuerySchema,
      responses: [{ status: 200, description: 'The calendar', schema: responseSchema }],
      errors: [
        { status: 400, description: '`calendar_query_invalid`, `calendar_range_invalid`', schema: errorSchema },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        {
          status: 403,
          description:
            'Without `facilities.view` and `facilities.maintenance.manage`, or a maintainer or attendant reading another place',
          schema: errorSchema,
        },
        { status: 404, description: 'Unknown place', schema: errorSchema },
      ],
    },
  },
}
