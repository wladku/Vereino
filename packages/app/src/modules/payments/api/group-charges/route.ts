// `GET /api/payments/group-charges?groupId=&due=` — "My groups' payments" (payments spec API row
// `/api/payments/group-charges`; DD-31, DD-32; REQ-033, TEST-045; issue #117 E07-S10; UX concept M-18): the caller's
// groups with the number of people to pay (the chips), the selected group's card (total due, people overdue), its
// children with their group fees and kit orders — amount due, due date, status, never the discount or its reason —
// its campaigns with the Messenger text, and "Cash with you" (the receipts the caller collected and still holds).
// `due=1` keeps the children with something to pay. A coach sees the groups they lead, a coordinator the groups of
// their sections, the club administrator every group; anyone else gets no groups.
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse, scopeContract, trustedScopeOf } from '@/modules/foundation'
import { selfPersonId } from '../../commands/cash'
import { groupChargesQuerySchema } from '../../data/validators'
import { cashHeldBy, groupChargesView } from '../../services/group-charges'
import { campaignShareText } from '../order-campaign-routes'
import { errorSchema } from '../shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['payments.groups.view'] },
}

const personSchema = z.object({ firstName: z.string(), lastName: z.string() })
const totalsSchema = {
  totalDue: z.number().int().describe('Grosz still to pay'),
  peopleToPay: z.number().int(),
  peopleOverdue: z.number().int(),
}

const chargeSchema = z.object({
  id: z.uuid(),
  kind: z.enum(['fee', 'order']),
  description: z.string(),
  periodLabel: z.string().nullable(),
  amountDue: z.number().int().describe('Grosz after the discount (the discount itself is not shown)'),
  paid: z.number().int(),
  remaining: z.number().int(),
  dueDate: z.string(),
  status: z.string(),
  overdue: z.boolean(),
  collectible: z.boolean().describe('"Accept cash" may select it (club setting, payer, something due)'),
  createdAt: z.string(),
  payerPersonId: z.string().nullable(),
  payer: personSchema.nullable(),
  order: z
    .object({
      id: z.uuid(),
      campaignId: z.uuid(),
      campaignName: z.string(),
      campaignStatus: z.string(),
      lines: z.array(z.string()),
      handedOverAt: z.string().nullable(),
      canHandOver: z.boolean(),
    })
    .nullable(),
})

const responseSchema = z.object({
  today: z.string(),
  coachFeeAccess: z.enum(['collect', 'view', 'none']).describe('The club\'s "Coaches and payments" setting'),
  groups: z.array(z.object({ id: z.uuid(), name: z.string(), sectionId: z.string(), ...totalsSchema })),
  groupId: z.string().nullable(),
  group: z.object(totalsSchema).nullable(),
  children: z.array(
    personSchema.extend({
      personId: z.uuid(),
      due: z.number().int(),
      overdue: z.boolean(),
      payerMissing: z.boolean().describe('A charge with something due has no payer: a matter for the treasurer'),
      charges: z.array(chargeSchema),
    }),
  ),
  campaigns: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      status: z.string(),
      closesOn: z.string(),
      missing: z.number().int().describe('Children of the group without an order'),
      shareText: z.string(),
      link: z.string(),
    }),
  ),
  cash: z.object({
    items: z.array(
      z.object({
        receiptNumber: z.string(),
        payerPersonId: z.string().nullable(),
        payer: personSchema.nullable(),
        amount: z.number().int(),
        chargeCount: z.number().int(),
        createdAt: z.string(),
      }),
    ),
    total: z.number().int().describe('Grosz the caller holds until the handover to the treasurer'),
    paymentCount: z.number().int(),
  }),
})

export async function GET(request: Request): Promise<Response> {
  try {
    const ctx = await commandContextForRequest(request)
    const scope = ctx ? trustedScopeOf(ctx) : null
    if (!ctx || !scope) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const parsed = groupChargesQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
    if (!parsed.success) return Response.json({ error: 'Invalid query', code: 'query_invalid' }, { status: 400 })
    const grants = await scopeContract.resolve(ctx)
    const [view, cash] = await Promise.all([
      groupChargesView(ctx.container, scope, grants, parsed.data),
      cashHeldBy(ctx.container, scope, selfPersonId(grants)),
    ])
    const campaigns = []
    for (const campaign of view.campaigns) {
      const share = await campaignShareText(request, ctx, scope, campaign)
      campaigns.push({
        id: campaign.id,
        name: campaign.name,
        status: campaign.status,
        closesOn: campaign.closesOn,
        missing: campaign.missing,
        shareText: share.text,
        link: share.link,
      })
    }
    return Response.json(
      {
        ...view,
        campaigns,
        cash: {
          items: cash.items.map((item) => ({
            receiptNumber: item.receiptNumber,
            payerPersonId: item.payerPersonId,
            payer: item.payer,
            amount: item.amount,
            chargeCount: item.chargeCount,
            createdAt: item.createdAt,
          })),
          total: cash.total,
          paymentCount: cash.paymentCount,
        },
      },
      { headers: { 'cache-control': 'no-store' } },
    )
  } catch (error: unknown) {
    return errorResponse(error, 'payments.group_charges.list')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Payments',
  summary: "My groups' payments",
  methods: {
    GET: {
      summary: "The charges of my groups' children, my groups' campaigns and the cash I hold",
      description:
        "Membership fees of the group's fee schedule (current period and overdue, per the club's `coach_fee_access`) and kit orders of campaigns covering the group, per child; without the discount reason and without charges of other groups. `due=1` keeps the children with something to pay.",
      query: groupChargesQuerySchema,
      responses: [
        { status: 200, description: 'The groups, the selected group and the cash held', schema: responseSchema },
      ],
      errors: [
        { status: 400, description: 'Invalid query', schema: errorSchema },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
      ],
    },
  },
}
