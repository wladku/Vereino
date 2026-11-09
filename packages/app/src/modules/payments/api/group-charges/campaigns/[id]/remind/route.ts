// `POST /api/payments/group-charges/campaigns/{id}/remind` — "Remind guardians" of a campaign on M-18 (payments spec
// API row `/api/payments/order-campaigns/{id}/remind` for the coach; REQ-032, REQ-033; issue #117 E07-S10):
// `payments.order_campaigns.remind` for one group of the caller's — the guardians of its children without an order,
// while the campaign collects orders. The administrator's route keeps `payments.orders.manage`; this one is the
// coach's `payments.groups.collect`, and the command checks the group against the caller's grants.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import type { OrderCampaignRemindResult } from '../../../../../commands/order-campaigns'
import { errorSchema } from '../../../../shared'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['payments.groups.collect'] },
}

const bodySchema = z.object({ groupId: z.uuid() }).strict()

const responseSchema = z.object({
  ok: z.literal(true),
  children: z.number().int().describe('Children of the group without an order'),
  recipients: z.number().int().describe('Guardians e-mailed'),
})

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = z.object({ id: z.uuid() }).parse(await context.params)
    const ctx = await commandContextForRequest(request)
    if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const body = bodySchema.safeParse(await request.json().catch(() => ({})))
    if (!body.success) return Response.json({ error: 'Invalid input', code: 'input_invalid' }, { status: 400 })
    const { result } = await ctx.container
      .resolve<CommandBus>('commandBus')
      .execute<unknown, OrderCampaignRemindResult>('payments.order_campaigns.remind', {
        input: { id, groupId: body.data.groupId },
        ctx,
      })
    return Response.json({ ok: true, children: result.children, recipients: result.recipients })
  } catch (error: unknown) {
    return errorResponse(error, 'payments.order_campaigns.remind')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Payments',
  summary: "Remind my group's guardians without an order",
  methods: {
    POST: {
      summary: 'E-mail the guardians of the children of my group without an order',
      description: 'Only while the campaign is `open` and covers the group. Each call sends again.',
      requestBody: { contentType: 'application/json', schema: bodySchema },
      responses: [{ status: 200, description: 'How many children and guardians', schema: responseSchema }],
      errors: [
        { status: 400, description: 'Invalid input', schema: errorSchema },
        { status: 403, description: '`scope_denied` (a group outside my grants or the campaign)', schema: errorSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
        { status: 409, description: '`order_campaign_not_collecting`', schema: errorSchema },
      ],
    },
  },
}
