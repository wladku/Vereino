// `POST /api/payments/charges/{id}/payments` — `payments.payments.record` (payments spec API table, REQ-012, TEST-020;
// B-22 "Record payment"; issue #109): a cash or transfer payment of the charge by the club administrator. Send the
// charge's lock token (`updatedAt`) in the platform optimistic-lock header. The answer carries the charge's new status
// and what remains, for the "Charge paid" / "Recorded — charge partially paid" toast.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import type { PaymentCommandResult } from '../../../../commands/ledger'
import { paymentRecordSchema } from '../../../../data/validators'
import { errorSchema } from '../../../shared'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['payments.manage'] },
}

const paramsSchema = z.object({ id: z.uuid() })

const bodySchema = paymentRecordSchema.omit({ id: true })

const responseSchema = z.object({
  ok: z.literal(true),
  paymentId: z.uuid(),
  chargeId: z.uuid(),
  chargeStatus: z.string().describe('`partially_paid` or `paid`'),
  remaining: z.number().int().describe('Grosz still to pay'),
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
    const { result } = await commandBus.execute<unknown, PaymentCommandResult>('payments.payments.record', {
      input: { ...(typeof body === 'object' && body !== null ? body : {}), id },
      ctx,
    })
    return Response.json(
      {
        ok: true,
        paymentId: result.entity.id,
        chargeId: result.charge.id,
        chargeStatus: result.charge.status,
        remaining: result.remaining,
        updatedAt: result.charge.updatedAt.toISOString(),
        actingRole: result.actingRole,
      },
      { status: 201 },
    )
  } catch (error: unknown) {
    return errorResponse(error, 'payments.payments.record')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Payments',
  summary: 'Record a payment',
  methods: {
    POST: {
      summary: 'Record a cash or transfer payment of a charge',
      description:
        "Adds a payment of at most what remains, dated today or earlier, and derives the charge's status (`partially_paid`, `paid`). Send the charge's lock token in the platform optimistic-lock header (400 `lock_token_required` without it).",
      requestBody: { contentType: 'application/json', schema: bodySchema },
      responses: [{ status: 201, description: 'The payment and the charge after it', schema: responseSchema }],
      errors: [
        { status: 400, description: 'Invalid input, `lock_token_required`', schema: errorSchema },
        { status: 403, description: 'scope_denied', schema: errorSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
        {
          status: 409,
          description: '`charge_not_payable` (cancelled or forfeited), `optimistic_lock_conflict`',
          schema: errorSchema,
        },
        {
          status: 422,
          description:
            '`payment_exceeds_remaining` ("The amount exceeds the remaining 50 zł"; `remainingAmount` in grosz), `payment_date_in_future`',
          schema: errorSchema,
        },
      ],
    },
  },
}
