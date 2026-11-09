// `POST /api/payments/group-charges/remind` — "Send reminder" on M-18 (payments spec API row
// `/api/payments/group-charges/remind`; REQ-033, TEST-045; issue #117 E07-S10): `payments.group_charges.remind`
// e-mails each payer of a child's overdue charges of the caller's group their list and total.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import type { GroupRemindResult } from '../../../commands/group-charges'
import { groupRemindSchema } from '../../../data/validators'
import { errorSchema } from '../../shared'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['payments.groups.collect'] },
}

const responseSchema = z.object({
  ok: z.literal(true),
  charges: z.number().int().describe('Overdue charges with a payer'),
  recipients: z.number().int().describe('Payers e-mailed'),
})

export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await commandContextForRequest(request)
    if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const body: unknown = await request.json().catch(() => ({}))
    const { result } = await ctx.container
      .resolve<CommandBus>('commandBus')
      .execute<unknown, GroupRemindResult>('payments.group_charges.remind', {
        input: typeof body === 'object' && body !== null ? body : {},
        ctx,
      })
    return Response.json({ ok: true, charges: result.charges, recipients: result.recipients })
  } catch (error: unknown) {
    return errorResponse(error, 'payments.group_charges.remind')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Payments',
  summary: 'Remind payers of overdue charges',
  methods: {
    POST: {
      summary: "E-mail the payers of a child's overdue charges of my group",
      description:
        'One e-mail per payer with an address, listing their overdue charges of the group. Each call sends again.',
      requestBody: { contentType: 'application/json', schema: groupRemindSchema },
      responses: [{ status: 200, description: 'How many charges and payers', schema: responseSchema }],
      errors: [
        { status: 400, description: 'Invalid input', schema: errorSchema },
        { status: 403, description: '`scope_denied`, `charge_out_of_scope`', schema: errorSchema },
        { status: 404, description: 'Group not found', schema: errorSchema },
      ],
    },
  },
}
