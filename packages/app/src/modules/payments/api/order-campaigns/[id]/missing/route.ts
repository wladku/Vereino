// `GET /api/payments/order-campaigns/{id}/missing` — B-32 "No order" (REQ-032, issue #115; an additive route recorded
// in the payments spec): the children the campaign's groups cover today without a submitted order, with their group.
// The "Close orders" dialog counts them.
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { errorResponse } from '@/modules/foundation'
import { campaignMissing } from '../../../../services/order-campaigns'
import { campaignForRequest } from '../../../order-campaign-routes'
import { errorSchema } from '../../../shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['payments.orders.manage'] },
}

const querySchema = z.object({ groupId: z.uuid().optional() })

const responseSchema = z.object({
  items: z.array(
    z.object({
      personId: z.uuid(),
      participant: z.object({ firstName: z.string(), lastName: z.string() }).nullable(),
      groupId: z.uuid(),
      groupName: z.string().nullable(),
    }),
  ),
  total: z.number().int(),
})

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const loaded = await campaignForRequest(request, context.params)
    if (!loaded.ok) return loaded.response
    const query = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams))
    const items = await campaignMissing(loaded.ctx.container, loaded.scope, loaded.campaign, query.groupId)
    return Response.json({ items, total: items.length })
  } catch (error: unknown) {
    return errorResponse(error, 'payments.order_campaigns.missing')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Payments',
  summary: 'Children without an order',
  methods: {
    GET: {
      summary: 'The children of the campaign groups without a submitted order',
      query: querySchema,
      responses: [{ status: 200, description: 'The children, by group and name', schema: responseSchema }],
      errors: [
        { status: 403, description: 'scope_denied', schema: errorSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
      ],
    },
  },
}
