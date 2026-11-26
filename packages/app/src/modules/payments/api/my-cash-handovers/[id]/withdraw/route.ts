// `POST /api/payments/my-cash-handovers/{id}/withdraw` — "Withdraw" on M-18 (payments spec REQ-033a, DD-31a, TEST-089;
// D-042, #791): the collector withdraws their own pending handover and the payments are theirs to send again. Another
// person's handover answers 404, like an unknown one.
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { errorSchema } from '../../../shared'
import { decisionHandler, decisionResponseSchema } from '../../../cash-handover-routes'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['payments.groups.collect'] },
}

export const POST = decisionHandler('payments.cash_handovers.withdraw')

export const openApi: OpenApiRouteDoc = {
  tag: 'Payments',
  summary: 'Withdraw my cash handover',
  methods: {
    POST: {
      summary: 'Withdraw my pending cash handover',
      description: 'Only the collector who sent it; the payments are no longer reserved.',
      responses: [{ status: 200, description: 'Withdrawn', schema: decisionResponseSchema }],
      errors: [
        { status: 403, description: 'scope_denied', schema: errorSchema },
        { status: 404, description: 'Handover not found (or another person’s)', schema: errorSchema },
        { status: 409, description: '`cash_handover_not_pending` (already decided)', schema: errorSchema },
      ],
    },
  },
}
