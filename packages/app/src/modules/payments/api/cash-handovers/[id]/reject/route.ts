// `POST /api/payments/cash-handovers/{id}/reject` — "Reject" of a pending cash handover (payments spec REQ-033a,
// DD-31a, TEST-089; D-042, #791): the treasurer or the club administrator (`payments.cash.settle`) names the
// difference; the payments return to the collector, who is told the reason and may send a corrected handover.
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { cashHandoverRejectSchema } from '../../../../data/validators'
import { errorSchema } from '../../../shared'
import { decisionHandler, decisionResponseSchema } from '../../../cash-handover-routes'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['payments.cash.settle'] },
}

export const POST = decisionHandler('payments.cash_handovers.reject')

export const openApi: OpenApiRouteDoc = {
  tag: 'Payments',
  summary: 'Reject a cash handover',
  methods: {
    POST: {
      summary: 'Reject a pending cash handover with a reason',
      description: 'The payments return to the collector; the reason is shown to them (e-mail and their page).',
      requestBody: { contentType: 'application/json', schema: cashHandoverRejectSchema },
      responses: [{ status: 200, description: 'Rejected', schema: decisionResponseSchema }],
      errors: [
        { status: 400, description: 'Invalid input (the reason is required)', schema: errorSchema },
        { status: 403, description: 'scope_denied', schema: errorSchema },
        { status: 404, description: 'Handover not found', schema: errorSchema },
        { status: 409, description: '`cash_handover_not_pending` (already decided)', schema: errorSchema },
      ],
    },
  },
}
