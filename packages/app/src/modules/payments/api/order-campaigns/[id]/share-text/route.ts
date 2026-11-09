// `GET /api/payments/order-campaigns/{id}/share-text` — the text for the Messenger group chat (payments spec API row
// `/share-text`; REQ-032, issue #115, B-31 "Save and open collection", B-32): the campaign name, its description, the
// orders deadline and the link to the guardian's order form (`/club/orders/{id}`, M-17, #116), in the administrator's
// language (`campaignShareText`, shared with the coach's M-18, #117).
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { errorResponse } from '@/modules/foundation'
import { campaignForRequest, campaignShareText } from '../../../order-campaign-routes'
import { errorSchema } from '../../../shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['payments.orders.manage'] },
}

const shareTextSchema = z.object({ text: z.string(), link: z.string() })

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const loaded = await campaignForRequest(request, context.params)
    if (!loaded.ok) return loaded.response
    const { campaign, ctx, scope } = loaded
    return Response.json(await campaignShareText(request, ctx, scope, campaign))
  } catch (error: unknown) {
    return errorResponse(error, 'payments.order_campaigns.share_text')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Payments',
  summary: 'Messenger text of an order campaign',
  methods: {
    GET: {
      summary: 'The text with a link to paste into the group chat',
      responses: [{ status: 200, description: 'The text and the link', schema: shareTextSchema }],
      errors: [
        { status: 403, description: 'scope_denied', schema: errorSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
      ],
    },
  },
}
