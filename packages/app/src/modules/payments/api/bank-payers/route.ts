// `GET /api/payments/bank-payers?search=` — the payer select of the statement's Change or Assign (payments spec
// REQ-030; issue #113, B-29): the payers with charges still to pay, sorted by surname, each with their wards, the
// total due and their payer code (assigned now for the payers shown when they have none yet — it never changes).
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import {
  assertInScope,
  commandContextForRequest,
  errorResponse,
  scopeContract,
  trustedScopeOf,
} from '@/modules/foundation'
import { cashPayersQuerySchema } from '../../data/validators'
import { payersWithDue } from '../../services/cash'
import { ensurePayerCode } from '../../services/payer-overview'
import { PAYMENTS_READ_KINDS, errorSchema } from '../shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['payments.bank.import'] },
}

const responseSchema = z.object({
  items: z.array(
    z.object({
      payerPersonId: z.uuid(),
      firstName: z.string(),
      lastName: z.string(),
      payerCode: z.string(),
      wards: z.array(z.object({ personId: z.uuid(), firstName: z.string(), lastName: z.string() })),
      totalDue: z.number().int().describe('Grosz still to pay on all of their charges'),
      chargeCount: z.number().int(),
    }),
  ),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
  totalPages: z.number().int(),
})

export async function GET(request: Request): Promise<Response> {
  try {
    const ctx = await commandContextForRequest(request)
    const scope = ctx ? trustedScopeOf(ctx) : null
    if (!ctx || !scope) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const query = cashPayersQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams))
    await assertInScope(await scopeContract.resolve(ctx), PAYMENTS_READ_KINDS, {
      id: scope.organizationId,
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
    })
    const payers = await payersWithDue(ctx.container, scope, query.search)
    const start = (query.page - 1) * query.pageSize
    const page = payers.slice(start, start + query.pageSize)
    const items = []
    for (const payer of page) {
      items.push({ ...payer, payerCode: await ensurePayerCode(ctx.container, scope, payer.payerPersonId) })
    }
    return Response.json({
      items,
      total: payers.length,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.max(1, Math.ceil(payers.length / query.pageSize)),
    })
  } catch (error: unknown) {
    return errorResponse(error, 'payments.bank_payers')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Payments',
  summary: 'Payers to assign a transfer to',
  methods: {
    GET: {
      summary: 'Payers with charges still to pay, with their codes',
      description:
        "Each payer with the wards their charges are for, the total due and the payer code, sorted by surname. `search` (three letters or more) matches the payer's or a ward's name.",
      query: cashPayersQuerySchema,
      responses: [{ status: 200, description: 'The payers', schema: responseSchema }],
      errors: [
        { status: 400, description: 'Invalid input', schema: errorSchema },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 403, description: 'scope_denied', schema: errorSchema },
      ],
    },
  },
}
