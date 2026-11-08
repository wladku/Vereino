// `GET /api/payments/my-charges/summary` — the payer's Today tile on `/club` (M-02; payments spec REQ-012, REQ-002;
// issue #111 E07-S04): `due` with the open total, the number of open charges, the nearest due date and whether it has
// passed; `paid` when nothing is open; `guardian_pays` for an adult participant whose charges someone else pays.
// Behind the R10 gate like every own-payments route: a minor gets 403 `payments_minor` (TEST-021).
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import { payerOf } from '../../../services/checkout'
import { myPaymentsSummary } from '../../../services/payer-overview'
import { errorSchema } from '../../shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['payments.view_own'] },
}

const responseSchema = z.object({
  state: z.enum(['due', 'paid', 'guardian_pays']),
  openTotal: z.number().int().optional().describe('Grosz still to pay (`due` only)'),
  openCount: z.number().int().optional(),
  nearestDueDate: z.string().optional().describe('The earliest due date of an open charge (`due` only)'),
  overdue: z.boolean().optional().describe('The nearest due date has passed in the club calendar'),
})

export async function GET(request: Request): Promise<Response> {
  try {
    const ctx = await commandContextForRequest(request)
    if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const payer = await payerOf(ctx)
    return Response.json(await myPaymentsSummary(ctx.container, payer))
  } catch (error: unknown) {
    return errorResponse(error, 'payments.my_charges.summary')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Payments',
  summary: 'My payments summary',
  methods: {
    GET: {
      summary: "Summarize the caller's open charges for the Today tile",
      description:
        'What the caller still owes and the nearest due date, or that everything is paid, or that the guardian pays. A minor gets 403 `payments_minor` (R10).',
      responses: [{ status: 200, description: 'The summary', schema: responseSchema }],
      errors: [
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 403, description: '`payments_minor`, `scope_unlinked`, `scope_denied`', schema: errorSchema },
      ],
    },
  },
}
