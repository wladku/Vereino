// `GET /api/payments/cash/charges?payerPersonId=` (payments spec API table; REQ-031; M-15, B-21; issue #114): the
// payer's charges the caller may accept cash for — every charge of the payer still to pay — oldest first, with what
// remains of each and the overdue marker in the club's calendar. The coach's narrower scope (DD-32) is E07-S10 (#117).
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import {
  assertInScope,
  commandContextForRequest,
  errorResponse,
  scopeContract,
  trustedScopeOf,
} from '@/modules/foundation'
import { cashChargesQuerySchema } from '../../../data/validators'
import { amountDueOf, isOverdue, remainingOf } from '../../../lib/charge-ledger'
import { openPayableCharges } from '../../../services/cash'
import { clubClock, findPersons } from '../../../services/directory'
import { paidTotals } from '../../../services/ledger'
import { PAYMENTS_READ_KINDS, errorSchema } from '../../shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['payments.cash.record'] },
}

const itemSchema = z.object({
  id: z.uuid(),
  sourceType: z.string(),
  description: z.string(),
  personId: z.string().nullable(),
  person: z.object({ firstName: z.string(), lastName: z.string() }).nullable(),
  periodLabel: z.string().nullable(),
  dueDate: z.string(),
  status: z.string(),
  amountDue: z.number().int(),
  paid: z.number().int(),
  remaining: z.number().int().describe('Grosz still to pay'),
  overdue: z.boolean(),
  updatedAt: z.string(),
})

const responseSchema = z.object({ items: z.array(itemSchema), total: z.number().int() })

function calendarDate(value: unknown): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10)
}

export async function GET(request: Request): Promise<Response> {
  try {
    const ctx = await commandContextForRequest(request)
    const scope = ctx ? trustedScopeOf(ctx) : null
    if (!ctx || !scope) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const { payerPersonId } = cashChargesQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams))
    await assertInScope(await scopeContract.resolve(ctx), PAYMENTS_READ_KINDS, {
      id: scope.organizationId,
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
    })
    const charges = await openPayableCharges(ctx.container, scope, payerPersonId)
    const [paid, persons, clock] = await Promise.all([
      paidTotals(
        ctx.container,
        scope,
        charges.map((charge) => charge.id),
      ),
      findPersons(
        ctx.container,
        scope,
        charges.flatMap((charge) => (charge.personId ? [charge.personId] : [])),
      ),
      clubClock(ctx.container, scope),
    ])
    const items = charges
      .map((charge) => {
        const amountDue = amountDueOf(charge)
        const chargePaid = paid.get(charge.id) ?? 0
        const dueDate = calendarDate(charge.dueDate)
        const person = charge.personId ? persons.get(charge.personId) : undefined
        return {
          id: charge.id,
          sourceType: charge.sourceType,
          description: charge.description,
          personId: charge.personId ?? null,
          person: person ? { firstName: person.firstName, lastName: person.lastName } : null,
          periodLabel: charge.periodLabel ?? null,
          dueDate,
          status: charge.status,
          amountDue,
          paid: chargePaid,
          remaining: remainingOf(amountDue, chargePaid),
          overdue: isOverdue({ status: charge.status, dueDate }, clock.today),
          updatedAt: charge.updatedAt.toISOString(),
        }
      })
      .filter((item) => item.remaining > 0)
    return Response.json({ items, total: items.reduce((sum, item) => sum + item.remaining, 0) })
  } catch (error: unknown) {
    return errorResponse(error, 'payments.cash.charges')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Payments',
  summary: 'Charges to accept cash for',
  methods: {
    GET: {
      summary: "The payer's charges still to pay",
      description:
        "The payer's `open` and `partially_paid` charges with something left to pay, oldest first, with what remains and the overdue marker; `total` is what remains on all of them.",
      query: cashChargesQuerySchema,
      responses: [{ status: 200, description: 'The charges', schema: responseSchema }],
      errors: [
        { status: 400, description: 'Invalid input', schema: errorSchema },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 403, description: 'scope_denied', schema: errorSchema },
      ],
    },
  },
}
