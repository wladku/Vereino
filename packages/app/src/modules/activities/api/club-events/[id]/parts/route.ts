// `POST /api/activities/club-events/{id}/parts` — `activities.club_event_parts.create` (club events spec REQ-T02,
// REQ-T04, REQ-T07, DD-T04, DD-T07; #376): the event's managers add a part. With `groupId` it is a one-off activity of
// that group (a group of the event's section) with one session at the event's place — a club place is checked in full,
// an external place for the coach only; with `groupId: null` it is an open part with its own times, allowed only at an
// external place. At most 40 parts per event.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import type { ClubEventPartCommandResult } from '../../../../commands/club-event-parts'
import { clubEventPartCreateSchema } from '../../../../data/validators'
import { conflictErrorSchema, errorSchema } from '../../../shared'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['activities.manage'] },
}

const paramsSchema = z.object({ id: z.uuid() })

const responseSchema = z.object({
  id: z.uuid().describe('The part.'),
  activityId: z.uuid().nullable().describe('Its one-off activity; null for an open part.'),
  occurrenceId: z.uuid().nullable().describe('Its session; null for an open part.'),
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
    const { result } = await commandBus.execute<unknown, ClubEventPartCommandResult>(
      'activities.club_event_parts.create',
      { input: { ...(typeof body === 'object' && body !== null ? body : {}), clubEventId: id }, ctx },
    )
    return Response.json(
      {
        id: result.entity.id,
        activityId: result.entity.activityId ?? null,
        occurrenceId: result.occurrenceId,
        updatedAt: result.entity.updatedAt.toISOString(),
        actingRole: result.actingRole,
      },
      { status: 201 },
    )
  } catch (error: unknown) {
    return errorResponse(error, 'activities.club_event_parts.create')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Activities',
  summary: 'Add a part to a club event',
  methods: {
    POST: {
      summary: 'Add a part with a group, or an open part',
      description:
        'Adds a part to the club event (its managers only). With `groupId` the part is a one-off activity of that group with one session at the event’s place (its gathering and deadline default to the event’s); with `groupId: null` it is an open part with its own times, only while the event’s place is external. `clubEventId` comes from the path.',
      requestBody: { contentType: 'application/json', schema: clubEventPartCreateSchema.omit({ clubEventId: true }) },
      responses: [{ status: 201, description: 'The part', schema: responseSchema }],
      errors: [
        { status: 400, description: 'Invalid input', schema: errorSchema },
        { status: 403, description: '`scope_denied`', schema: errorSchema },
        { status: 404, description: 'Unknown club event', schema: errorSchema },
        {
          status: 409,
          description:
            '`occurrence_place_conflict` / `occurrence_coach_conflict` with `conflicts`, `event_place_closed`, `club_event_cancelled`',
          schema: conflictErrorSchema,
        },
        {
          status: 422,
          description:
            '`club_event_part_outside_section`, `club_event_open_part_needs_external_place`, `club_event_parts_limit`, `activity_type_requires_team`, `activity_times_inverted`, `activities_reference_invalid`, `activity_group_inactive`, `occurrence_confirm_by_*`',
          schema: errorSchema,
        },
      ],
    },
  },
}
