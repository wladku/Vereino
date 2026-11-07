// `GET /api/activities/reports/coach-units` (club spec API table, REQ-008, REQ-021, AC-021; README B-16 and the
// phone's "My units"; #96): the month's coach units per coach — planned, handed over, taken over, balance, matches,
// away trips, the sessions behind them and, for the club administrator, the amount in the club's settlement model —
// as JSON or (`format=csv`) as a CSV file. The gate is `activities.reports.view` or `activities.reports.view_own`,
// checked with the record scope in `services/coach-units.ts`.
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse, trustedScopeOf } from '@/modules/foundation'
import { coachUnitsQuerySchema } from '../../../data/validators'
import { coachUnitsReportCsv, readCoachUnits } from '../../../services/coach-units'
import { errorSchema } from '../../shared'

export const metadata = {
  GET: { requireAuth: true },
}

export async function GET(request: Request): Promise<Response> {
  try {
    const ctx = await commandContextForRequest(request)
    const scope = ctx ? trustedScopeOf(ctx) : null
    if (!ctx || !scope) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const query = coachUnitsQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams))
    const report = await readCoachUnits(ctx, scope, query)
    if (query.format === 'csv') {
      return new Response(coachUnitsReportCsv(report), {
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': `attachment; filename="coach-units-${report.month}.csv"`,
          'cache-control': 'private, no-store',
        },
      })
    }
    return Response.json(report, { headers: { 'cache-control': 'private, no-store' } })
  } catch (error: unknown) {
    return errorResponse(error, 'activities.reports.coach_units')
  }
}

const sessionSchema = z.object({
  id: z.uuid(),
  date: z.string(),
  type: z.string(),
  isAway: z.boolean(),
  role: z
    .enum(['unit', 'handed_over', 'taken_over', 'match', 'trip'])
    .describe('Why the session is in the row: a unit led, an own session another coach led, a substitution, …'),
  activityName: z.string().nullable(),
  groupName: z.string().nullable(),
})

const rowSchema = z.object({
  personId: z.uuid(),
  coachName: z.string().nullable(),
  planned: z.number().int(),
  handedOver: z.number().int(),
  takenOver: z.number().int(),
  balance: z.number().int().describe('planned − handed over + taken over: the training sessions the coach led'),
  matches: z.number().int(),
  trips: z.number().int(),
  sessions: z.array(sessionSchema),
  amount: z
    .number()
    .int()
    .nullable()
    .optional()
    .describe('Grosz, only with `club_core.contracts.manage`; null without a complete contract'),
  contractState: z.enum(['ok', 'no_contract', 'incomplete']).optional(),
})

export const openApi: OpenApiRouteDoc = {
  tag: 'Activities',
  summary: 'Coach units report',
  methods: {
    GET: {
      summary: 'The month’s coach units per coach, as JSON or CSV',
      description:
        'Counts the `done` sessions of `month` (`YYYY-MM`): a unit is one `training` session, owed to whoever led it. With `activities.reports.view` the club administrator reads every section (or `sectionId`) and a coordinator their sections; with `activities.reports.view_own` (or `mine=1`) the caller reads only their own row. Amounts in the club’s `coach_settlement_model` only with `club_core.contracts.manage`. `format=csv` answers a CSV file with the columns coach, planned, given, taken, balance, matches, trips (and amount). Errors: 400 `report_month_invalid`, 403 `scope_denied`, `scope_unlinked`.',
      query: coachUnitsQuerySchema,
      responses: [
        {
          status: 200,
          description: 'The report (or, with `format=csv`, a `text/csv` file)',
          schema: z.object({
            month: z.string(),
            from: z.string(),
            to: z.string(),
            perspective: z.enum(['staff', 'own']),
            model: z.enum(['units_per_contract', 'fixed_base_adjusted']),
            currency: z.string(),
            withAmounts: z.boolean(),
            items: z.array(rowSchema),
            unsettledCount: z.number().int(),
          }),
        },
      ],
      errors: [
        { status: 400, description: 'report_month_invalid, validation failed', schema: errorSchema },
        { status: 403, description: 'scope_denied, scope_unlinked', schema: errorSchema },
      ],
    },
  },
}
