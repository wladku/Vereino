// `GET /api/payments/order-links/{token}` — the order form of a personal link (payments spec API row; REQ-032,
// foundation P-10, DD-35; issue #116, M-19). Sessionless and rate-limited per client IP; the token in the path is the
// only credential. It peeks (spends nothing): the campaign, its products, the link guardian's children in its groups
// with their orders, and the transfer instructions — no online payment from a link. An unknown, malformed or foreign
// token answers 404 `order_link_not_found`; an expired link 410 `token_link_expired`; a completed campaign 410
// `order_campaign_completed`.
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { errorResponse } from '@/modules/foundation'
import { readOrderLink } from '../../../services/order-links'
import { paymentsErrors } from '../../errors'
import { noStore, orderFormSchema } from '../../order-routes'
import { errorSchema } from '../../shared'

/** Per client IP (S8.6, V-10); disabled under integration tests. */
export const metadata = {
  GET: { requireAuth: false, rateLimit: { points: 60, duration: 60, keyPrefix: 'payments_order_link_read' } },
}

export async function GET(_request: Request, context: { params: Promise<{ token?: string }> }): Promise<Response> {
  try {
    const { token } = await context.params
    const container = await createRequestContainer()
    const page = await readOrderLink(container, token ?? '')
    if (!page) {
      const error = await paymentsErrors.create('order_link_not_found')
      return noStore(Response.json(error.body, { status: error.status }))
    }
    return noStore(Response.json(page))
  } catch (error: unknown) {
    return noStore(errorResponse(error, 'payments.order_link.read'))
  }
}

const pageSchema = orderFormSchema.extend({
  club: z.object({ name: z.string() }),
  expiresAt: z.string(),
})

export const openApi: OpenApiRouteDoc = {
  tag: 'Payments',
  summary: 'Order form of a personal link',
  methods: {
    GET: {
      summary: 'Read the order form of a personal link',
      description:
        "Sessionless (REQ-032, M-19). Spends nothing. The campaign, its products, the link guardian's children in the campaign's groups (by the guardian's current grants) with their orders, and the transfer instructions.",
      responses: [{ status: 200, description: 'The form', schema: pageSchema }],
      errors: [
        {
          status: 404,
          description: '`order_link_not_found` — unknown, malformed or foreign token',
          schema: errorSchema,
        },
        {
          status: 410,
          description: '`token_link_expired` (request a new link), `order_campaign_completed`',
          schema: errorSchema,
        },
        { status: 429, description: 'Too many requests', schema: z.object({ error: z.string() }) },
      ],
    },
  },
}
