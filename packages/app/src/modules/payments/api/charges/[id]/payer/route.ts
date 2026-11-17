// `POST /api/payments/charges/{id}/payer` — `payments.charges.assign_payer` (payments parity spec REQ-C06; B-22
// "Assign payer"; #295): an `open` or `partially_paid` charge without a payer gets one — an active guardian of the
// debtor, or the adult debtor. Payments already recorded stay. Send the charge's lock token in the platform
// optimistic-lock header.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import type { ChargePayerResult } from '../../../../commands/ledger'
import { chargeAssignPayerSchema } from '../../../../data/validators'
import { errorSchema } from '../../../shared'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['payments.manage'] },
}

const paramsSchema = z.object({ id: z.uuid() })

const bodySchema = chargeAssignPayerSchema.omit({ id: true })

const responseSchema = z.object({
  ok: z.literal(true),
  id: z.uuid(),
  payerPersonId: z.uuid(),
  updatedAt: z.string(),
  actingRole: z.string(),
})

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = paramsSchema.parse(await context.params)
    const ctx = await commandContextForRequest(request)
    if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const body: unknown = await request.json().catch(() => ({}))
    const commandBus = ctx.container.resolve<CommandBus>('commandBus')
    const { result } = await commandBus.execute<unknown, ChargePayerResult>('payments.charges.assign_payer', {
      input: { ...(typeof body === 'object' && body !== null ? body : {}), id },
      ctx,
    })
    return Response.json({
      ok: true,
      id: result.entity.id,
      payerPersonId: result.entity.payerPersonId,
      updatedAt: result.entity.updatedAt.toISOString(),
      actingRole: result.actingRole,
    })
  } catch (error: unknown) {
    return errorResponse(error, 'payments.charges.assign_payer')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Payments',
  summary: 'Assign a payer',
  methods: {
    POST: {
      summary: 'Assign a payer to a charge without one',
      description:
        "Sets the payer of an `open` or `partially_paid` charge flagged without a payer and clears the flag; payments already recorded stay. The payer must be an active guardian of the debtor, or the debtor when adult (the charge detail's `payerOptions`). Emits `payments.charge.payer_assigned` (ids only); audited. Send the charge's lock token in the platform optimistic-lock header (400 `lock_token_required` without it).",
      requestBody: { contentType: 'application/json', schema: bodySchema },
      responses: [{ status: 200, description: 'The charge with its payer', schema: responseSchema }],
      errors: [
        { status: 400, description: 'Invalid input, `lock_token_required`', schema: errorSchema },
        { status: 403, description: 'scope_denied', schema: errorSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
        {
          status: 409,
          description: '`charge_payer_already_set`, `charge_not_payable`, `optimistic_lock_conflict`',
          schema: errorSchema,
        },
        { status: 422, description: '`charge_payer_not_eligible`', schema: errorSchema },
      ],
    },
  },
}
