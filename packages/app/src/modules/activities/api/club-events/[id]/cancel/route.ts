// `POST /api/activities/club-events/{id}/cancel` — `activities.club_events.cancel` (club events spec REQ-T01, DD-T14;
// #376): the event's managers cancel it with a reason (3–500); every planned future part session is cancelled as the
// session cancellation cancels it (its notices to each part's audience) and every planned open part. Send the lock
// token in the platform optimistic-lock header. `notified` counts the people told, summed over the sessions.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse, scopeContract, trustedScopeOf } from '@/modules/foundation'
import type { ClubEventCommandResult } from '../../../../commands/club-events'
import { selfPersonId } from '../../../../commands/shared'
import { countCancelledNotified } from '../../../club-event-shared'
import { errorSchema } from '../../../shared'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['activities.manage'] },
}

const paramsSchema = z.object({ id: z.uuid() })
const bodySchema = z.object({ reason: z.string().min(3).max(500) })

const responseSchema = z.object({
  ok: z.literal(true),
  id: z.uuid(),
  status: z.literal('cancelled'),
  updatedAt: z.string(),
  actingRole: z.string(),
  cancelledSessions: z.number().int().min(0),
  notified: z.number().int().min(0),
})

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = paramsSchema.parse(await context.params)
    const ctx = await commandContextForRequest(request)
    if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const body: unknown = await request.json().catch(() => ({}))
    const commandBus = ctx.container.resolve<CommandBus>('commandBus')
    const { result } = await commandBus.execute<unknown, ClubEventCommandResult>('activities.club_events.cancel', {
      input: { ...(typeof body === 'object' && body !== null ? body : {}), id },
      ctx,
    })
    const scope = trustedScopeOf(ctx)
    const notified = scope
      ? await countCancelledNotified(
          ctx.container,
          scope,
          selfPersonId(await scopeContract.resolve(ctx)),
          result.sessionIds,
          result.actingRole,
        )
      : 0
    return Response.json({
      ok: true,
      id: result.entity.id,
      status: result.entity.status,
      updatedAt: result.entity.updatedAt.toISOString(),
      actingRole: result.actingRole,
      cancelledSessions: result.sessionIds.length,
      notified,
    })
  } catch (error: unknown) {
    return errorResponse(error, 'activities.club_events.cancel')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Activities',
  summary: 'Cancel a club event',
  methods: {
    POST: {
      summary: 'Cancel a club event with a reason',
      description:
        'Cancels the club event (its managers only): every planned future part session is cancelled with the reason and its audience is told as for a session cancellation; every planned open part is cancelled. Send the lock token in the platform optimistic-lock header (400 `lock_token_required` without it).',
      requestBody: { contentType: 'application/json', schema: bodySchema },
      responses: [{ status: 200, description: 'The cancelled club event', schema: responseSchema }],
      errors: [
        { status: 400, description: 'Invalid input (a reason of 3–500 characters)', schema: errorSchema },
        { status: 403, description: '`scope_denied`', schema: errorSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
        {
          status: 409,
          description: '`club_event_cancelled` (already cancelled), `optimistic_lock_conflict`',
          schema: errorSchema,
        },
      ],
    },
  },
}
