// Shared pieces of the cash handover routes: the handover row schema and the decisions on a pending handover (payments spec API rows `payments.cash_handovers.confirm|reject|withdraw`;
// REQ-033a, DD-31a, TEST-089; D-042, #791): one `POST` handler per decision, so the three routes share their body
// handling and their response. The command checks the caller's reach (the treasurer or the administrator for a
// confirmation or a rejection, the collector for a withdrawal) and the state (409 `cash_handover_not_pending`).
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import type { CashHandoverDecisionResult } from '../commands/cash-handovers'
import { CASH_HANDOVER_STATUSES } from '../lib/cash-handovers'

const personSchema = z.object({ firstName: z.string(), lastName: z.string() }).nullable()

/** A handover as the history, the confirmers' queue and the collector's page list it. */
export const handoverRowSchema = z.object({
  id: z.uuid(),
  number: z.string().describe('`RG/YYYY/MM/NNN`'),
  status: z.enum(CASH_HANDOVER_STATUSES),
  collectorPersonId: z.uuid(),
  collector: personSchema,
  receivedBy: personSchema,
  decidedBy: personSchema.describe('Who confirmed, rejected or withdrew it'),
  sentByCollector: z.boolean().describe('False for cash the club settled without the collector'),
  amount: z.number().int().describe('Grosz'),
  paymentCount: z.number().int(),
  receiptNumbers: z.array(z.string()).describe('The `KP` receipts of the handover'),
  payments: z.array(
    z.object({ paymentId: z.uuid(), receiptNumber: z.string(), amount: z.number().int(), payer: personSchema }),
  ),
  rejectionReason: z.string().nullable(),
  sentAt: z.string().nullable(),
  decidedAt: z.string().nullable(),
  createdAt: z.string(),
})

export const decisionResponseSchema = z.object({
  ok: z.literal(true),
  id: z.uuid(),
  number: z.string().describe('`RG/YYYY/MM/NNN`'),
  status: z.enum(CASH_HANDOVER_STATUSES),
  amount: z.number().int().describe('Grosz'),
  paymentIds: z.array(z.uuid()),
  actingRole: z.string(),
})

/** The `POST` handler of one decision: the route's `{ id }` and the JSON body go to `commandId`. */
export function decisionHandler(commandId: string) {
  return async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
    try {
      const { id } = z.object({ id: z.uuid() }).parse(await context.params)
      const ctx = await commandContextForRequest(request)
      if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
      const body: unknown = await request.json().catch(() => ({}))
      const { result } = await ctx.container
        .resolve<CommandBus>('commandBus')
        .execute<unknown, CashHandoverDecisionResult>(commandId, {
          input: { ...(typeof body === 'object' && body !== null ? body : {}), id },
          ctx,
        })
      return Response.json({
        ok: true,
        id: result.entity.id,
        number: result.number,
        status: result.status,
        amount: result.amount,
        paymentIds: result.paymentIds,
        actingRole: result.actingRole,
      })
    } catch (error: unknown) {
      return errorResponse(error, commandId)
    }
  }
}
