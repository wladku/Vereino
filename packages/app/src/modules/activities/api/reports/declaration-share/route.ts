// `GET /api/activities/reports/declaration-share` (product brief Goals — the primary metric; D21; E27-S01, #818): per
// section, the share of attendance declarations made in Vereino in a period — confirm-type events, training absences
// and the headline — as counts and percentages, never names. The gate is `activities.reports.view` with the record
// scope (`services/declaration-share.ts`): the club administrator every section, a coordinator their sections.
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse, trustedScopeOf } from '@/modules/foundation'
import { declarationShareQuerySchema } from '../../../data/validators'
import { readDeclarationShare } from '../../../services/declaration-share'
import { readPilotIndicators } from '../../../services/pilot-indicators'
import { errorSchema } from '../../shared'

export const metadata = {
  GET: { requireAuth: true },
}

export async function GET(request: Request): Promise<Response> {
  try {
    const ctx = await commandContextForRequest(request)
    const scope = ctx ? trustedScopeOf(ctx) : null
    if (!ctx || !scope) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const query = declarationShareQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams))
    const now = new Date()
    const report = await readDeclarationShare(ctx, scope, query, now)
    // The pilot's leading indicators (E27-S03, #820) for the same sections and period.
    const indicators = await readPilotIndicators(
      ctx.container,
      scope,
      {
        sectionIds: report.items.map((item) => item.sectionId),
        period: { from: report.from, to: report.to },
        timeZone: report.timeZone,
      },
      now,
    )
    const items = report.items.map((item) => ({
      ...item,
      indicators: indicators.bySection.get(item.sectionId) ?? null,
    }))
    return Response.json(
      { ...report, paymentsEnabled: indicators.paymentsEnabled, items },
      { headers: { 'cache-control': 'private, no-store' } },
    )
  } catch (error: unknown) {
    return errorResponse(error, 'activities.reports.declaration_share')
  }
}

const indicatorSchema = z.object({
  count: z.number().int(),
  total: z.number().int(),
  percent: z.number().int().nullable().describe('Whole percent; null when `total` is 0'),
})

const countsSchema = z.object({
  declared: z
    .number()
    .int()
    .describe('Declared in Vereino: by a member in the app or by a personal link, before the start'),
  total: z.number().int(),
  percent: z.number().int().nullable().describe('Whole percent; null when `total` is 0'),
})

export const openApi: OpenApiRouteDoc = {
  tag: 'Activities',
  summary: 'Declarations made in Vereino, per section',
  methods: {
    GET: {
      summary: 'The share of attendance declarations made in Vereino, per section, for a period',
      description:
        'Leading indicators (E27-S03) per section in `indicators`: accounts of guardians, attendance lists closed within 24 h, `fee`/`order` charges paid on time (null without `payments`) and sessions without a coach covered before the start. Declaration share: counts the `done` sessions whose date (in the club’s time zone) is in `from`…`to` — both or neither; without them the last 28 days up to today; at most 366 days. `confirm` kinds: participants who answered themselves (`source` `app` or `link`, `declaration_status` `final`, `declared_at` before the start) over all participants. `absence_only` kinds: actual absences reported as absence that way over all actual absences. `headline` adds both. Staff entries never count; the kind of each session is the club’s current `declaration_kinds` for its activity type; cancelled and not yet `done` sessions are left out. A section without a `done` session has `sessions` 0. With `activities.reports.view` the club administrator reads every live section and a coordinator their sections; anyone else 403. Counts only, no names. Errors: 400 `report_period_invalid`, 403 `scope_denied`, `scope_unlinked`.',
      query: declarationShareQuerySchema,
      responses: [
        {
          status: 200,
          description: 'The report',
          schema: z.object({
            from: z.string(),
            to: z.string(),
            timeZone: z.string(),
            paymentsEnabled: z.boolean().describe('False when the `payments` module is disabled: `paidOnTime` is null'),
            items: z.array(
              z.object({
                sectionId: z.uuid(),
                sectionName: z.string(),
                sessions: z.number().int(),
                confirm: countsSchema,
                absence: countsSchema,
                headline: countsSchema,
                indicators: z
                  .object({
                    accounts: indicatorSchema.describe(
                      'Guardians of the active participants on the last day (or today) and those with an active account',
                    ),
                    attendanceWithinDay: indicatorSchema.describe(
                      'Ended, not cancelled sessions and those whose attendance list was closed within 24 h of the end',
                    ),
                    paidOnTime: indicatorSchema
                      .nullable()
                      .describe(
                        '`fee` and `order` charges due in the period and those fully paid by the due date; null without `payments`',
                      ),
                    coverBeforeStart: indicatorSchema.describe(
                      'Sessions that lost their coach before the start and those with a coach again at the start',
                    ),
                  })
                  .nullable(),
              }),
            ),
          }),
        },
      ],
      errors: [
        { status: 400, description: 'report_period_invalid, validation failed', schema: errorSchema },
        { status: 403, description: 'scope_denied, scope_unlinked', schema: errorSchema },
      ],
    },
  },
}
