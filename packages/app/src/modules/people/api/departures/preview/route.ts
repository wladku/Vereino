// `POST /api/people/departures/preview` (people life-cycle spec *API* row, B-10 `?tab=leaving`; phase L4, #306): what
// a departure of the persons on the last day would end, warn about and be blocked by, the payer hand-overs it needs,
// the persons it suggests adding, and the preview token `POST /api/people/departures` confirms with (15 minutes).
// Read only. 422 `departure_date_in_past`; 404 for a person outside the club.
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import { previewDeparture } from '../../../commands/departures'
import { departurePreviewSchema } from '../../../data/validators'
import { errorSchema } from '../../shared'
import { departurePlanSchema, departurePlanView } from '../shared'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['people.manage'] },
}

export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await commandContextForRequest(request)
    if (!ctx?.auth) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const body: unknown = await request.json().catch(() => ({}))
    const { plan, previewToken } = await previewDeparture(ctx, body)
    return Response.json(
      { ...departurePlanView(plan), previewToken },
      { headers: { 'cache-control': 'private, no-store' } },
    )
  } catch (error: unknown) {
    return errorResponse(error, 'people.departures.preview')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'People',
  summary: 'Preview a departure',
  methods: {
    POST: {
      summary: 'Preview leaving the club',
      description:
        'Lists per person what ends on the last day (role assignments, guardianships, group memberships; the account closes the day after), the warnings, the blockers (a staying minor without a guardian, the last administrator, a person who already left), the payer hand-overs needed and the persons it suggests. The `previewToken` confirms exactly this plan for 15 minutes.',
      requestBody: { contentType: 'application/json', schema: departurePreviewSchema },
      responses: [
        { status: 200, description: 'The plan', schema: departurePlanSchema.extend({ previewToken: z.string() }) },
      ],
      errors: [
        { status: 403, description: 'scope_denied', schema: errorSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
        { status: 422, description: 'departure_date_in_past', schema: errorSchema },
      ],
    },
  },
}
