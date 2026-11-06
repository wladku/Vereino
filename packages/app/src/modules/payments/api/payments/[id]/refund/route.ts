// `POST /api/payments/payments/{id}/refund` — `payments.payments.refund` (payments spec API table, DD-42, Q-050;
// TEST-057; #110): the club administrator refunds an online payment, in full or in part, through the gateway. Send
// the charge's lock token (`updatedAt`) in the platform optimistic-lock header and a fresh `operationId`; a retry
// with the same `operationId` returns the same refund. No refund screen yet (the issue's scope; API only).
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import type { RefundCommandResult } from '../../../../commands/checkout'
import { paymentRefundSchema } from '../../../../data/validators'
import { errorSchema } from '../../../shared'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['payments.manage'] },
}

const paramsSchema = z.object({ id: z.uuid() })

const bodySchema = paymentRefundSchema.omit({ id: true })

const responseSchema = z.object({
  ok: z.literal(true),
  paymentId: z.uuid().describe('The reversing entry'),
  gatewayRefundId: z.string().nullable(),
  refunded: z.number().int().describe('Grosz'),
  chargeId: z.uuid(),
  chargeStatus: z.string(),
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
    const { result } = await commandBus.execute<unknown, RefundCommandResult>('payments.payments.refund', {
      input: { ...(typeof body === 'object' && body !== null ? body : {}), id },
      ctx,
    })
    return Response.json(
      {
        ok: true,
        paymentId: result.entity.id,
        gatewayRefundId: result.entity.gatewayRefundId ?? null,
        refunded: result.refunded,
        chargeId: result.charge.id,
        chargeStatus: result.charge.status,
        updatedAt: result.charge.updatedAt.toISOString(),
        actingRole: result.actingRole,
      },
      { status: 201 },
    )
  } catch (error: unknown) {
    return errorResponse(error, 'payments.payments.refund')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Payments',
  summary: 'Refund an online payment',
  methods: {
    POST: {
      summary: 'Refund an online payment through the gateway',
      description:
        "Refunds the amount (or all of what is not refunded yet) and books a reversing entry with the provider refund id; the charge's status is derived again. Send the charge's lock token in the platform optimistic-lock header. A retry with the same `operationId` returns the same refund.",
      requestBody: { contentType: 'application/json', schema: bodySchema },
      responses: [{ status: 201, description: 'The reversing entry', schema: responseSchema }],
      errors: [
        { status: 400, description: 'Invalid input, `lock_token_required`', schema: errorSchema },
        { status: 403, description: 'scope_denied', schema: errorSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
        {
          status: 409,
          description:
            '`payment_not_refundable` (not an online payment, or a reversing entry), `optimistic_lock_conflict`',
          schema: errorSchema,
        },
        {
          status: 422,
          description: '`refund_exceeds_remaining` (`refundableAmount` in grosz)',
          schema: errorSchema,
        },
        { status: 502, description: '`gateway_unavailable` (nothing booked)', schema: errorSchema },
      ],
    },
  },
}
