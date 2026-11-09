// `GET /api/payments/order-campaigns/{id}/form` — M-17 (payments spec API row `/form`; REQ-032, REQ-002, issue
// #116): the order form of one campaign for the caller — its products, the caller's children in its groups with the
// numbers taken in their groups, their orders with what was paid, the contact defaults and the transfer instructions
// with the payer code. 404 for a draft or another club's campaign; a minor gets 403 `payments_minor` (R10).
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import { payerOf } from '../../../../services/checkout'
import { findCampaign } from '../../../../services/order-campaigns'
import { orderFormView } from '../../../../services/orders'
import { orderFormSchema } from '../../../order-routes'
import { errorSchema } from '../../../shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['payments.orders.place'] },
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = z.object({ id: z.uuid() }).parse(await context.params)
    const ctx = await commandContextForRequest(request)
    if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const payer = await payerOf(ctx)
    const campaign = await findCampaign(ctx.container, payer.scope, id)
    if (!campaign || campaign.status === 'draft') return Response.json({ error: 'Not found' }, { status: 404 })
    const form = await orderFormView(ctx.container, payer.scope, campaign, payer.personId, [
      ...payer.wardIds,
      payer.personId,
    ])
    return Response.json(form)
  } catch (error: unknown) {
    return errorResponse(error, 'payments.order_campaigns.form')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Payments',
  summary: 'Order form of a campaign',
  methods: {
    GET: {
      summary: "The campaign's order form for the caller",
      description:
        "M-17: the products, the caller's children in the campaign's groups (with the print numbers taken in their groups), their orders, the contact defaults and the transfer instructions. `campaign.ordersOpen` is false once the campaign is closed or its deadline passed.",
      responses: [{ status: 200, description: 'The form', schema: orderFormSchema }],
      errors: [
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 403, description: '`payments_minor`, `scope_unlinked`', schema: errorSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
      ],
    },
  },
}
