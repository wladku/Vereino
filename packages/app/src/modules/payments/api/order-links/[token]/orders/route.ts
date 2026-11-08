// `POST /api/payments/order-links/{token}/orders` — an order from a personal link (payments spec API row; REQ-032,
// foundation P-10; issue #116, M-19). Sessionless and rate-limited per client IP; the token is the only credential and
// names the campaign. Without `id` it places an order (`payments.orders.place`, 201), with `id` it changes one
// (`payments.orders.update`, the order's lock token in the platform optimistic-lock header). The link's guardian's
// current grants decide whom it may order for: another family's child answers 403 `scope_denied`. The rules of the
// app's order routes apply.
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { errorResponse } from '@/modules/foundation'
import { orderLinkWriteSchema } from '../../../../data/validators'
import {
  noStore,
  orderCommandResponse,
  orderWriteErrors,
  orderWriteResponseSchema,
  sessionlessContext,
} from '../../../order-routes'
import { errorSchema } from '../../../shared'

/** Per client IP (S8.6, V-10); disabled under integration tests. */
export const metadata = {
  POST: { requireAuth: false, rateLimit: { points: 30, duration: 60, keyPrefix: 'payments_order_link_write' } },
}

export async function POST(request: Request, context: { params: Promise<{ token?: string }> }): Promise<Response> {
  try {
    const { token } = await context.params
    const parsed = orderLinkWriteSchema.safeParse(await request.json().catch(() => ({})))
    if (!parsed.success) {
      return noStore(Response.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 }))
    }
    const ctx = sessionlessContext(await createRequestContainer(), request)
    const { id, participantPersonId, ...order } = parsed.data
    if (id) return noStore(await orderCommandResponse(ctx, 'payments.orders.update', { ...order, id, token: token ?? '' }))
    // The campaign is the link's; the command fills it in.
    return noStore(
      await orderCommandResponse(ctx, 'payments.orders.place', {
        ...order,
        participantPersonId,
        token: token ?? '',
      }),
    )
  } catch (error: unknown) {
    return noStore(errorResponse(error, 'payments.order_link.order'))
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Payments',
  summary: 'Order from a personal link',
  methods: {
    POST: {
      summary: 'Place or change an order from a personal link',
      description:
        "Sessionless (REQ-032, M-19). Without `id`: a new order for `participantPersonId` in the link's campaign (201). With `id`: a change of that order; send its `updatedAt` in the platform optimistic-lock header. The link guardian's current grants decide whom it may order for. No online payment from a link.",
      requestBody: { contentType: 'application/json', schema: orderLinkWriteSchema },
      responses: [
        { status: 201, description: 'The new order and its charge', schema: orderWriteResponseSchema },
        { status: 200, description: 'The changed order', schema: orderWriteResponseSchema },
      ],
      errors: [
        ...orderWriteErrors,
        { status: 410, description: '`token_link_expired`', schema: errorSchema },
        { status: 429, description: 'Too many requests', schema: z.object({ error: z.string() }) },
      ],
    },
  },
}
