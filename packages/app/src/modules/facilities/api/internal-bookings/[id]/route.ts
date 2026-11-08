// `DELETE /api/facilities/internal-bookings/{id}` — `facilities.internal_bookings.cancel` (club spec the
// internal-bookings row of *API*; M-11 "canceling one's own booking"; REQ-023; #123): the booker, the coordinator of
// the booking's section or the club administrator cancels a confirmed booking (`confirmed → cancelled`); anyone else
// answers 403. The lock token travels in the platform optimistic-lock header; an optional `reason` in the body.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import type { InternalBookingCommandResult } from '../../../commands/internal-bookings'
import { errorSchema } from '../../shared'

export const metadata = {
  DELETE: { requireAuth: true, requireFeatures: ['facilities.bookings.create'] },
}

const paramsSchema = z.object({ id: z.uuid() })

const bodySchema = z.object({ reason: z.string().max(500).nullable().optional() })

const responseSchema = z.object({
  ok: z.literal(true),
  id: z.uuid(),
  status: z.literal('cancelled'),
  updatedAt: z.string(),
})

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = paramsSchema.parse(await context.params)
    const ctx = await commandContextForRequest(request)
    if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const body: unknown = await request.json().catch(() => ({}))
    const commandBus = ctx.container.resolve<CommandBus>('commandBus')
    const { result } = await commandBus.execute<unknown, InternalBookingCommandResult>(
      'facilities.internal_bookings.cancel',
      { input: { ...(typeof body === 'object' && body !== null ? body : {}), id }, ctx },
    )
    const row = result.entity
    return Response.json({ ok: true, id: row.id, status: row.status, updatedAt: row.updatedAt.toISOString() })
  } catch (error: unknown) {
    return errorResponse(error, 'facilities.internal_bookings.cancel')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Facilities',
  summary: 'Cancel an internal booking',
  methods: {
    DELETE: {
      summary: 'Cancel an internal booking',
      description:
        'The booker, the coordinator of the booking’s section or the club administrator cancels a confirmed booking. Send the lock token in the platform optimistic-lock header (400 `lock_token_required` without it).',
      requestBody: { contentType: 'application/json', schema: bodySchema },
      responses: [{ status: 200, description: 'The cancelled booking', schema: responseSchema }],
      errors: [
        { status: 400, description: 'Invalid input, `lock_token_required`', schema: errorSchema },
        {
          status: 403,
          description: '`scope_denied` (not the booker, the section’s coordinator or the administrator)',
          schema: errorSchema,
        },
        { status: 404, description: 'Not found', schema: errorSchema },
        { status: 409, description: '`invalid_transition` (already cancelled), stale version', schema: errorSchema },
      ],
    },
  },
}
