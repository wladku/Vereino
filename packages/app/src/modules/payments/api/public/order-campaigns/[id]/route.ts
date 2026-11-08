// `GET /api/payments/public/order-campaigns/{id}?club=<slug>` — the campaign card of M-17 without a session (REQ-032,
// issue #116): the club's name and the campaign's name, description, deadline and whether it still takes orders, so
// a guardian who opened the share link can sign in or ask for a personal link. The club comes from its public slug
// (D-024) and the campaign is read inside it; an unknown club or campaign, or a draft, answers 404. Rate-limited per
// client IP; no personal data.
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { errorResponse } from '@/modules/foundation'
import { CAMPAIGN_STATUSES } from '../../../../lib/order-campaigns'
import { publicCampaignCard } from '../../../../services/order-links'
import { errorSchema } from '../../../shared'

/** Per client IP (S8.6, V-10); disabled under integration tests. */
export const metadata = {
  GET: { requireAuth: false, rateLimit: { points: 60, duration: 60, keyPrefix: 'payments_order_campaign_card' } },
}

const querySchema = z.object({ club: z.string().trim().min(1).max(120) })

const cardSchema = z.object({
  club: z.object({ name: z.string() }),
  campaign: z.object({
    id: z.uuid(),
    name: z.string(),
    description: z.string().nullable(),
    closesOn: z.string(),
    status: z.enum(CAMPAIGN_STATUSES),
    ordersOpen: z.boolean(),
  }),
})

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const params = z.object({ id: z.uuid() }).safeParse(await context.params)
    const query = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
    if (!params.success || !query.success) return Response.json({ error: 'Not found' }, { status: 404 })
    const container = await createRequestContainer()
    const card = await publicCampaignCard(container, query.data.club, params.data.id)
    if (!card) return Response.json({ error: 'Not found' }, { status: 404 })
    return Response.json(card)
  } catch (error: unknown) {
    return errorResponse(error, 'payments.public_order_campaign')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Payments',
  summary: 'Public card of an order campaign',
  methods: {
    GET: {
      summary: 'The campaign card for a guardian without a session',
      description:
        'Sessionless (REQ-032, M-17). The club comes from its public slug (`club`), the campaign from the share link. Name, description, deadline and whether it still takes orders; no orders, children or prices.',
      query: querySchema,
      responses: [{ status: 200, description: 'The card', schema: cardSchema }],
      errors: [
        { status: 404, description: 'Unknown club or campaign, or a draft', schema: errorSchema },
        { status: 429, description: 'Too many requests', schema: z.object({ error: z.string() }) },
      ],
    },
  },
}
