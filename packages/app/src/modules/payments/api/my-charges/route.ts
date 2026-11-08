// `GET /api/payments/my-charges` — the payer's own charges (payments spec API table, REQ-002, REQ-012; M-08; #110):
// the charges they pay and their own or their wards' charges without a payer (listed, `payable: false`), with what
// was paid and what remains, the overdue marker in the club's calendar, and their recent checkouts; since #111 also the
// paid history (up to six) and the transfer instructions with the club's account and the payer code (assigned on first
// read). Behind the R10 gate: a minor with an account gets 403 `payments_minor` even with the feature (TEST-021).
import { z } from 'zod'
import { buildQueryParams } from '@open-mercato/shared/lib/crud/query-params'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import { payerOf } from '../../services/checkout'
import { myCharges, myPaymentHistory } from '../../services/my-charges'
import { transferInstructions } from '../../services/payer-overview'
import { checkoutSummarySchema, errorSchema } from '../shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['payments.view_own'] },
}

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
})

const personSchema = z.object({ firstName: z.string(), lastName: z.string() }).nullable()

const itemSchema = z.object({
  id: z.uuid(),
  description: z.string(),
  personId: z.string().nullable(),
  person: personSchema.describe('The debtor (the participant)'),
  periodLabel: z.string().nullable(),
  dueDate: z.string(),
  amountDue: z.number().int().describe('Grosz'),
  discountAmount: z.number().int().describe('The discount already deducted from `amountDue`'),
  paid: z.number().int(),
  remaining: z.number().int(),
  status: z.string(),
  overdue: z.boolean().describe('`open` or `partially_paid` past the due date — a derived marker'),
  payerMissing: z.boolean().describe('No payer: shown disabled, "no payer — contact the club"'),
  payable: z.boolean().describe('An `open` charge the caller pays: selectable for an online payment'),
})

const responseSchema = z.object({
  items: z.array(itemSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
  totalPages: z.number().int(),
  checkouts: z.array(checkoutSummarySchema).describe("The caller's recent checkouts, newest first"),
  history: z.array(itemSchema).describe("The caller's six most recently due paid charges (#111)"),
  transfer: z
    .object({
      bankAccount: z.string().nullable().describe("The club's account (26 digits); null while the club has none"),
      recipient: z.string().nullable().describe("The club's short name, or its organization name"),
      payerCode: z.string().describe('The permanent payer code `GW-XXXX` for the transfer title'),
    })
    .nullable()
    .describe('Transfer instructions; null for someone who pays no charge (#111)'),
})

export async function GET(request: Request): Promise<Response> {
  try {
    const ctx = await commandContextForRequest(request)
    if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const url = new URL(request.url)
    const { page, pageSize } = querySchema.parse(buildQueryParams(url.searchParams))
    const payer = await payerOf(ctx)
    const [{ items, total, checkouts }, history, transfer] = await Promise.all([
      myCharges(ctx.container, payer, { page, pageSize }),
      myPaymentHistory(ctx.container, payer),
      transferInstructions(ctx.container, payer),
    ])
    return Response.json({
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      checkouts,
      history,
      transfer,
    })
  } catch (error: unknown) {
    return errorResponse(error, 'payments.my_charges')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Payments',
  summary: 'My charges',
  methods: {
    GET: {
      summary: "List the caller's own charges",
      description:
        'The charges the caller pays, and their own or their wards’ charges without a payer (not payable online), by due date, with the recent checkouts, the paid history and the transfer instructions with the payer code. A minor gets 403 `payments_minor` (R10).',
      query: querySchema,
      responses: [{ status: 200, description: 'The charges', schema: responseSchema }],
      errors: [
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 403, description: '`payments_minor`, `scope_unlinked`, `scope_denied`', schema: errorSchema },
      ],
    },
  },
}
