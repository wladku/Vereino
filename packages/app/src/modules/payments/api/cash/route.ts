// `/api/payments/cash` — "Accept cash" (payments spec API table → `payments.cash.record`; REQ-031, TEST-043; M-15,
// B-21; issue #114):
// - `POST` accepts cash for selected charges of one payer: one `KP/YYYY/MM/NNN` receipt, the amount paid oldest first,
//   an e-mail confirmation to the payer unless `notify` is false;
// - `GET` is "Received by me today": the receipts the caller issued today in the club's calendar, with the total to hand
//   over to the treasurer (reversed payments count for nothing).
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
import type { CashRecordResult } from '../../commands/cash'
import { cashRecordSchema } from '../../data/validators'
import { receiptSummaries } from '../../lib/cash'
import { cashAcceptedBy, chargePayers } from '../../services/cash'
import { clubClock, findPersons } from '../../services/directory'
import { PAYMENTS_READ_KINDS, errorSchema } from '../shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['payments.cash.record'] },
  POST: { requireAuth: true, requireFeatures: ['payments.cash.record'] },
}

const personSchema = z.object({ firstName: z.string(), lastName: z.string() }).nullable()

const recordResponseSchema = z.object({
  ok: z.literal(true),
  receiptNumber: z.string().describe('`KP/YYYY/MM/NNN`'),
  amount: z.number().int().describe('Grosz'),
  paidOn: z.string(),
  notified: z.boolean().describe('A confirmation e-mail was queued for the payer'),
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

const todayResponseSchema = z.object({
  date: z.string().describe("Today in the club's calendar"),
  items: z.array(
    z.object({
      receiptNumber: z.string(),
      payerPersonId: z.string().nullable(),
      payer: personSchema,
      amount: z.number().int().describe('Grosz; reversed payments excluded'),
      chargeCount: z.number().int(),
      reversed: z.boolean(),
      createdAt: z.string(),
    }),
  ),
  total: z.number().int().describe('Grosz to hand over to the treasurer'),
})

export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await commandContextForRequest(request)
    if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const body: unknown = await request.json().catch(() => ({}))
    const commandBus = ctx.container.resolve<CommandBus>('commandBus')
    const { result } = await commandBus.execute<unknown, CashRecordResult>('payments.cash.record', {
      input: typeof body === 'object' && body !== null ? body : {},
      ctx,
    })
    return Response.json(
      {
        ok: true,
        receiptNumber: result.receiptNumber,
        amount: result.amount,
        paidOn: result.paidOn,
        notified: result.dispatchId !== null,
        payments: result.payments,
        actingRole: result.actingRole,
      },
      { status: 201 },
    )
  } catch (error: unknown) {
    return errorResponse(error, 'payments.cash.record')
  }
}

export async function GET(request: Request): Promise<Response> {
  try {
    const ctx = await commandContextForRequest(request)
    const scope = ctx ? trustedScopeOf(ctx) : null
    const userId = ctx?.auth?.sub
    if (!ctx || !scope || !userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    await assertInScope(await scopeContract.resolve(ctx), PAYMENTS_READ_KINDS, {
      id: scope.organizationId,
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
    })
    const { today } = await clubClock(ctx.container, scope)
    const { payments, reversed } = await cashAcceptedBy(ctx.container, scope, userId, today)
    const payerOf = await chargePayers(
      ctx.container,
      scope,
      payments.map((row) => row.chargeId),
    )
    const summary = receiptSummaries(
      payments.map((row) => ({
        id: row.id,
        receiptNumber: row.receiptNumber as string,
        chargeId: row.chargeId,
        amount: row.amount,
        createdAt: row.createdAt.toISOString(),
      })),
      reversed,
      payerOf,
    )
    const persons = await findPersons(
      ctx.container,
      scope,
      summary.items.flatMap((item) => (item.payerPersonId ? [item.payerPersonId] : [])),
    )
    return Response.json({
      date: today,
      items: summary.items.map((item) => {
        const payer = item.payerPersonId ? persons.get(item.payerPersonId) : undefined
        return { ...item, payer: payer ? { firstName: payer.firstName, lastName: payer.lastName } : null }
      }),
      total: summary.total,
    })
  } catch (error: unknown) {
    return errorResponse(error, 'payments.cash.today')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Payments',
  summary: 'Accept cash',
  methods: {
    GET: {
      summary: 'Cash received by me today',
      description:
        "The receipts the caller issued today in the club's calendar, oldest first, and the total to hand over to the treasurer; reversed payments count for nothing.",
      responses: [{ status: 200, description: 'The receipts and the total', schema: todayResponseSchema }],
      errors: [
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 403, description: 'scope_denied', schema: errorSchema },
      ],
    },
    POST: {
      summary: 'Accept cash for selected charges of one payer',
      description:
        'Issues one `KP/YYYY/MM/NNN` receipt, spreads the amount over the selected charges oldest first (a lower amount leaves the newest partially paid) and queues an e-mail confirmation to the payer unless `notify` is false.',
      requestBody: { contentType: 'application/json', schema: cashRecordSchema },
      responses: [{ status: 201, description: 'The receipt and the payments', schema: recordResponseSchema }],
      errors: [
        { status: 400, description: 'Invalid input', schema: errorSchema },
        { status: 403, description: 'scope_denied', schema: errorSchema },
        {
          status: 409,
          description: '`charge_not_payable` (cancelled or forfeited), `charge_already_paid`',
          schema: errorSchema,
        },
        {
          status: 422,
          description:
            '`cash_exceeds_selected` ("The amount exceeds the selected charges, 235 zł"; `selectedAmount` in grosz), `payment_date_in_future`, `cash_charges_invalid` (a charge unknown in the club or of another payer)',
          schema: errorSchema,
        },
      ],
    },
  },
}
