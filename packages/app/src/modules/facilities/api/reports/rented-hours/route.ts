// `GET /api/facilities/reports/rented-hours` (facilities spec the rented-hours row of *API*; REQ-038, TEST-053, AC-038;
// #129): the hours of `done` sessions on the places the club rents from their owners (`rented_by_club`) and their
// sub-places, per place, month, group and coach, for a period of club-zone dates — as JSON or (`format=csv`) as a CSV
// file with the same figures. Read-only; the club administrator holds `facilities.reports.view` through `facilities.*`.
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse, trustedScopeOf } from '@/modules/foundation'
import { rentedHoursReportQuerySchema } from '../../../data/validators'
import { reportPeriodProblem } from '../../../lib/owner-report'
import { rentedHoursCsv } from '../../../lib/rented-hours'
import { rentedHours } from '../../../services/rented-hours'
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
    const parsed = rentedHoursReportQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
    if (!parsed.success) {
      return Response.json({ error: 'Invalid query', code: 'report_query_invalid' }, { status: 400 })
    }
    const problem = reportPeriodProblem(parsed.data.from, parsed.data.to)
    if (problem) await facilitiesErrors.throw(problem)
    const report = await rentedHours(ctx.container, scope, parsed.data)
    if (parsed.data.format === 'csv') {
      return new Response(rentedHoursCsv(report), {
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': `attachment; filename="rented-hours-${report.from}-${report.to}.csv"`,
          'cache-control': 'private, no-store',
        },
      })
    }
    return Response.json(report, { headers: { 'cache-control': 'private, no-store' } })
  } catch (error: unknown) {
    return errorResponse(error, 'facilities.reports.rented_hours')
  }
}

const responseSchema = z.object({
  from: z.string(),
  to: z.string(),
  timeZone: z.string(),
  places: z.array(z.object({ id: z.uuid(), name: z.string() })).describe('Every place the club rents, by name'),
  totals: z
    .array(
      z.object({
        placeId: z.uuid(),
        placeName: z.string(),
        month: z.string().describe('`YYYY-MM` in the club zone'),
        sessions: z.number().int(),
        hours: z.number(),
      }),
    )
    .describe('Per place and month: the sum of its rows'),
  rows: z.array(
    z.object({
      placeId: z.uuid(),
      placeName: z.string(),
      month: z.string(),
      groupId: z.uuid(),
      groupName: z.string().nullable(),
      coachPersonId: z.uuid().nullable(),
      coachName: z.string().nullable(),
      sessions: z.number().int(),
      hours: z.number(),
    }),
  ),
})

export const openApi: OpenApiRouteDoc = {
  tag: 'Facilities',
  summary: 'Rented-hours report',
  methods: {
    GET: {
      summary: 'Read the hours of done sessions on the places the club rents, as JSON or CSV',
      description:
        'For each place flagged `rented_by_club` (or only `placeId`), the `done` sessions on it and its sub-places that start in the club-zone days `from`–`to` (from ≤ to, less than a year), per month, group and coach. A session counts in full in the month it starts, on the nearest flagged place at or above its own. Hours have two decimals; a total is the sum of its rows. A `placeId` that names no rented place answers no rows. `format=csv` answers a CSV file with the same figures: the totals (`place,month,sessions,hours`), then the rows (`place,month,group,coach,sessions,hours`).',
      query: rentedHoursReportQuerySchema,
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
        { status: 422, description: '`report_period_order`, `report_period_too_long`', schema: errorSchema },
      ],
    },
  },
}
