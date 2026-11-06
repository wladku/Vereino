// `POST /api/payments/charges/{id}/cancel` — `payments.charges.cancel` (payments spec API table, REQ-011; B-22
// "Cancel charge"; issue #109): an `open` charge with nothing paid becomes `cancelled` with a required reason, kept on
// the charge and in the audit log. Send the charge's lock token in the platform optimistic-lock header.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import type { ChargeCancelResult } from '../../../../commands/ledger'
import { chargeCancelSchema } from '../../../../data/validators'
import { errorSchema } from '../../../shared'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['payments.manage'] },
}

const paramsSchema = z.object({ id: z.uuid() })

const bodySchema = chargeCancelSchema.omit({ id: true })

const responseSchema = z.object({
  ok: z.literal(true),
  id: z.uuid(),
  status: z.literal('cancelled'),
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
    const { result } = await commandBus.execute<unknown, ChargeCancelResult>('payments.charges.cancel', {
      input: { ...(typeof body === 'object' && body !== null ? body : {}), id },
      ctx,
    })
    return Response.json({
      ok: true,
      id: result.entity.id,
      status: result.entity.status,
      updatedAt: result.entity.updatedAt.toISOString(),
      actingRole: result.actingRole,
    })
  } catch (error: unknown) {
    return errorResponse(error, 'payments.charges.cancel')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Payments',
  summary: 'Cancel a charge',
  methods: {
    POST: {
      summary: 'Cancel an open, unpaid charge with a reason',
      description:
        "Cancels the charge; the reason is kept on the charge and in the audit log. Only an `open` charge with nothing paid can be cancelled. Send the charge's lock token in the platform optimistic-lock header (400 `lock_token_required` without it).",
      requestBody: { contentType: 'application/json', schema: bodySchema },
      responses: [{ status: 200, description: 'The cancelled charge', schema: responseSchema }],
      errors: [
        {
          status: 400,
          description: 'Invalid input (a reason is required), `lock_token_required`',
          schema: errorSchema,
        },
        { status: 403, description: 'scope_denied', schema: errorSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
        {
          status: 409,
          description: '`charge_has_payments`, `charge_not_cancellable`, `optimistic_lock_conflict`',
          schema: errorSchema,
        },
      ],
    },
  },
}
