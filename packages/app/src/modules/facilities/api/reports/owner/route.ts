// `GET /api/facilities/reports/owner` (facilities spec the owner report row of *API*; REQ-015, TEST-025, AC-015;
// README B-28, flow F-12; #127): the municipality report of a facility (a place and its sub-places) for a period of
// club-zone dates — scheduled hours by zone, club time (sessions and internal bookings) by zone, the rentals (count,
// value, the table), the payments to the owner's account with their source, incidents and maintenance done — as JSON
// or (`format=csv`) as a CSV file with the same figures. Read-only; the club administrator holds
// `facilities.reports.view` through `facilities.*`.
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse, trustedScopeOf } from '@/modules/foundation'
import { ownerReportQuerySchema } from '../../../data/validators'
import { ownerReportCsv, reportPeriodProblem } from '../../../lib/owner-report'
import { RENTAL_STATUSES } from '../../../lib/rentals'
import { ZONES } from '../../../lib/zones'
import { ownerReport } from '../../../services/owner-report'
import { facilitiesErrors } from '../../errors'
import { errorSchema } from '../../shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['facilities.reports.view'] },
}

export async function GET(request: Request): Promise<Response> {
  try {
    const ctx = await commandContextForRequest(request)
    const scope = ctx ? trustedScopeOf(ctx) : null
    if (!ctx || !scope) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const parsed = ownerReportQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
    if (!parsed.success) {
      return Response.json({ error: 'Invalid query', code: 'report_query_invalid' }, { status: 400 })
    }
    const problem = reportPeriodProblem(parsed.data.from, parsed.data.to)
    if (problem) await facilitiesErrors.throw(problem)
    const report = await ownerReport(ctx.container, scope, parsed.data)
    if (!report) return Response.json({ error: 'Not found' }, { status: 404 })
    if (parsed.data.format === 'csv') {
      return new Response(ownerReportCsv(report), {
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': `attachment; filename="owner-report-${report.from}-${report.to}.csv"`,
          'cache-control': 'private, no-store',
        },
      })
    }
    return Response.json(report, { headers: { 'cache-control': 'private, no-store' } })
  } catch (error: unknown) {
    return errorResponse(error, 'facilities.reports.owner')
  }
}

const hoursByZone = z.object(
  Object.fromEntries(ZONES.map((zone) => [zone, z.number()])) as Record<(typeof ZONES)[number], z.ZodNumber>,
)

const responseSchema = z.object({
  place: z.object({ id: z.uuid(), name: z.string() }),
  from: z.string(),
  to: z.string(),
  timeZone: z.string(),
  currency: z.string(),
  zoneHours: hoursByZone.describe('Scheduled hours of each zone on the place and its sub-places'),
  clubTime: z.object({
    total: z.number(),
    sessions: z.number(),
    bookings: z.number(),
    byZone: hoursByZone.extend({ none: z.number() }).describe('Club time by the zone it fell in; `none` = no zone'),
  }),
  rentals: z.object({
    count: z.number().int(),
    value: z.number().int().describe('Minor units'),
    items: z.array(
      z.object({
        id: z.uuid(),
        start: z.string(),
        end: z.string(),
        renter: z.string(),
        units: z.number().int(),
        amount: z.number().int(),
        status: z.enum(RENTAL_STATUSES),
      }),
    ),
  }),
  payments: z.object({
    amount: z.number().int().describe('Minor units'),
    count: z.number().int(),
    source: z.enum(['rental_register']).describe('Where the figure comes from'),
  }),
  incidents: z.object({ count: z.number().int() }),
  maintenance: z.object({ done: z.number().int(), cost: z.number().int().describe('Minor units') }),
})

export const openApi: OpenApiRouteDoc = {
  tag: 'Facilities',
  summary: 'Owner (municipality) report',
  methods: {
    GET: {
      summary: 'Read the owner report of a facility for a period, as JSON or CSV',
      description:
        'The facility is the place and its sub-places; the period runs over whole club-zone days `from`–`to` (from ≤ to, less than a year). Hours are in hours with two decimals, amounts in minor units. Club time = `planned` and `done` sessions plus confirmed internal bookings, clipped to the period. Rentals = the ones that start in the period and are requested, confirmed, done, cancelled late or no-show. Payments come from the rental register (confirmed and done rentals) until `payments` reports rental charges (DD-19). `format=csv` answers a CSV file with the same figures: a `section,item,value` summary, then the rentals.',
      query: ownerReportQuerySchema,
      responses: [
        {
          status: 200,
          description: 'The report (or, with `format=csv`, a `text/csv` file)',
          schema: responseSchema,
        },
      ],
      errors: [
        { status: 400, description: '`report_query_invalid`', schema: errorSchema },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 403, description: 'Without `facilities.reports.view`', schema: errorSchema },
        { status: 404, description: 'Unknown place', schema: errorSchema },
        { status: 422, description: '`report_period_order`, `report_period_too_long`', schema: errorSchema },
      ],
    },
  },
}
