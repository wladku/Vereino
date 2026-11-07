// `POST /api/payments/checkout/quote` — what an online payment of the selected charges costs, without saving
// anything (payments spec API table, REQ-012, R13; M-08; TEST-055; #110): the charges' amount, the online fee line
// (nothing when the club pays; percent plus fixed in `payer_pays` mode) and the total. The same checks as the
// checkout: 403 someone else's charge or a minor (R10), 422 `payer_missing`, 409 `charge_not_open`.
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import { checkoutSchema } from '../../../data/validators'
import { payerOf, quoteCheckout } from '../../../services/checkout'
import { errorSchema } from '../../shared'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['payments.pay_online'] },
}

export const quoteSchema = z.object({
  amount: z.number().int().describe("Grosz: the charges' amounts due"),
  feeAmount: z.number().int().describe('Grosz: the online fee line, > 0 only in `payer_pays` mode'),
  total: z.number().int().describe('Grosz: what the payer pays'),
  feeMode: z.enum(['club_pays', 'payer_pays']),
})

export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await commandContextForRequest(request)
    if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const body = checkoutSchema.parse(await request.json().catch(() => ({})))
    const payer = await payerOf(ctx)
    return Response.json(await quoteCheckout(ctx.container, payer, body.chargeIds))
  } catch (error: unknown) {
    return errorResponse(error, 'payments.checkout.quote')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Payments',
  summary: 'Quote an online payment',
  methods: {
    POST: {
      summary: 'Quote an online payment of the selected charges',
      description:
        'The amount, the online fee line of the club setting `online_fee_mode` and the total; saves nothing. Only `open` charges the caller pays.',
      requestBody: { contentType: 'application/json', schema: checkoutSchema },
      responses: [{ status: 200, description: 'The quote', schema: quoteSchema }],
      errors: [
        { status: 400, description: 'Invalid input', schema: errorSchema },
        {
          status: 403,
          description: '`checkout_charge_forbidden` (someone else’s charge), `payments_minor`',
          schema: errorSchema,
        },
        { status: 409, description: '`charge_not_open`', schema: errorSchema },
        { status: 422, description: '`payer_missing`', schema: errorSchema },
      ],
    },
  },
}
