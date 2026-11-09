// `POST /api/payments/group-charges/cash` — the coach's "Accept cash" on M-18 (payments spec API row
// `payments.cash.record` → "or `payments.groups.collect` only for charges of children within the coach's scope"; DD-31,
// DD-32; REQ-033, TEST-045; issue #117 E07-S10): `payments.cash.collect` takes cash for several charges of one child of
// the caller's group at once — one `KP/YYYY/MM/NNN` receipt, paid oldest first, an e-mail to each payer. A dedicated
// route keeps the administrator's `/api/payments/cash` (`payments.cash.record`, any payer) apart from the coach's
// feature.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import type { GroupCashResult } from '../../../commands/group-charges'
import { groupCashSchema } from '../../../data/validators'
import { errorSchema } from '../../shared'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['payments.groups.collect'] },
}

const responseSchema = z.object({
  ok: z.literal(true),
  receiptNumber: z.string().describe('`KP/YYYY/MM/NNN`'),
  amount: z.number().int().describe('Grosz'),
  paidOn: z.string(),
  notified: z.number().int().describe('Confirmation e-mails queued (one per payer with an address)'),
  payments: z.array(
    z.object({
      paymentId: z.uuid(),
      chargeId: z.uuid(),
      amount: z.number().int(),
      chargeStatus: z.string().describe('`partially_paid` or `paid`'),
      remaining: z.number().int(),
      chargeUpdatedAt: z.string(),
    }),
  ),
  actingRole: z.string(),
})

export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await commandContextForRequest(request)
    if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const body: unknown = await request.json().catch(() => ({}))
    const { result } = await ctx.container
      .resolve<CommandBus>('commandBus')
      .execute<unknown, GroupCashResult>('payments.cash.collect', {
        input: typeof body === 'object' && body !== null ? body : {},
        ctx,
      })
    return Response.json(
      {
        ok: true,
        receiptNumber: result.receiptNumber,
        amount: result.amount,
        paidOn: result.paidOn,
        notified: result.dispatchIds.length,
        payments: result.payments,
        actingRole: result.actingRole,
      },
      { status: 201 },
    )
  } catch (error: unknown) {
    return errorResponse(error, 'payments.cash.collect')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Payments',
  summary: "Accept cash for my group's charges",
  methods: {
    POST: {
      summary: "Accept cash for several of a child's charges of my group",
      description:
        'Issues one `KP/YYYY/MM/NNN` receipt, spreads the amount over the selected charges oldest first and queues an e-mail confirmation to each payer unless `notify` is false. The cash is held by the collector until the handover to the treasurer.',
      requestBody: { contentType: 'application/json', schema: groupCashSchema },
      responses: [{ status: 201, description: 'The receipt and the payments', schema: responseSchema }],
      errors: [
        { status: 400, description: 'Invalid input', schema: errorSchema },
        {
          status: 403,
          description:
            '`scope_denied` (a group outside my grants), `charge_out_of_scope` (a child or charge outside the group), `coach_fee_cash_disabled` (a membership fee while the club lets coaches only view fees)',
          schema: errorSchema,
        },
        { status: 404, description: 'Group not found', schema: errorSchema },
        { status: 409, description: '`charge_not_payable`, `charge_already_paid`', schema: errorSchema },
        {
          status: 422,
          description:
            '`cash_exceeds_selected` (`selectedAmount` in grosz), `payment_date_in_future`, `charge_payer_missing` (a matter for the treasurer)',
          schema: errorSchema,
        },
      ],
    },
  },
}
