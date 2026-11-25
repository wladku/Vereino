// `/api/payments/my-cash-handovers` — the collector's side of the cash handover on M-18 (payments spec REQ-033a,
// DD-31a, TEST-089; D-042, #791):
// - `GET` the caller's held cash payments with their KP receipts (each with the pending handover that reserves it)
//   and their handovers: every pending one and the latest decided ones (a rejection with its reason);
// - `POST` sends the selected held payments as a pending `RG/YYYY/MM/NNN` handover; the club administrators and the
//   treasurers are told. 409 `cash_handover_payment_pending` when a payment is already in a pending handover.
// The coach's and the coordinator's (`payments.groups.collect`); only the caller's own cash (`self` grant).
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse, scopeContract, trustedScopeOf } from '@/modules/foundation'
import { selfPersonId } from '../../commands/cash'
import type { CashHandoverResult } from '../../commands/cash-handovers'
import { cashHandoverSendSchema } from '../../data/validators'
import { CASH_HANDOVER_STATUSES } from '../../lib/cash-handovers'
import { collectorHandovers } from '../../services/cash-handovers'
import { handoverRowSchema } from '../cash-handover-routes'
import { errorSchema } from '../shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['payments.groups.collect'] },
  POST: { requireAuth: true, requireFeatures: ['payments.groups.collect'] },
}

const personSchema = z.object({ firstName: z.string(), lastName: z.string() }).nullable()

const viewSchema = z.object({
  held: z.array(
    z.object({
      paymentId: z.uuid(),
      receiptNumber: z.string(),
      paidOn: z.string(),
      amount: z.number().int().describe('Grosz'),
      description: z.string(),
      payer: personSchema,
      pendingHandoverId: z.uuid().nullable().describe('The pending handover that reserves it'),
    }),
  ),
  total: z.number().int().describe('Grosz the caller holds'),
  handovers: z.array(handoverRowSchema),
})

const sendResponseSchema = z.object({
  ok: z.literal(true),
  id: z.uuid(),
  number: z.string(),
  status: z.enum(CASH_HANDOVER_STATUSES),
  amount: z.number().int(),
  paymentIds: z.array(z.uuid()),
  actingRole: z.string(),
})

export async function GET(request: Request): Promise<Response> {
  try {
    const ctx = await commandContextForRequest(request)
    const scope = ctx ? trustedScopeOf(ctx) : null
    if (!ctx || !scope) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    // Only the caller's own cash: the person of their `self` grant (none: nothing held).
    const personId = selfPersonId(await scopeContract.resolve(ctx))
    return Response.json(await collectorHandovers(ctx.container, scope, personId))
  } catch (error: unknown) {
    return errorResponse(error, 'payments.my_cash_handovers')
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await commandContextForRequest(request)
    if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const body: unknown = await request.json().catch(() => ({}))
    const { result } = await ctx.container
      .resolve<CommandBus>('commandBus')
      .execute<unknown, CashHandoverResult>('payments.cash_handovers.send', {
        input: typeof body === 'object' && body !== null ? body : {},
        ctx,
      })
    return Response.json(
      {
        ok: true,
        id: result.entity.id,
        number: result.number,
        status: result.status,
        amount: result.amount,
        paymentIds: result.paymentIds,
        actingRole: result.actingRole,
      },
      { status: 201 },
    )
  } catch (error: unknown) {
    return errorResponse(error, 'payments.cash_handovers.send')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Payments',
  summary: 'My cash handovers',
  methods: {
    GET: {
      summary: 'The cash I hold and my handovers',
      description:
        'The caller’s held cash payments with a `KP` receipt (each with the pending handover that reserves it) and their handovers: every pending one and the latest decided ones.',
      responses: [{ status: 200, description: 'Held cash and handovers', schema: viewSchema }],
      errors: [{ status: 401, description: 'Unauthorized', schema: errorSchema }],
    },
    POST: {
      summary: 'Send a cash handover',
      description:
        'A pending handover of the selected held payments with its `RG/YYYY/MM/NNN` number; the payments stay with the caller until the treasurer or administrator confirms it.',
      requestBody: { contentType: 'application/json', schema: cashHandoverSendSchema },
      responses: [{ status: 201, description: 'The pending handover', schema: sendResponseSchema }],
      errors: [
        { status: 400, description: 'Invalid input', schema: errorSchema },
        { status: 403, description: 'scope_denied (no own person record)', schema: errorSchema },
        {
          status: 409,
          description: '`cash_already_settled`, `cash_handover_payment_pending`, `cash_payment_reversed`',
          schema: errorSchema,
        },
        {
          status: 422,
          description: '`cash_handover_payments_invalid` (a payment unknown, not cash with a receipt, or not the caller’s)',
          schema: errorSchema,
        },
      ],
    },
  },
}
