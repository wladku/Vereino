// `POST /api/payments/cash-handovers/{id}/confirm` — "Confirm" of a pending cash handover (payments spec REQ-033a,
// DD-31a, TEST-089; D-042, #791): the treasurer or the club administrator (`payments.cash.settle`) accepts the whole
// handover; its payments carry it and leave the collector's "Cash with you", and the collector is told.
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { errorSchema } from '../../../shared'
import { decisionHandler, decisionResponseSchema } from '../../../cash-handover-routes'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['payments.cash.settle'] },
}

export const POST = decisionHandler('payments.cash_handovers.confirm')

export const openApi: OpenApiRouteDoc = {
  tag: 'Payments',
  summary: 'Confirm a cash handover',
  methods: {
    POST: {
      summary: 'Confirm a pending cash handover',
      description: 'The whole handover is accepted (no partial acceptance); the cash becomes the club’s.',
      responses: [{ status: 200, description: 'Confirmed', schema: decisionResponseSchema }],
      errors: [
        { status: 400, description: 'Invalid input', schema: errorSchema },
        { status: 403, description: 'scope_denied', schema: errorSchema },
        { status: 404, description: 'Handover not found', schema: errorSchema },
        {
          status: 409,
          description: '`cash_handover_not_pending` (already decided), `cash_payment_reversed`',
          schema: errorSchema,
        },
      ],
    },
  },
}
