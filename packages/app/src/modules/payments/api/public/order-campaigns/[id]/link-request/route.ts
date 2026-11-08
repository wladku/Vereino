// `POST /api/payments/public/order-campaigns/{id}/link-request` — the personal order link request (payments spec API
// row; REQ-032, issue #116, M-17 without a session): an address and the club of the share link. Sessionless and
// rate-limited per client IP; every well-formed request answers the same 202 after the same minimum time, whether the
// address belongs to a guardian of a child in the campaign's groups, to somebody else or to nobody — the response
// never reveals an address (no enumeration). Only a malformed request answers 400.
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { createLogger } from '@open-mercato/shared/lib/logger'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { getTelemetryRuntime } from '@open-mercato/shared/lib/telemetry/runtime'
import { orderLinkRequestSchema } from '../../../../../data/validators'
import { requestOrderLink } from '../../../../../services/order-links'
import { errorSchema } from '../../../../shared'

const logger = createLogger('payments').child({ component: 'order-link-request' })

/** 10 requests per 15 minutes per client IP (S8.6, V-10); disabled under integration tests. */
export const metadata = {
  POST: { requireAuth: false, rateLimit: { points: 10, duration: 900, keyPrefix: 'payments_order_link' } },
}

/** Every accepted request answers no sooner than this, so the time taken does not tell a known address. */
const MIN_RESPONSE_MS = 1000

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const started = Date.now()
  const params = z.object({ id: z.uuid() }).safeParse(await context.params)
  const body: unknown = await request.json().catch(() => null)
  const parsed = orderLinkRequestSchema.safeParse(body)
  if (!params.success || !parsed.success) {
    return Response.json(
      { error: 'Validation failed', details: [...(params.error?.issues ?? []), ...(parsed.error?.issues ?? [])] },
      { status: 400 },
    )
  }
  try {
    const container = await createRequestContainer()
    await requestOrderLink(container, { ...parsed.data, campaignId: params.data.id })
  } catch (error: unknown) {
    // A failure must not answer differently from "no such address"; it is reported, never shown.
    getTelemetryRuntime()?.reportError(error, { module: 'payments', code: 'payments.order_link.request_failed' })
    logger.warn('An order link request failed', { err: error })
  }
  const wait = MIN_RESPONSE_MS - (Date.now() - started)
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
  return Response.json({ status: 'accepted' }, { status: 202 })
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Payments',
  summary: 'Request a personal order link',
  methods: {
    POST: {
      summary: 'Send a personal order link to an address',
      description:
        "Sessionless (REQ-032). The club comes from its public slug, the campaign from the share link. While the campaign takes orders and the address belongs to an active guardian of a child in its groups, an e-mail with a personal link to `/club/o/{token}` is sent (valid until the end of the orders deadline); otherwise nothing is sent. Always 202 with the same body and no sooner than one second. Rate-limited per client IP.",
      requestBody: { contentType: 'application/json', schema: orderLinkRequestSchema },
      responses: [{ status: 202, description: 'Accepted', schema: z.object({ status: z.literal('accepted') }) }],
      errors: [
        { status: 400, description: 'Validation failed', schema: errorSchema },
        { status: 429, description: 'Too many requests', schema: z.object({ error: z.string() }) },
      ],
    },
  },
}
