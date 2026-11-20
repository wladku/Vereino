// `/api/payments/cash-handovers` — B-33 "Accept handover" and the handover history (payments spec UI table →
// `/backend/payments/cash-custody`; REQ-033, TEST-046; issue #118 E07-S11):
// - `POST` accepts the selected cash payments of one collector under one `RG/YYYY/MM/NNN` number; the payments leave
//   the collector's "Cash with you". 409 `cash_already_settled` when a payment is already in a handover;
// - `GET` is the handover history, newest first.
// The club administrator's and the treasurer's (`payments.cash.settle`; DD-33, #245).
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import {
  assertInScope,
  commandContextForRequest,
  errorResponse,
  scopeContract,
  trustedScopeOf,
} from '@/modules/foundation'
import type { CashHandoverResult } from '../../commands/cash-handovers'
import { cashHandoverAcceptSchema, cashHandoverListQuerySchema } from '../../data/validators'
import { cashHandoverHistory } from '../../services/cash-handovers'
import { PAYMENTS_READ_KINDS, errorSchema } from '../shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['payments.cash.settle'] },
  POST: { requireAuth: true, requireFeatures: ['payments.cash.settle'] },
}

const personSchema = z.object({ firstName: z.string(), lastName: z.string() }).nullable()

const acceptResponseSchema = z.object({
  ok: z.literal(true),
  id: z.uuid(),
  number: z.string().describe('`RG/YYYY/MM/NNN`'),
  collectorPersonId: z.uuid(),
  amount: z.number().int().describe('Grosz'),
  paymentIds: z.array(z.uuid()),
  actingRole: z.string(),
})

const historyResponseSchema = z.object({
  items: z.array(
    z.object({
      id: z.uuid(),
      number: z.string(),
      collectorPersonId: z.uuid(),
      collector: personSchema,
      receivedBy: personSchema,
      amount: z.number().int().describe('Grosz'),
      paymentCount: z.number().int(),
      receiptNumbers: z.array(z.string()).describe('The `KP` receipts the handover settled'),
      createdAt: z.string(),
    }),
  ),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
  totalPages: z.number().int(),
})

export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await commandContextForRequest(request)
    if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const body: unknown = await request.json().catch(() => ({}))
    const commandBus = ctx.container.resolve<CommandBus>('commandBus')
    const { result } = await commandBus.execute<unknown, CashHandoverResult>('payments.cash_handovers.accept', {
      input: typeof body === 'object' && body !== null ? body : {},
      ctx,
    })
    return Response.json(
      {
        ok: true,
        id: result.entity.id,
        number: result.number,
        collectorPersonId: result.collectorPersonId,
        amount: result.amount,
        paymentIds: result.paymentIds,
        actingRole: result.actingRole,
      },
      { status: 201 },
    )
  } catch (error: unknown) {
    return errorResponse(error, 'payments.cash_handovers.accept')
  }
}

export async function GET(request: Request): Promise<Response> {
  try {
    const ctx = await commandContextForRequest(request)
    const scope = ctx ? trustedScopeOf(ctx) : null
    if (!ctx || !scope) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const query = cashHandoverListQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams))
    await assertInScope(await scopeContract.resolve(ctx), PAYMENTS_READ_KINDS, {
      id: scope.organizationId,
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
    })
    return Response.json(await cashHandoverHistory(ctx.container, scope, query.page, query.pageSize))
  } catch (error: unknown) {
    return errorResponse(error, 'payments.cash_handovers.list')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Payments',
  summary: 'Cash handovers',
  methods: {
    GET: {
      summary: 'Handover history',
      description: "The club's cash handovers, newest first, with who handed the cash over and who received it.",
      query: cashHandoverListQuerySchema,
      responses: [{ status: 200, description: 'A page of handovers', schema: historyResponseSchema }],
      errors: [
        { status: 400, description: 'Invalid input', schema: errorSchema },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 403, description: 'scope_denied', schema: errorSchema },
      ],
    },
    POST: {
      summary: 'Accept a cash handover',
      description:
        'The club receives the selected cash payments of one collector: one `RG/YYYY/MM/NNN` number is issued in the month of the handover and the payments are settled.',
      requestBody: { contentType: 'application/json', schema: cashHandoverAcceptSchema },
      responses: [{ status: 201, description: 'The handover', schema: acceptResponseSchema }],
      errors: [
        { status: 400, description: 'Invalid input', schema: errorSchema },
        { status: 403, description: 'scope_denied', schema: errorSchema },
        {
          status: 409,
          description: '`cash_already_settled` (a payment is already in a handover), `cash_payment_reversed`',
          schema: errorSchema,
        },
        {
          status: 422,
          description:
            '`cash_handover_payments_invalid` (a payment unknown in the club, not collected cash with a receipt, or collected by someone else)',
          schema: errorSchema,
        },
      ],
    },
  },
}
