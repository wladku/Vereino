// `GET /api/payments/order-campaigns/{id}` — one order campaign (payments spec API table, REQ-032; issue #115, B-31,
// B-32): the form with its products (each marked `used` when a placed order has it, so the form cannot remove it),
// the section and group names, the stage with its one next action and the KPIs. `updatedAt` is the lock token the
// update and the transitions expect.
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { errorResponse } from '@/modules/foundation'
import { campaignDetail } from '../../../services/order-campaigns'
import { campaignForRequest } from '../../order-campaign-routes'
import { campaignKpisSchema, errorSchema } from '../../shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['payments.orders.manage'] },
}

const productSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  kind: z.enum(['item', 'set']),
  componentProductIds: z.array(z.uuid()),
  sizesChild: z.array(z.string()),
  sizesAdult: z.array(z.string()),
  priceChild: z.number().int().describe('Grosz; for a set, the set price'),
  priceAdult: z.number().int().nullable(),
  requiredAnswer: z.boolean(),
  used: z.boolean().describe('A placed order has the product, so it cannot be removed'),
})

const campaignDetailSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string().nullable(),
  sectionId: z.uuid(),
  sectionName: z.string().nullable(),
  groups: z.array(z.object({ id: z.uuid(), name: z.string().nullable() })),
  closesOn: z.string(),
  paymentDueOn: z.string(),
  status: z.string(),
  nextAction: z.string().nullable().describe('`open`, `close`, `mark-ordered`, `mark-delivered`, `complete`'),
  askPrintName: z.boolean(),
  askPrintNumber: z.boolean(),
  notesLabel: z.string().nullable(),
  supplierName: z.string().nullable(),
  products: z.array(productSchema),
  kpis: campaignKpisSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
})

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const loaded = await campaignForRequest(request, context.params)
    if (!loaded.ok) return loaded.response
    const detail = await campaignDetail(loaded.ctx.container, loaded.scope, loaded.campaign.id)
    if (!detail) return Response.json({ error: 'Not found' }, { status: 404 })
    return Response.json(detail)
  } catch (error: unknown) {
    return errorResponse(error, 'payments.order_campaigns.detail')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Payments',
  summary: 'Order campaign',
  methods: {
    GET: {
      summary: 'One order campaign with its products, stage and KPIs',
      responses: [{ status: 200, description: 'The campaign', schema: campaignDetailSchema }],
      errors: [
        { status: 403, description: 'scope_denied', schema: errorSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
      ],
    },
  },
}
