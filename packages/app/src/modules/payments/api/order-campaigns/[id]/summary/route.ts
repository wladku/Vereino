// `GET /api/payments/order-campaigns/{id}/summary` — the supplier summary (payments spec API row `/summary`; REQ-032,
// issue #115, B-32 "Supplier summary"): units per product and size (set items counted under their products) and the
// print rows (print name, number, group, sizes) of the submitted orders, as JSON or (`format=csv`) as a CSV file. No
// contact details and no full names (Q1 on #115, data minimisation).
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { errorResponse } from '@/modules/foundation'
import { orderCampaignSummaryQuerySchema } from '../../../../data/validators'
import { supplierSummaryCsv } from '../../../../lib/order-campaigns'
import { campaignSummary } from '../../../../services/order-campaigns'
import { campaignForRequest } from '../../../order-campaign-routes'
import { errorSchema } from '../../../shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['payments.orders.manage'] },
}

const summarySchema = z.object({
  units: z.array(
    z.object({ productId: z.uuid(), productName: z.string(), size: z.string().nullable(), quantity: z.number().int() }),
  ),
  prints: z.array(
    z.object({
      printName: z.string().nullable(),
      printNumber: z.number().int().nullable(),
      groupName: z.string().nullable(),
      sizes: z.array(z.object({ productName: z.string(), size: z.string().nullable() })),
    }),
  ),
})

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const loaded = await campaignForRequest(request, context.params)
    if (!loaded.ok) return loaded.response
    const query = orderCampaignSummaryQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams))
    const summary = await campaignSummary(loaded.ctx.container, loaded.scope, loaded.campaign)
    if (query.format !== 'csv') return Response.json(summary)
    const { translate } = await resolveTranslations()
    const csv = supplierSummaryCsv(summary, {
      product: translate('payments.orders.csv.product', 'Product'),
      size: translate('payments.orders.csv.size', 'Size'),
      quantity: translate('payments.orders.csv.quantity', 'Quantity'),
      printName: translate('payments.orders.csv.printName', 'Print name'),
      printNumber: translate('payments.orders.csv.printNumber', 'Number'),
      group: translate('payments.orders.csv.group', 'Group'),
      sizes: translate('payments.orders.csv.sizes', 'Sizes'),
    })
    return new Response(csv, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="supplier-summary-${loaded.campaign.id}.csv"`,
      },
    })
  } catch (error: unknown) {
    return errorResponse(error, 'payments.order_campaigns.summary')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Payments',
  summary: 'Supplier summary of an order campaign',
  methods: {
    GET: {
      summary: 'Units per product and size and the print rows, as JSON or CSV',
      description:
        'Counts the submitted orders: a set counts under each of its products. `format=csv` answers a `text/csv` file with the units block (product, size, quantity), an empty line and the prints block (print name, number, group, sizes). No contact details and no full names.',
      query: orderCampaignSummaryQuerySchema,
      responses: [{ status: 200, description: 'The summary (or, with `format=csv`, a CSV file)', schema: summarySchema }],
      errors: [
        { status: 403, description: 'scope_denied', schema: errorSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
      ],
    },
  },
}
