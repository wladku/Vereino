// `POST /api/payments/payments/{id}/reverse` — `payments.payments.reverse` (payments spec API table, REQ-012; B-22;
// issue #109, the owner's default of 2026-11-06): a cash or transfer payment is corrected by a reversing entry — a
// negative payment of the same charge, dated today in the club's calendar, that names the original and carries the
// required reason; the charge's status is derived again. Send the charge's lock token in the optimistic-lock header.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import type { PaymentCommandResult } from '../../../../commands/ledger'
import { paymentReverseSchema } from '../../../../data/validators'
import { errorSchema } from '../../../shared'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['payments.manage'] },
}

const paramsSchema = z.object({ id: z.uuid() })

const bodySchema = paymentReverseSchema.omit({ id: true })

const responseSchema = z.object({
  ok: z.literal(true),
  paymentId: z.uuid().describe('The reversing entry'),
  reversesPaymentId: z.uuid(),
  chargeId: z.uuid(),
  chargeStatus: z.string(),
  remaining: z.number().int(),
  updatedAt: z.string().describe("The charge's new lock token"),
  actingRole: z.string(),
})

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = paramsSchema.parse(await context.params)
    const ctx = await commandContextForRequest(request)
    if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const body: unknown = await request.json().catch(() => ({}))
    const commandBus = ctx.container.resolve<CommandBus>('commandBus')
    const { result } = await commandBus.execute<unknown, PaymentCommandResult>('payments.payments.reverse', {
      input: { ...(typeof body === 'object' && body !== null ? body : {}), id },
      ctx,
    })
    return Response.json(
      {
        ok: true,
        paymentId: result.entity.id,
        reversesPaymentId: id,
        chargeId: result.charge.id,
        chargeStatus: result.charge.status,
        remaining: result.remaining,
        updatedAt: result.charge.updatedAt.toISOString(),
        actingRole: result.actingRole,
      },
      { status: 201 },
    )
  } catch (error: unknown) {
    return errorResponse(error, 'payments.payments.reverse')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Payments',
  summary: 'Reverse a payment',
  methods: {
    POST: {
      summary: 'Reverse a cash or transfer payment with a reason',
      description:
        "Books a negative entry of the same charge that names the payment and carries the reason, and derives the charge's status again. Once per payment; an online payment is refunded instead. Send the charge's lock token in the platform optimistic-lock header (400 `lock_token_required` without it).",
      requestBody: { contentType: 'application/json', schema: bodySchema },
      responses: [{ status: 201, description: 'The reversing entry and the charge after it', schema: responseSchema }],
      errors: [
        {
          status: 400,
          description: 'Invalid input (a reason is required), `lock_token_required`',
          schema: errorSchema,
        },
        { status: 403, description: 'scope_denied', schema: errorSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
        {
          status: 409,
          description: '`payment_already_reversed`, `payment_not_reversible`, `optimistic_lock_conflict`',
          schema: errorSchema,
        },
      ],
    },
  },
}
