// `GET /api/payments/charges/{id}` — one charge with its payments (payments spec API table, REQ-011, REQ-012; B-22;
// issue #109): the B-21 fields with the debtor's and payer's names, what was paid, what remains, the overdue marker
// in the club's calendar, and every payment — date, method, title or receipt, who received it, amount, and whether
// it was reversed. `updatedAt` is the lock token the payment, cancellation and reversal commands expect.
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import {
  assertInScope,
  commandContextForRequest,
  errorResponse,
  scopeContract,
  trustedScopeOf,
} from '@/modules/foundation'
import { amountDueOf, isOverdue, paidTotal, remainingOf } from '../../../lib/charge-ledger'
import { clubClock, findPersons } from '../../../services/directory'
import { chargePayments, findCharge } from '../../../services/ledger'
import { discountRuleNames } from '../../../services/read'
import { PAYMENTS_READ_KINDS, chargeListItemSchema, errorSchema } from '../../shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['payments.view'] },
}

const paramsSchema = z.object({ id: z.uuid() })

const personSchema = z.object({ firstName: z.string(), lastName: z.string() }).nullable()

const paymentSchema = z.object({
  id: z.uuid(),
  amount: z.number().int().describe('Grosz; negative for a reversing entry'),
  method: z.string(),
  paidOn: z.string(),
  reference: z.string().nullable().describe('Transfer title or receipt; the reason of a reversing entry'),
  receivedBy: personSchema,
  reversesPaymentId: z.string().nullable(),
  reversed: z.boolean().describe('A reversing entry names this payment'),
  createdAt: z.string(),
})

const detailSchema = chargeListItemSchema.extend({
  paid: z.number().int(),
  remaining: z.number().int(),
  overdue: z.boolean(),
  payments: z.array(paymentSchema),
})

function calendarDate(value: unknown): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10)
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = paramsSchema.parse(await context.params)
    const ctx = await commandContextForRequest(request)
    const scope = ctx ? trustedScopeOf(ctx) : null
    if (!ctx || !scope) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const charge = await findCharge(ctx.container, scope, id)
    if (!charge) return Response.json({ error: 'Not found' }, { status: 404 })
    await assertInScope(await scopeContract.resolve(ctx), PAYMENTS_READ_KINDS, {
      id: charge.id,
      tenantId: charge.tenantId,
      organizationId: charge.organizationId,
    })
    const payments = await chargePayments(ctx.container, scope, charge.id)
    const personIds = [charge.personId, charge.payerPersonId, ...payments.map((row) => row.recordedByPersonId)].filter(
      (value): value is string => !!value,
    )
    const [persons, ruleNames, clock] = await Promise.all([
      findPersons(ctx.container, scope, personIds),
      discountRuleNames(ctx.container, scope, charge.discountRuleId ? [charge.discountRuleId] : []),
      clubClock(ctx.container, scope),
    ])
    const nameOf = (personId: string | null | undefined) => {
      const person = personId ? persons.get(personId) : undefined
      return person ? { firstName: person.firstName, lastName: person.lastName } : null
    }
    const reversed = new Set(payments.flatMap((row) => (row.reversesPaymentId ? [row.reversesPaymentId] : [])))
    const amountDue = amountDueOf(charge)
    const paid = paidTotal(payments)
    const dueDate = calendarDate(charge.dueDate)
    return Response.json({
      id: charge.id,
      sourceType: charge.sourceType,
      sourceId: charge.sourceId ?? null,
      personId: charge.personId ?? null,
      person: nameOf(charge.personId),
      payerPersonId: charge.payerPersonId ?? null,
      payer: nameOf(charge.payerPersonId),
      payerMissing: charge.payerMissing,
      periodLabel: charge.periodLabel ?? null,
      description: charge.description,
      amount: charge.amount,
      discountAmount: charge.discountAmount,
      amountDue,
      discountRuleId: charge.discountRuleId ?? null,
      discountRuleName: charge.discountRuleId ? (ruleNames.get(charge.discountRuleId) ?? null) : null,
      dueDate,
      payee: charge.payee,
      status: charge.status,
      generationId: charge.generationId ?? null,
      cancelReason: charge.cancelReason ?? null,
      paid,
      remaining: charge.status === 'cancelled' ? 0 : remainingOf(amountDue, paid),
      overdue: isOverdue({ status: charge.status, dueDate }, clock.today),
      createdAt: charge.createdAt.toISOString(),
      updatedAt: charge.updatedAt.toISOString(),
      payments: payments.map((row) => ({
        id: row.id,
        amount: row.amount,
        method: row.method,
        paidOn: calendarDate(row.paidOn),
        reference: row.reference ?? null,
        receivedBy: nameOf(row.recordedByPersonId),
        reversesPaymentId: row.reversesPaymentId ?? null,
        reversed: reversed.has(row.id),
        createdAt: row.createdAt.toISOString(),
      })),
    })
  } catch (error: unknown) {
    return errorResponse(error, 'payments.charges.detail')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Payments',
  summary: 'Charge detail',
  methods: {
    GET: {
      summary: 'Read one charge with its payments',
      description:
        'The charge with the debtor and payer names, what was paid (reversing entries included), what remains, the overdue marker and its payments, oldest first. `updatedAt` is the lock token of the payment, cancellation and reversal commands.',
      responses: [{ status: 200, description: 'The charge', schema: detailSchema }],
      errors: [
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 403, description: 'scope_denied', schema: errorSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
      ],
    },
  },
}
