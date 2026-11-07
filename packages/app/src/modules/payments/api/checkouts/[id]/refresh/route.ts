// `POST /api/payments/checkouts/{id}/refresh` — `payments.checkouts.fulfil` for the payer (payments spec API table,
// DD-42, REQ-012; M-09; #110): runs the fulfilment (the provider state is read, a capture is booked once) and answers
// the checkout's status, the M-09 state and its charges. Only the payer's own checkout (403 otherwise). A gateway
// error answers 502 and M-09 keeps showing "Payment in progress".
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import { paymentsErrors } from '../../../errors'
import { fulfilCheckout, payerOf } from '../../../../services/checkout'
import { checkoutCharges, checkoutSummary, myCheckout } from '../../../../services/my-charges'
import { checkoutSummarySchema, errorSchema } from '../../../shared'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['payments.view_own'] },
}

const paramsSchema = z.object({ id: z.uuid() })

const responseSchema = checkoutSummarySchema.extend({
  charges: z.array(
    z.object({ id: z.uuid(), description: z.string(), status: z.string(), amountDue: z.number().int() }),
  ),
})

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = paramsSchema.parse(await context.params)
    const ctx = await commandContextForRequest(request)
    if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const payer = await payerOf(ctx)
    if (!(await myCheckout(ctx.container, payer, id))) await paymentsErrors.throw('checkout_charge_forbidden')
    await fulfilCheckout(ctx.container, payer.scope, id)
    const checkout = await myCheckout(ctx.container, payer, id)
    if (!checkout) return Response.json({ error: 'Not found' }, { status: 404 })
    const charges = await checkoutCharges(ctx.container, payer, checkout)
    return Response.json({ ...checkoutSummary(checkout), charges })
  } catch (error: unknown) {
    return errorResponse(error, 'payments.checkouts.fulfil')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Payments',
  summary: 'Refresh an online payment',
  methods: {
    POST: {
      summary: 'Run the fulfilment of my checkout and read its status',
      description:
        'Reads the provider state; a capture of the full total books the online payments once. Answers the checkout with the M-09 state (`received`, `in_progress`, `interrupted`) and its charges.',
      responses: [{ status: 200, description: 'The checkout', schema: responseSchema }],
      errors: [
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        {
          status: 403,
          description: '`checkout_charge_forbidden` (someone else’s checkout), `payments_minor`',
          schema: errorSchema,
        },
        {
          status: 502,
          description: '`gateway_unavailable` (the page keeps showing "in progress")',
          schema: errorSchema,
        },
      ],
    },
  },
}
