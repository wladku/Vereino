// `POST /api/activities/events` — `activities.events.create` (club spec API table, glossary *One-off event*, REQ-027,
// TEST-034): a one-off `tournament` or `other` event for one group, created by a coach of the group without the
// coordinator's consent, or by the coordinator of its section or the club administrator. A group outside the
// caller's scope answers 403; a conflict 409 with the list.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import type { EventCommandResult } from '../../commands/events'
import { eventCreateSchema } from '../../data/validators'
import { conflictErrorSchema, errorSchema } from '../shared'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['activities.events.create'] },
}

const responseSchema = z.object({
  id: z.uuid().describe('The one-off activity.'),
  occurrenceId: z.uuid().describe('Its session.'),
  actingRole: z.string(),
})

export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await commandContextForRequest(request)
    if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const body: unknown = await request.json().catch(() => ({}))
    const commandBus = ctx.container.resolve<CommandBus>('commandBus')
    const { result } = await commandBus.execute<unknown, EventCommandResult>('activities.events.create', {
      input: typeof body === 'object' && body !== null ? body : {},
      ctx,
    })
    return Response.json(
      { id: result.entity.id, occurrenceId: result.occurrenceId, actingRole: result.actingRole },
      { status: 201 },
    )
  } catch (error: unknown) {
    return errorResponse(error, 'activities.events.create')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Activities',
  summary: 'Create a one-off event',
  methods: {
    POST: {
      summary: 'Create a one-off event for a group',
      description:
        'Creates a `tournament` or `other` event with one session at the given instants for a group the caller coaches (or coordinates, or as the club administrator). Without `coachPersonId` a coach leads their own event.',
      requestBody: { contentType: 'application/json', schema: eventCreateSchema },
      responses: [{ status: 201, description: 'The event and its session', schema: responseSchema }],
      errors: [
        { status: 400, description: 'Invalid input', schema: errorSchema },
        { status: 403, description: 'scope_denied (a group the caller does not coach)', schema: errorSchema },
        { status: 404, description: 'Unknown place', schema: errorSchema },
        {
          status: 409,
          description: '`occurrence_place_conflict` / `occurrence_coach_conflict` with `conflicts`',
          schema: conflictErrorSchema,
        },
        {
          status: 422,
          description:
            '`activity_type_requires_team`, `event_type_not_allowed`, `activity_times_inverted`, `activities_reference_invalid`, `activity_group_inactive`, `place_not_bookable`',
          schema: errorSchema,
        },
      ],
    },
  },
}
