// `POST /api/payments/order-campaigns/{id}/remind` — "Remind everyone" (payments spec API row `/remind`; REQ-032,
// issue #115, B-32 "No order"): `payments.order_campaigns.remind` e-mails the guardians of the children still without
// an order (of one group with `groupId`) while the campaign collects orders.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import type { OrderCampaignRemindResult } from '../../../../commands/order-campaigns'
import { orderCampaignRemindSchema } from '../../../../data/validators'
import { errorSchema } from '../../../shared'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['payments.orders.manage'] },
}

const bodySchema = orderCampaignRemindSchema.omit({ id: true })

const responseSchema = z.object({
  ok: z.literal(true),
  children: z.number().int().describe('Children without an order'),
  recipients: z.number().int().describe('Guardians e-mailed'),
})

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = z.object({ id: z.uuid() }).parse(await context.params)
    const ctx = await commandContextForRequest(request)
    if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const body: unknown = await request.json().catch(() => ({}))
    const { result } = await ctx.container
      .resolve<CommandBus>('commandBus')
      .execute<unknown, OrderCampaignRemindResult>('payments.order_campaigns.remind', {
        input: { ...(typeof body === 'object' && body !== null ? body : {}), id },
        ctx,
      })
    return Response.json({ ok: true, children: result.children, recipients: result.recipients })
  } catch (error: unknown) {
    return errorResponse(error, 'payments.order_campaigns.remind')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Payments',
  summary: 'Remind guardians without an order',
  methods: {
    POST: {
      summary: 'E-mail the guardians of the children without an order',
      description:
        'Only while the campaign is `open`. An adult participant without a guardian is reminded in person; a guardian without an e-mail address is skipped. Each call sends again.',
      requestBody: { contentType: 'application/json', schema: bodySchema },
      responses: [{ status: 200, description: 'How many children and guardians', schema: responseSchema }],
      errors: [
        { status: 403, description: 'scope_denied', schema: errorSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
        { status: 409, description: '`order_campaign_not_collecting`', schema: errorSchema },
      ],
    },
  },
}
