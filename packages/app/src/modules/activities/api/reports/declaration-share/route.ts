// `GET /api/activities/reports/declaration-share` (product brief Goals — the primary metric; D21; E27-S01, #818): per
// section, the share of attendance declarations made in Vereino in a period — confirm-type events, training absences
// and the headline — as counts and percentages, never names. The gate is `activities.reports.view` with the record
// scope (`services/declaration-share.ts`): the club administrator every section, a coordinator their sections.
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse, trustedScopeOf } from '@/modules/foundation'
import { declarationShareQuerySchema } from '../../../data/validators'
import { readDeclarationShare } from '../../../services/declaration-share'
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
    const report = await readDeclarationShare(ctx, scope, query)
    return Response.json(report, { headers: { 'cache-control': 'private, no-store' } })
  } catch (error: unknown) {
    return errorResponse(error, 'activities.reports.declaration_share')
  }
}

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
        'Counts the `done` sessions whose date (in the club’s time zone) is in `from`…`to` — both or neither; without them the last 28 days up to today; at most 366 days. `confirm` kinds: participants who answered themselves (`source` `app` or `link`, `declaration_status` `final`, `declared_at` before the start) over all participants. `absence_only` kinds: actual absences reported as absence that way over all actual absences. `headline` adds both. Staff entries never count; cancelled and not yet `done` sessions are left out. A section without a `done` session has `sessions` 0. With `activities.reports.view` the club administrator reads every live section and a coordinator their sections; anyone else 403. Counts only, no names. Errors: 400 `report_period_invalid`, 403 `scope_denied`, `scope_unlinked`.',
      query: declarationShareQuerySchema,
      responses: [
        {
          status: 200,
          description: 'The report',
          schema: z.object({
            from: z.string(),
            to: z.string(),
            timeZone: z.string(),
            items: z.array(
              z.object({
                sectionId: z.uuid(),
                sectionName: z.string(),
                sessions: z.number().int(),
                confirm: countsSchema,
                absence: countsSchema,
                headline: countsSchema,
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
