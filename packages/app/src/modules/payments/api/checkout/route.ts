// `POST /api/payments/checkout` — `payments.checkout.create` (payments spec API table, DD-42, REQ-012; M-08; #110):
// starts the online payment of the selected open charges and answers the gateway's embedded client session (the
// Stripe Payment Element; its `returnUrl` is M-09, added by the page) with the amounts. 403 someone else's charge or
// a minor (R10), 422 `payer_missing`, 409 `charge_not_open`, 502 `gateway_unavailable`.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import type { CheckoutCreateResult } from '../../commands/checkout'
import { checkoutSchema } from '../../data/validators'
import { errorSchema } from '../shared'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['payments.pay_online'] },
}

const responseSchema = z.object({
  checkoutId: z.uuid(),
  providerKey: z.string().describe('`stripe` (the club account)'),
  clientSession: z
    .object({ type: z.string(), rendererKey: z.string().optional() })
    .loose()
    .nullable()
    .describe('The embedded client session of the gateway (DD-42)'),
  amount: z.number().int(),
  feeAmount: z.number().int(),
  total: z.number().int(),
})

export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await commandContextForRequest(request)
    if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const body = checkoutSchema.parse(await request.json().catch(() => ({})))
    const commandBus = ctx.container.resolve<CommandBus>('commandBus')
    const { result } = await commandBus.execute<unknown, CheckoutCreateResult>('payments.checkout.create', {
      input: body,
      ctx,
    })
    return Response.json(
      {
        checkoutId: result.entity.id,
        providerKey: result.providerKey,
        clientSession: result.clientSession,
        ...result.totals,
      },
      { status: 201 },
    )
  } catch (error: unknown) {
    return errorResponse(error, 'payments.checkout.create')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Payments',
  summary: 'Pay charges online',
  methods: {
    POST: {
      summary: 'Start an online payment of the selected charges',
      description:
        'Creates a checkout (the charges, their amount and the `payer_pays` fee line) and the gateway session; the page renders `clientSession`. The charges are paid when the provider captures the total (the fulfilment, DD-42).',
      requestBody: { contentType: 'application/json', schema: checkoutSchema },
      responses: [{ status: 201, description: 'The checkout and its client session', schema: responseSchema }],
      errors: [
        { status: 400, description: 'Invalid input', schema: errorSchema },
        {
          status: 403,
          description: '`checkout_charge_forbidden` (someone else’s charge), `payments_minor`',
          schema: errorSchema,
        },
        { status: 409, description: '`charge_not_open`', schema: errorSchema },
        { status: 422, description: '`payer_missing`', schema: errorSchema },
        { status: 502, description: '`gateway_unavailable`', schema: errorSchema },
      ],
    },
  },
}
