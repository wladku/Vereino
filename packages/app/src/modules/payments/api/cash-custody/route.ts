// `GET /api/payments/cash-custody` — B-33 "Cash to settle" (payments spec UI table → `/backend/payments/cash-custody`;
// REQ-033, TEST-046; issue #118 E07-S11): the cash held by collectors — per person their cash payments with the `KP`
// receipt numbers, the oldest day and the total — that no handover settled yet. The club administrator's
// (`payments.cash.settle`) until the treasurer role (#245).
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import {
  assertInScope,
  commandContextForRequest,
  errorResponse,
  scopeContract,
  trustedScopeOf,
} from '@/modules/foundation'
import { cashCustody } from '../../services/cash-handovers'
import { PAYMENTS_READ_KINDS, errorSchema } from '../shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['payments.cash.settle'] },
}

const personSchema = z.object({ firstName: z.string(), lastName: z.string() }).nullable()

const custodyResponseSchema = z.object({
  items: z.array(
    z.object({
      collectorPersonId: z.uuid(),
      collector: personSchema,
      oldestPaidOn: z.string().describe('The day the oldest held payment was received'),
      total: z.number().int().describe('Grosz held by the person'),
      payments: z.array(
        z.object({
          paymentId: z.uuid(),
          receiptNumber: z.string().describe('`KP/YYYY/MM/NNN`'),
          paidOn: z.string(),
          amount: z.number().int().describe('Grosz'),
          chargeId: z.uuid(),
          description: z.string(),
          payerPersonId: z.string().nullable(),
          payer: personSchema,
        }),
      ),
    }),
  ),
  total: z.number().int().describe('Grosz held by all collectors'),
})

export async function GET(request: Request): Promise<Response> {
  try {
    const ctx = await commandContextForRequest(request)
    const scope = ctx ? trustedScopeOf(ctx) : null
    if (!ctx || !scope) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    await assertInScope(await scopeContract.resolve(ctx), PAYMENTS_READ_KINDS, {
      id: scope.organizationId,
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
    })
    return Response.json(await cashCustody(ctx.container, scope))
  } catch (error: unknown) {
    return errorResponse(error, 'payments.cash_custody')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Payments',
  summary: 'Cash held by collectors',
  methods: {
    GET: {
      summary: 'Cash to settle',
      description:
        'The cash payments with a `KP` receipt that collectors still hold (in no handover, not reversed), grouped by collector: the oldest cash first.',
      responses: [{ status: 200, description: 'The collectors and their cash', schema: custodyResponseSchema }],
      errors: [
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 403, description: 'scope_denied', schema: errorSchema },
      ],
    },
  },
}
