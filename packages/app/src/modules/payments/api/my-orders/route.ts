// `GET /api/payments/my-orders` — M-16 (payments spec API row `/api/payments/order-campaigns?for=me`, served on its
// own path because the campaign list is the administrator's CRUD route; REQ-032, REQ-002, issue #116): the campaigns
// that cover a group of the caller's wards (or of the caller, an adult participant), in the stages `open`, `closed`,
// `ordered` and `delivered`, each child with its state — not ordered, to pay, paid, picked up. Behind the R10 gate: a
// minor gets 403 `payments_minor`.
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import { payerOf } from '../../services/checkout'
import { myOrderCampaigns } from '../../services/orders'
import { myOrderCampaignSchema } from '../order-routes'
import { errorSchema } from '../shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['payments.orders.place'] },
}

const responseSchema = z.object({ items: z.array(myOrderCampaignSchema) })

export async function GET(request: Request): Promise<Response> {
  try {
    const ctx = await commandContextForRequest(request)
    if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const payer = await payerOf(ctx)
    const items = await myOrderCampaigns(ctx.container, payer.scope, [...payer.wardIds, payer.personId])
    return Response.json({ items })
  } catch (error: unknown) {
    return errorResponse(error, 'payments.my_orders')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Payments',
  summary: 'My kit orders',
  methods: {
    GET: {
      summary: "The campaigns covering the caller's children",
      description:
        "M-16: the order campaigns (`open`, `closed`, `ordered`, `delivered`) covering a group of the caller's wards or of the caller, latest deadline first, each child with its state. A minor gets 403 `payments_minor` (R10).",
      responses: [{ status: 200, description: 'The campaigns', schema: responseSchema }],
      errors: [
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 403, description: '`payments_minor`, `scope_unlinked`', schema: errorSchema },
      ],
    },
  },
}
