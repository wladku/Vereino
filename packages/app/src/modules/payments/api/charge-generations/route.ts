// `GET /api/payments/charge-generations` — the generation list (owner decision (a) on #403): the club's charge
// generations, manual and automatic, newest first, each with its counts at generation time, the charges an undo would
// still cancel (`open`) and, once undone, when and how many were cancelled. `POST /charge-generations/{id}/undo` undoes
// one run.
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import {
  assertInScope,
  commandContextForRequest,
  errorResponse,
  scopeContract,
  trustedScopeOf,
} from '@/modules/foundation'
import { chargeGenerationListQuerySchema } from '../../data/validators'
import { listGenerations } from '../../services/generation'
import { PAYMENTS_READ_KINDS, errorSchema } from '../shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['payments.manage'] },
}

const listSchema = z.object({
  items: z.array(
    z.object({
      id: z.uuid(),
      period: z.string().describe('`YYYY-MM`'),
      created: z.number().int(),
      skipped: z.number().int().describe('Charges that already existed'),
      payerMissing: z.number().int().describe('Created charges without a payer'),
      open: z.number().int().describe('The charges still `open`: what an undo would cancel now'),
      cancelled: z.number().int().nullable().describe('The charges the undo cancelled; null while not undone'),
      undoneAt: z.string().nullable(),
      createdAt: z.string(),
      updatedAt: z.string().describe('The lock token of `POST /api/payments/charge-generations/{id}/undo`'),
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
    const query = chargeGenerationListQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams))
    await assertInScope(await scopeContract.resolve(ctx), PAYMENTS_READ_KINDS, {
      id: scope.organizationId,
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
    })
    const { items, total } = await listGenerations(ctx.container, scope, query)
    return Response.json({
      items,
      total,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
    })
  } catch (error: unknown) {
    return errorResponse(error, 'payments.charge_generations.list')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Payments',
  summary: 'Charge generations',
  methods: {
    GET: {
      summary: 'The generation list',
      description:
        'The club’s charge generations (manual and automatic), newest first, with their counts at generation time, the charges an undo would still cancel (`open`) and, once undone, when and how many charges were cancelled.',
      query: chargeGenerationListQuerySchema,
      responses: [{ status: 200, description: 'The generations', schema: listSchema }],
      errors: [
        { status: 400, description: 'Invalid query', schema: errorSchema },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 403, description: 'scope_denied', schema: errorSchema },
      ],
    },
  },
}
