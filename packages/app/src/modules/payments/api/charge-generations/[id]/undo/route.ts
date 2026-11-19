// `POST /api/payments/charge-generations/{id}/undo` — `payments.charge_generations.undo` (owner decision (a) on #403):
// the undo of #108 for one generation, manual or automatic — its charges still `open` are cancelled (reason
// `generation_undone`; paid and partly paid charges stay) and the run is marked undone, so the daily job never
// generates that month again. Send the generation's lock token (`updatedAt` of the list) in the platform
// optimistic-lock header.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import type { ChargeGenerationUndoResult } from '../../../../commands/generate'
import { errorSchema } from '../../../shared'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['payments.manage'] },
}

const paramsSchema = z.object({ id: z.uuid() })

const responseSchema = z.object({
  ok: z.literal(true),
  id: z.uuid(),
  period: z.string(),
  cancelled: z.number().int().describe('The open charges the undo cancelled'),
  undoneAt: z.string(),
  updatedAt: z.string(),
  actingRole: z.string(),
})

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = paramsSchema.parse(await context.params)
    const ctx = await commandContextForRequest(request)
    if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const commandBus = ctx.container.resolve<CommandBus>('commandBus')
    const { result } = await commandBus.execute<unknown, ChargeGenerationUndoResult>(
      'payments.charge_generations.undo',
      { input: { id }, ctx },
    )
    const generation = result.entity
    return Response.json({
      ok: true,
      id: generation.id,
      period: generation.period,
      cancelled: result.cancelled,
      undoneAt: (generation.undoneAt ?? generation.updatedAt).toISOString(),
      updatedAt: generation.updatedAt.toISOString(),
      actingRole: result.actingRole,
    })
  } catch (error: unknown) {
    return errorResponse(error, 'payments.charge_generations.undo')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Payments',
  summary: 'Undo a charge generation',
  methods: {
    POST: {
      summary: 'Undo one generation, manual or automatic',
      description:
        "Cancels the generation's charges that are still `open` (reason `generation_undone`; paid and partly paid charges stay) and marks the generation undone; the daily job never generates that month again, a manual run of the month creates the charges anew. Send the generation's lock token in the platform optimistic-lock header (400 `lock_token_required` without it).",
      responses: [{ status: 200, description: 'The undone generation', schema: responseSchema }],
      errors: [
        { status: 400, description: 'Invalid id, `lock_token_required`', schema: errorSchema },
        { status: 403, description: 'scope_denied', schema: errorSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
        {
          status: 409,
          description: '`generation_already_undone`, `generation_in_progress`, `optimistic_lock_conflict`',
          schema: errorSchema,
        },
      ],
    },
  },
}
