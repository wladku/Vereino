// `GET /api/payments/cash/payers?search=` (issue #114, the owner's default of 2026-11-07: the payer select of
// "Accept cash", M-15 and B-21): the payers with charges still to pay, each with the wards the charges are for and the
// total due, sorted by surname; `search` (three letters or more) matches the payer's or a ward's name through the
// people directory's name tokens.
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import {
  assertInScope,
  commandContextForRequest,
  errorResponse,
  scopeContract,
  trustedScopeOf,
} from '@/modules/foundation'
import { cashPayersQuerySchema } from '../../../data/validators'
import { payersWithDue } from '../../../services/cash'
import { PAYMENTS_READ_KINDS, errorSchema } from '../../shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['payments.cash.record'] },
}

const nameSchema = z.object({ personId: z.uuid(), firstName: z.string(), lastName: z.string() })

const responseSchema = z.object({
  items: z.array(
    z.object({
      payerPersonId: z.uuid(),
      firstName: z.string(),
      lastName: z.string(),
      wards: z.array(nameSchema),
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
    const named = await payersWithDue(ctx.container, scope, query.search)
    const start = (query.page - 1) * query.pageSize
    return Response.json({
      items: named.slice(start, start + query.pageSize),
      total: named.length,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.max(1, Math.ceil(named.length / query.pageSize)),
    })
  } catch (error: unknown) {
    return errorResponse(error, 'payments.cash.payers')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Payments',
  summary: 'Payers to accept cash from',
  methods: {
    GET: {
      summary: 'Payers with charges still to pay',
      description:
        "Each payer with the wards their charges are for and the total due, sorted by surname. `search` (three letters or more) matches the payer's or a ward's name; a shorter term filters nothing.",
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
