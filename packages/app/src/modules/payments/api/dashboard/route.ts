// `GET /api/payments/dashboard` — the B-01 payment widgets (README B-01; payments spec REQ-011; issue #111 E07-S04):
// "Overdue" — what remains on `open` and `partially_paid` charges past their due date in the club's calendar, how many
// charges and how many families (distinct payers) — and "Charges without a payer" — open charges with `payer_missing`.
// The club administrator's view, like the charge list (`payments.view` and the `club_admin` grant).
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import {
  assertInScope,
  commandContextForRequest,
  errorResponse,
  scopeContract,
  trustedScopeOf,
} from '@/modules/foundation'
import { paymentsDashboard } from '../../services/payer-overview'
import { PAYMENTS_READ_KINDS, errorSchema } from '../shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['payments.view'] },
}

const responseSchema = z.object({
  overdue: z.object({
    total: z.number().int().describe('Grosz remaining on overdue charges'),
    charges: z.number().int(),
    families: z.number().int().describe('Distinct payers of the overdue charges'),
  }),
  withoutPayer: z.object({ charges: z.number().int().describe('Open charges without a payer') }),
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
    return Response.json(await paymentsDashboard(ctx.container, scope))
  } catch (error: unknown) {
    return errorResponse(error, 'payments.dashboard')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Payments',
  summary: 'Payments dashboard',
  methods: {
    GET: {
      summary: 'Read the overdue and without-payer totals',
      description:
        'The B-01 widgets: overdue charges (remaining total, charges, families) and open charges without a payer.',
      responses: [{ status: 200, description: 'The totals', schema: responseSchema }],
      errors: [
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 403, description: '`scope_denied`', schema: errorSchema },
      ],
    },
  },
}
