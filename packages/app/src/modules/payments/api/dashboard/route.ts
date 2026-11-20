// `GET /api/payments/dashboard` — the B-01 payment widgets (README B-01; payments spec REQ-011, issue #111 E07-S04;
// payments parity spec REQ-C09, phase 7, issue #297 E12-S07): "Overdue" (remaining total, charges, families and
// charges without a payer), "Charges without a payer" (the count, the first five and how many more), "Bank statements
// and cash" (transfers to decide with `payments.bank.import`, charges to refund) and "Order campaigns" (each running
// campaign with its progress, with `payments.orders.manage`). `?only=counts` answers spec N's menu counts alone: the
// transfers to decide and the running campaigns, each only with its feature. The club administrator's and the
// treasurer's view, like the charge list (`payments.view` and the `club_admin` or `treasurer` grant, #245).
import { z } from 'zod'
import type { RbacService } from '@open-mercato/core/modules/auth/services/rbacService'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import {
  assertInScope,
  commandContextForRequest,
  errorResponse,
  scopeContract,
  trustedScopeOf,
} from '@/modules/foundation'
import { CAMPAIGN_STATUSES } from '../../lib/order-campaigns'
import { DASHBOARD_ONLY } from '../../lib/dashboard'
import { paymentsDashboard, paymentsDashboardCounts } from '../../services/dashboard'
import { PAYMENTS_READ_KINDS, errorSchema } from '../shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['payments.view'] },
}

const querySchema = z.object({ only: z.enum(DASHBOARD_ONLY).optional() })

const bankSchema = z
  .object({ toDecide: z.number().int().describe('Statement transfers "To confirm" or "Unmatched"') })
  .describe('With `payments.bank.import` only')

const campaignsRunningSchema = z
  .number()
  .int()
  .describe('Running order campaigns (neither draft nor completed); with `payments.orders.manage` only')

const responseSchema = z.object({
  overdue: z.object({
    total: z.number().int().describe('Grosz remaining on overdue charges'),
    charges: z.number().int(),
    families: z.number().int().describe('Distinct payers of the overdue charges'),
    withoutPayer: z.number().int().describe('Overdue charges without a payer'),
  }),
  withoutPayer: z.object({
    charges: z.number().int().describe('Open charges without a payer'),
    items: z
      .array(
        z.object({
          id: z.uuid(),
          description: z.string(),
          period: z.string().nullable(),
          person: z.object({ firstName: z.string(), lastName: z.string() }).nullable().describe('Whom it is for'),
        }),
      )
      .describe('The first five, the one due first on top'),
    more: z.number().int().describe('Charges without a payer not listed'),
  }),
  toRefund: z.object({ count: z.number().int().describe('Charges holding an online overpayment to refund') }),
  bank: bankSchema.optional(),
  campaigns: z
    .array(
      z.object({
        id: z.uuid(),
        name: z.string(),
        status: z.enum(CAMPAIGN_STATUSES),
        orders: z.number().int(),
        children: z.number().int().describe('Children of the campaign groups today'),
        paid: z.number().int().describe('Grosz paid on the orders'),
        value: z.number().int().describe('Grosz due on the orders'),
      }),
    )
    .optional()
    .describe('Running campaigns, the one closing first on top; with `payments.orders.manage` only'),
  campaignsRunning: campaignsRunningSchema.optional(),
})

const countsSchema = z.object({ bank: bankSchema.optional(), campaignsRunning: campaignsRunningSchema.optional() })

export async function GET(request: Request): Promise<Response> {
  try {
    const ctx = await commandContextForRequest(request)
    const scope = ctx ? trustedScopeOf(ctx) : null
    if (!ctx || !scope) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
    if (!parsed.success) return Response.json({ error: 'Invalid query', code: 'query_invalid' }, { status: 400 })
    await assertInScope(await scopeContract.resolve(ctx), PAYMENTS_READ_KINDS, {
      id: scope.organizationId,
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
    })
    const userId = ctx.auth?.sub
    const rbac = ctx.container.resolve<RbacService>('rbacService')
    const can = async (feature: string) => !!userId && (await rbac.userHasAllFeatures(userId, [feature], scope))
    const [bank, campaigns] = await Promise.all([can('payments.bank.import'), can('payments.orders.manage')])
    const read = parsed.data.only === 'counts' ? paymentsDashboardCounts : paymentsDashboard
    return Response.json(await read(ctx.container, scope, { bank, campaigns }))
  } catch (error: unknown) {
    return errorResponse(error, 'payments.dashboard')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Payments',
  summary: 'Payments dashboard',
  methods: {
    GET: {
      summary: 'Read the payment widgets of the dashboard',
      description:
        'The B-01 widgets: overdue charges (remaining total, charges, families, without a payer), open charges ' +
        'without a payer (count, the first five, how many more), charges to refund, statement transfers to decide ' +
        '(with `payments.bank.import`) and running order campaigns with their progress (with ' +
        '`payments.orders.manage`). With `only=counts` the response holds only `bank` and `campaignsRunning`, each ' +
        'under its own feature: two indexed counts for the menu badges.',
      query: querySchema,
      responses: [
        {
          status: 200,
          description: 'The widgets; with `only=counts` the menu counts alone',
          schema: z.union([responseSchema, countsSchema]),
        },
      ],
      errors: [
        { status: 400, description: 'Invalid query (unknown `only`)', schema: errorSchema },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 403, description: '`scope_denied`', schema: errorSchema },
      ],
    },
  },
}
