// `GET /api/payments/orders?campaignId=` — B-32 "Orders" (payments spec API table, REQ-032; issue #115): the
// campaign's submitted orders with the child, the group, the person who ordered, the print, the lines with the price
// recorded at order time, the total, what was paid and the handover. `POST` places a guardian's order (#116, M-17:
// `payments.orders.place`); a change and a cancellation are `PUT /api/payments/orders/{id}` and `…/{id}/cancel`.
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import { orderPlaceSchema, ordersListQuerySchema } from '../../data/validators'
import { campaignOrders } from '../../services/order-campaigns'
import { campaignForRequest } from '../order-campaign-routes'
import { orderCommandResponse, orderWriteErrors, orderWriteResponseSchema } from '../order-routes'
import { errorSchema } from '../shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['payments.orders.manage'] },
  POST: { requireAuth: true, requireFeatures: ['payments.orders.place'] },
}

const personSchema = z.object({ firstName: z.string(), lastName: z.string() }).nullable()

const orderSchema = z.object({
  id: z.uuid(),
  participantPersonId: z.uuid(),
  participant: personSchema,
  groupId: z.string().nullable(),
  groupName: z.string().nullable(),
  orderedBy: personSchema,
  printName: z.string().nullable(),
  printNumber: z.number().int().nullable(),
  lines: z.array(
    z.object({
      productId: z.uuid(),
      productName: z.string(),
      size: z.string().nullable(),
      sizes: z.string().nullable().describe("A set's sizes, `product: size` joined"),
      unitPrice: z.number().int().describe('Grosz, recorded at order time'),
    }),
  ),
  total: z.number().int(),
  paid: z.number().int(),
  remaining: z.number().int(),
  chargeId: z.uuid(),
  chargeStatus: z.string().nullable(),
  handedOver: z.boolean(),
  createdAt: z.string(),
})

const responseSchema = z.object({
  items: z.array(orderSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
  totalPages: z.number().int(),
})

export async function GET(request: Request): Promise<Response> {
  try {
    const query = ordersListQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams))
    const loaded = await campaignForRequest(request, Promise.resolve({ id: query.campaignId }))
    if (!loaded.ok) return loaded.response
    const all = await campaignOrders(loaded.ctx.container, loaded.scope, loaded.campaign)
    const start = (query.page - 1) * query.pageSize
    return Response.json({
      items: all.slice(start, start + query.pageSize),
      total: all.length,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.ceil(all.length / query.pageSize),
    })
  } catch (error: unknown) {
    return errorResponse(error, 'payments.orders.list')
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await commandContextForRequest(request)
    if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const body: unknown = await request.json().catch(() => ({}))
    return await orderCommandResponse(ctx, 'payments.orders.place', (body ?? {}) as Record<string, unknown>)
  } catch (error: unknown) {
    return errorResponse(error, 'payments.orders.place')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Payments',
  summary: 'Orders of a campaign',
  methods: {
    GET: {
      summary: "The campaign's submitted orders",
      query: ordersListQuerySchema,
      responses: [{ status: 200, description: 'The orders, oldest first', schema: responseSchema }],
      errors: [
        { status: 403, description: 'scope_denied', schema: errorSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
      ],
    },
    POST: {
      summary: 'Order kit for a child',
      description:
        "A guardian orders for a ward in the campaign's groups, an adult participant for themself (`payments.orders.place`). The lines come from the answers: the set at its set price, single products at the price of their size; an `order` charge (payer = the caller, due on the payment deadline) is created in the same transaction and a copy is e-mailed to `contactEmail`. A print number must be free in the child's group.",
      requestBody: { contentType: 'application/json', schema: orderPlaceSchema },
      responses: [{ status: 201, description: 'The order and its charge', schema: orderWriteResponseSchema }],
      errors: orderWriteErrors,
    },
  },
}
