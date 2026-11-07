// The status actions of a rental (`POST /api/facilities/rentals/{id}/confirm|cancel|move|no-show`; facilities spec
// the rental action row of *API, Command, and Error Contracts*; REQ-013; #122): each runs its command with the id from
// the path and the body, with the lock token in the platform optimistic-lock header, and answers the new status.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import type { RentalCommandResult } from '../commands/rentals'
import { errorSchema, rentalActionResponseSchema } from './shared'

const paramsSchema = z.object({ id: z.uuid() })

export function rentalActionHandler(commandId: string) {
  return async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
    try {
      const { id } = paramsSchema.parse(await context.params)
      const ctx = await commandContextForRequest(request)
      if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
      const body: unknown = await request.json().catch(() => ({}))
      const commandBus = ctx.container.resolve<CommandBus>('commandBus')
      const { result } = await commandBus.execute<unknown, RentalCommandResult>(commandId, {
        input: { ...(typeof body === 'object' && body !== null ? body : {}), id },
        ctx,
      })
      const row = result.entity
      return Response.json({
        ok: true,
        id: row.id,
        status: row.status,
        updatedAt: row.updatedAt.toISOString(),
        startsAt: row.startsAt.toISOString(),
        endsAt: row.endsAt.toISOString(),
        ...(result.chargeWarning ? { warning: result.chargeWarning } : {}),
      })
    } catch (error: unknown) {
      return errorResponse(error, commandId)
    }
  }
}

export const rentalActionMetadata = {
  POST: { requireAuth: true, requireFeatures: ['facilities.rentals.manage'] },
}

const actionResponseSchema = rentalActionResponseSchema.extend({
  startsAt: z.string(),
  endsAt: z.string(),
  warning: z
    .literal('charge_paid')
    .optional()
    .describe('A paid charge was left as it was (refunds belong to payments)'),
})

export function rentalActionOpenApi(args: {
  summary: string
  description: string
  body: z.ZodType
  conflicts: string
}): OpenApiRouteDoc {
  return {
    tag: 'Facilities',
    summary: args.summary,
    methods: {
      POST: {
        summary: args.summary,
        description: `${args.description} Send the lock token in the platform optimistic-lock header (400 \`lock_token_required\` without it).`,
        requestBody: { contentType: 'application/json', schema: args.body },
        responses: [{ status: 200, description: 'The rental with its new status', schema: actionResponseSchema }],
        errors: [
          { status: 400, description: 'Invalid input, `lock_token_required`', schema: errorSchema },
          { status: 403, description: 'scope_denied', schema: errorSchema },
          { status: 404, description: 'Not found', schema: errorSchema },
          { status: 409, description: args.conflicts, schema: errorSchema },
        ],
      },
    },
  }
}
