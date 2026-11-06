// `POST /api/facilities/zone-rules/bulk` — `facilities.zone_rules.bulk_upsert` (facilities spec REQ-029, the bulk row
// of *API, Command, and Error Contracts*; TEST-041; #121): the club administrator sets weekly booking availability for
// one or more places in one transaction — "replace" (default) or "append".
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import type { AvailabilityBulkResult } from '../../../commands/availability'
import { availabilityBulkSchema } from '../../../data/validators'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['facilities.manage'] },
}

const errorSchema = z.object({ error: z.string(), code: z.string().optional() }).loose()

const responseSchema = z.object({
  created: z.number().int().describe('Availability rules created'),
  removed: z.number().int().describe('Existing availability rules replaced (split around the period or removed)'),
  warnings: z.object({
    clubOccurrencesInWindows: z
      .number()
      .int()
      .describe('Planned club sessions inside the new windows; they stay occupied (16 weeks for an open period)'),
    pendingRequestsOutside: z
      .number()
      .int()
      .describe('Pending external requests outside the new availability (online requests arrive with E08-S05)'),
  }),
})

export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await commandContextForRequest(request)
    if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const body: unknown = await request.json().catch(() => ({}))
    const commandBus = ctx.container.resolve<CommandBus>('commandBus')
    const { result } = await commandBus.execute<unknown, AvailabilityBulkResult>('facilities.zone_rules.bulk_upsert', {
      input: typeof body === 'object' && body !== null ? body : {},
      ctx,
    })
    return Response.json({ created: result.created, removed: result.removed, warnings: result.warnings })
  } catch (error: unknown) {
    return errorResponse(error, 'facilities.zone_rules.bulk_upsert')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Facilities',
  summary: 'Set booking availability in bulk',
  methods: {
    POST: {
      summary: 'Set weekly booking availability for one or more places',
      description:
        'Writes `reservable_paid` zone rules with source `availability` and priority 3 for every place: the same hours for several weekdays or different hours per day, within a validity period. `replace` (default) first removes the existing availability on the selected `weekdays` (default: the days of the windows) within the period; a day in `weekdays` without a window only removes its availability. `append` keeps the existing rules. One transaction for all places.',
      requestBody: { contentType: 'application/json', schema: availabilityBulkSchema },
      responses: [{ status: 200, description: 'The rules written and the warnings', schema: responseSchema }],
      errors: [
        { status: 400, description: 'Invalid input', schema: errorSchema },
        { status: 403, description: 'scope_denied', schema: errorSchema },
        {
          status: 409,
          description: '`zone_rule_overlap` (an overlapping rule with equal priority)',
          schema: errorSchema,
        },
        {
          status: 422,
          description:
            'Per day (`dayErrors`, `fieldErrors["day-<weekday>"]`): `availability_time_order`, `availability_too_short` (< 90 minutes), `availability_outside_opening_hours`; also `availability_days_invalid`, `facilities_reference_invalid`, `validity_inverted`',
          schema: errorSchema,
        },
      ],
    },
  },
}
