// `GET /api/payments/cash/payers?search=` (issue #114, the owner's default of 2026-11-07: the payer select of
// "Accept cash", M-15 and B-21): the payers with charges still to pay, each with the wards the charges are for and the
// total due, sorted by surname; `search` (three letters or more) matches the payer's or a ward's name through the
// people directory's name tokens.
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import {
  assertInScope,
  commandContextForRequest,
  errorResponse,
  scopeContract,
  trustedScopeOf,
} from '@/modules/foundation'
import { cashPayersQuerySchema } from '../../../data/validators'
import { payerSummaries } from '../../../lib/cash'
import { amountDueOf, remainingOf } from '../../../lib/charge-ledger'
import { openPayableCharges } from '../../../services/cash'
import { findPersons, searchPersonIds } from '../../../services/directory'
import { paidTotals } from '../../../services/ledger'
import { PAYMENTS_READ_KINDS, errorSchema } from '../../shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['payments.cash.record'] },
}

const nameSchema = z.object({ personId: z.uuid(), firstName: z.string(), lastName: z.string() })

const responseSchema = z.object({
  items: z.array(
    z.object({
      payerPersonId: z.uuid(),
      firstName: z.string(),
      lastName: z.string(),
      wards: z.array(nameSchema),
      totalDue: z.number().int().describe('Grosz still to pay on all of their charges'),
      chargeCount: z.number().int(),
    }),
  ),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
  totalPages: z.number().int(),
})

export async function GET(request: Request): Promise<Response> {
  try {
    const ctx = await commandContextForRequest(request)
    const scope = ctx ? trustedScopeOf(ctx) : null
    if (!ctx || !scope) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const query = cashPayersQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams))
    await assertInScope(await scopeContract.resolve(ctx), PAYMENTS_READ_KINDS, {
      id: scope.organizationId,
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
    })
    const charges = await openPayableCharges(ctx.container, scope)
    const paid = await paidTotals(
      ctx.container,
      scope,
      charges.map((charge) => charge.id),
    )
    const summaries = payerSummaries(
      charges.map((charge) => ({
        payerPersonId: charge.payerPersonId as string,
        personId: charge.personId ?? null,
        remaining: remainingOf(amountDueOf(charge), paid.get(charge.id) ?? 0),
      })),
    )
    const matching = query.search ? await searchPersonIds(ctx.container, scope, query.search) : null
    const filtered = matching
      ? summaries.filter(
          (summary) => matching.has(summary.payerPersonId) || summary.wardIds.some((id) => matching.has(id)),
        )
      : summaries
    const persons = await findPersons(
      ctx.container,
      scope,
      filtered.flatMap((summary) => [summary.payerPersonId, ...summary.wardIds]),
    )
    const named = filtered
      .flatMap((summary) => {
        const payer = persons.get(summary.payerPersonId)
        if (!payer) return []
        return [
          {
            payerPersonId: summary.payerPersonId,
            firstName: payer.firstName,
            lastName: payer.lastName,
            wards: summary.wardIds.flatMap((personId) => {
              const ward = persons.get(personId)
              return ward ? [{ personId, firstName: ward.firstName, lastName: ward.lastName }] : []
            }),
            totalDue: summary.totalDue,
            chargeCount: summary.chargeCount,
          },
        ]
      })
      .sort(
        (a, b) =>
          a.lastName.localeCompare(b.lastName, 'pl') ||
          a.firstName.localeCompare(b.firstName, 'pl') ||
          a.payerPersonId.localeCompare(b.payerPersonId),
      )
    const start = (query.page - 1) * query.pageSize
    return Response.json({
      items: named.slice(start, start + query.pageSize),
      total: named.length,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.max(1, Math.ceil(named.length / query.pageSize)),
    })
  } catch (error: unknown) {
    return errorResponse(error, 'payments.cash.payers')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Payments',
  summary: 'Payers to accept cash from',
  methods: {
    GET: {
      summary: 'Payers with charges still to pay',
      description:
        "Each payer with the wards their charges are for and the total due, sorted by surname. `search` (three letters or more) matches the payer's or a ward's name; a shorter term filters nothing.",
      query: cashPayersQuerySchema,
      responses: [{ status: 200, description: 'The payers', schema: responseSchema }],
      errors: [
        { status: 400, description: 'Invalid input', schema: errorSchema },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 403, description: 'scope_denied', schema: errorSchema },
      ],
    },
  },
}
