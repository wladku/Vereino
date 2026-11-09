// `POST /api/payments/order-links/{token}/orders/{id}/cancel` — a cancellation from a personal link (REQ-032, issue
// #116, M-19): `payments.orders.cancel` with the link as the credential and the order's lock token in the platform
// optimistic-lock header. Only an order of the link's campaign, without payments, until the deadline.
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { errorResponse } from '@/modules/foundation'
import {
  noStore,
  orderCommandResponse,
  orderWriteErrors,
  orderWriteResponseSchema,
  sessionlessContext,
} from '../../../../../order-routes'
import { errorSchema } from '../../../../../shared'

/** Per client IP (S8.6, V-10); disabled under integration tests. */
export const metadata = {
  POST: { requireAuth: false, rateLimit: { points: 30, duration: 60, keyPrefix: 'payments_order_link_write' } },
}

export async function POST(
  request: Request,
  context: { params: Promise<{ token?: string; id?: string }> },
): Promise<Response> {
  try {
    const { token, id } = await context.params
    const parsedId = z.uuid().safeParse(id)
    if (!parsedId.success) return noStore(Response.json({ error: 'Not found' }, { status: 404 }))
    const ctx = sessionlessContext(await createRequestContainer(), request)
    return noStore(await orderCommandResponse(ctx, 'payments.orders.cancel', { id: parsedId.data, token: token ?? '' }))
  } catch (error: unknown) {
    return noStore(errorResponse(error, 'payments.order_link.cancel'))
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Payments',
  summary: 'Cancel an order from a personal link',
  methods: {
    POST: {
      summary: 'Cancel an order from a personal link',
      description:
        "Sessionless (REQ-032, M-19). Cancels an order of the link's campaign and its charge; send the order's `updatedAt` in the platform optimistic-lock header. An order with a payment answers 409 `order_cancel_paid`.",
      responses: [{ status: 200, description: 'The cancelled order', schema: orderWriteResponseSchema }],
      errors: [
        ...orderWriteErrors,
        { status: 410, description: '`token_link_expired`', schema: errorSchema },
        { status: 429, description: 'Too many requests', schema: z.object({ error: z.string() }) },
      ],
    },
  },
}
