// `POST /api/activities/club-events/{id}/parts/{partId}/cancel` — `activities.club_event_parts.cancel` (club events spec
// glossary *Cancelling a part*; #376): the event's managers cancel an open part with a reason; it has no audience, so
// nothing is sent. A part with a group is cancelled through its session (422 `club_event_part_has_session`). Send the
// part's lock token in the platform optimistic-lock header.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import type { ClubEventPartCommandResult } from '../../../../../../commands/club-event-parts'
import { errorSchema } from '../../../../../shared'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['activities.manage'] },
}

const paramsSchema = z.object({ id: z.uuid(), partId: z.uuid() })
const bodySchema = z.object({ reason: z.string().min(3).max(500) })
const responseSchema = z.object({
  ok: z.literal(true),
  id: z.uuid(),
  status: z.literal('cancelled'),
  updatedAt: z.string(),
  actingRole: z.string(),
})

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; partId: string }> },
): Promise<Response> {
  try {
    const { id, partId } = paramsSchema.parse(await context.params)
    const ctx = await commandContextForRequest(request)
    if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const body: unknown = await request.json().catch(() => ({}))
    const commandBus = ctx.container.resolve<CommandBus>('commandBus')
    const { result } = await commandBus.execute<unknown, ClubEventPartCommandResult>(
      'activities.club_event_parts.cancel',
      { input: { ...(typeof body === 'object' && body !== null ? body : {}), clubEventId: id, id: partId }, ctx },
    )
    return Response.json({
      ok: true,
      id: result.entity.id,
      status: result.entity.status,
      updatedAt: result.entity.updatedAt.toISOString(),
      actingRole: result.actingRole,
    })
  } catch (error: unknown) {
    return errorResponse(error, 'activities.club_event_parts.cancel')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Activities',
  summary: 'Cancel an open part',
  methods: {
    POST: {
      summary: 'Cancel an open part of a club event with a reason',
      description:
        'Cancels an open part (no club group) with a reason of 3–500 characters; nothing is sent. Send the part’s lock token in the platform optimistic-lock header.',
      requestBody: { contentType: 'application/json', schema: bodySchema },
      responses: [{ status: 200, description: 'The cancelled part', schema: responseSchema }],
      errors: [
        { status: 400, description: 'Invalid input; `lock_token_required`', schema: errorSchema },
        { status: 403, description: '`scope_denied`', schema: errorSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
        {
          status: 409,
          description: '`invalid_transition` (already cancelled), `club_event_cancelled`, `optimistic_lock_conflict`',
          schema: errorSchema,
        },
        { status: 422, description: '`club_event_part_has_session`', schema: errorSchema },
      ],
    },
  },
}
