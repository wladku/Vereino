// `POST /api/payments/orders/{id}/hand-over` — "Hand over kit" on M-18 (payments spec API row
// `/api/payments/orders/{id}/hand-over`; REQ-032, REQ-033, TEST-045; issue #117 E07-S10): `payments.orders.hand_over`
// marks the kit of a child of the caller's group handed over after the delivery; an unpaid kit only with
// `confirmUnpaid` (the charge stays open).
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import type { OrderHandOverResult } from '../../../../commands/group-charges'
import { orderHandOverSchema } from '../../../../data/validators'
import { errorSchema } from '../../../shared'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['payments.groups.collect'] },
}

const bodySchema = orderHandOverSchema.omit({ id: true })

const responseSchema = z.object({
  ok: z.literal(true),
  id: z.uuid(),
  handedOverAt: z.string(),
  unpaid: z.boolean().describe('Handed over with something still to pay'),
  actingRole: z.string(),
})

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = z.object({ id: z.uuid() }).parse(await context.params)
    const ctx = await commandContextForRequest(request)
    if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const body: unknown = await request.json().catch(() => ({}))
    const { result } = await ctx.container
      .resolve<CommandBus>('commandBus')
      .execute<unknown, OrderHandOverResult>('payments.orders.hand_over', {
        input: { ...(typeof body === 'object' && body !== null ? body : {}), id },
        ctx,
      })
    return Response.json({
      ok: true,
      id: result.entity.id,
      handedOverAt: result.entity.handedOverAt?.toISOString() ?? '',
      unpaid: result.remaining > 0,
      actingRole: result.actingRole,
    })
  } catch (error: unknown) {
    return errorResponse(error, 'payments.orders.hand_over')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Payments',
  summary: 'Hand over kit',
  methods: {
    POST: {
      summary: 'Mark the kit of a child of my group handed over',
      description:
        'After the campaign is delivered. An unpaid kit needs `confirmUnpaid: true` (the warning); its charge stays open.',
      requestBody: { contentType: 'application/json', schema: bodySchema },
      responses: [{ status: 200, description: 'Handed over', schema: responseSchema }],
      errors: [
        { status: 400, description: 'Invalid input', schema: errorSchema },
        { status: 403, description: '`scope_denied`, `charge_out_of_scope`', schema: errorSchema },
        { status: 404, description: 'Order not found', schema: errorSchema },
        {
          status: 409,
          description:
            '`order_not_delivered`, `order_already_handed_over`, `order_unpaid_confirm_required` (`remaining` in grosz)',
          schema: errorSchema,
        },
      ],
    },
  },
}
