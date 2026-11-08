// `GET /api/payments/bank-transactions` — the B-29 queue (payments spec REQ-030; issue #113): the club's statement
// transfers in one status (To confirm `suggested`, Unmatched, Recorded `booked`, Skipped `ignored`) or all, newest
// booking first, each with its payer and code, the charges it pays and why it was matched; with the count of each
// status for the perspectives.
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import {
  assertInScope,
  commandContextForRequest,
  errorResponse,
  scopeContract,
  trustedScopeOf,
} from '@/modules/foundation'
import { bankTransactionListQuerySchema } from '../../data/validators'
import { listTransfers, transferCounts } from '../../services/bank'
import { PAYMENTS_READ_KINDS, errorSchema } from '../shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['payments.bank.import'] },
}

const nameSchema = z.object({ firstName: z.string(), lastName: z.string() }).nullable()

const itemSchema = z.object({
  id: z.uuid(),
  importId: z.uuid(),
  line: z.number().int().describe('The line of the statement file'),
  bookedOn: z.string(),
  amount: z.number().int().describe('Grosz'),
  counterpartyName: z.string().nullable(),
  counterpartyAccount: z.string().nullable(),
  title: z.string(),
  status: z.string().describe('`booked`, `suggested`, `unmatched` or `ignored`'),
  payerPersonId: z.uuid().nullable(),
  payer: nameSchema,
  payerCode: z.string().nullable(),
  allocation: z.array(z.object({ chargeId: z.uuid(), amount: z.number().int(), description: z.string().nullable() })),
  unallocated: z.number().int().describe('Grosz beyond the charges (an overpayment)'),
  matchReason: z.string(),
  autoBooked: z.boolean(),
  skipReason: z.string().nullable(),
  skipNote: z.string().nullable(),
  decidedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string().describe('The lock token of the decisions'),
})

const responseSchema = z.object({
  items: z.array(itemSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
  totalPages: z.number().int(),
  counts: z.object({
    suggested: z.number().int(),
    unmatched: z.number().int(),
    booked: z.number().int(),
    ignored: z.number().int(),
    all: z.number().int(),
  }),
})

export async function GET(request: Request): Promise<Response> {
  try {
    const ctx = await commandContextForRequest(request)
    const scope = ctx ? trustedScopeOf(ctx) : null
    if (!ctx || !scope) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const query = bankTransactionListQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams))
    await assertInScope(await scopeContract.resolve(ctx), PAYMENTS_READ_KINDS, {
      id: scope.organizationId,
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
    })
    const [{ items, total }, counts] = await Promise.all([
      listTransfers(ctx.container, scope, query),
      transferCounts(ctx.container, scope),
    ])
    return Response.json({
      items,
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
      counts,
    })
  } catch (error: unknown) {
    return errorResponse(error, 'payments.bank_transactions.list')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Payments',
  summary: 'Statement transfers',
  methods: {
    GET: {
      summary: 'Statement transfers by status',
      description:
        'The club’s imported transfers in one status, or all, newest booking first, with the payer and their code, the charges each pays (oldest first) and the match reason; `counts` holds every status’s total.',
      query: bankTransactionListQuerySchema,
      responses: [{ status: 200, description: 'The transfers', schema: responseSchema }],
      errors: [
        { status: 400, description: 'Invalid input', schema: errorSchema },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 403, description: 'scope_denied', schema: errorSchema },
      ],
    },
  },
}
