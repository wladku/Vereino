// `POST /api/payments/orders/{id}/cancel` — a guardian cancels a kit order until the deadline (payments spec API row
// `payments.orders.place`; REQ-032, issue #116, M-17): only an order without payments (409 `order_cancel_paid`); its
// charge is cancelled with it. Send the order's lock token in the platform optimistic-lock header.
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import { orderCommandResponse, orderWriteErrors, orderWriteResponseSchema } from '../../../order-routes'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['payments.orders.place'] },
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = z.object({ id: z.uuid() }).parse(await context.params)
    const ctx = await commandContextForRequest(request)
    if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    return await orderCommandResponse(ctx, 'payments.orders.cancel', { id })
  } catch (error: unknown) {
    return errorResponse(error, 'payments.orders.cancel')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Payments',
  summary: 'Cancel a kit order',
  methods: {
    POST: {
      summary: 'Cancel a kit order until the deadline',
      description:
        "`payments.orders.cancel`: the order and its charge are cancelled. Send the order's `updatedAt` in the platform optimistic-lock header. An order with a payment answers 409 `order_cancel_paid`.",
      responses: [{ status: 200, description: 'The cancelled order', schema: orderWriteResponseSchema }],
      errors: orderWriteErrors,
    },
  },
}
