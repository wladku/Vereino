// `PUT|DELETE /api/activities/club-events/{id}/parts/{partId}` — `activities.club_event_parts.update|delete` (club
// events spec REQ-T02, REQ-T04, DD-T02; #376): the event's managers change a part's title, category, type, visiting
// teams, gathering and deadline (copied to its activity and session in the same transaction; an open part also its
// times), or remove it while nobody declared (409 `club_event_part_in_use`). The group is fixed (422
// `club_event_part_group_fixed`); a part with a group moves through its session. Send the part's lock token in the
// platform optimistic-lock header.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import type { ClubEventPartCommandResult } from '../../../../../commands/club-event-parts'
import { clubEventPartUpdateSchema } from '../../../../../data/validators'
import { errorSchema } from '../../../../shared'

export const metadata = {
  PUT: { requireAuth: true, requireFeatures: ['activities.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['activities.manage'] },
}

const paramsSchema = z.object({ id: z.uuid(), partId: z.uuid() })

const responseSchema = z.object({ ok: z.literal(true), id: z.uuid(), updatedAt: z.string(), actingRole: z.string() })

async function run(
  request: Request,
  context: { params: Promise<{ id: string; partId: string }> },
  commandId: 'activities.club_event_parts.update' | 'activities.club_event_parts.delete',
): Promise<Response> {
  try {
    const { id, partId } = paramsSchema.parse(await context.params)
    const ctx = await commandContextForRequest(request)
    if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const body: unknown = commandId.endsWith('update') ? await request.json().catch(() => ({})) : {}
    const commandBus = ctx.container.resolve<CommandBus>('commandBus')
    const { result } = await commandBus.execute<unknown, ClubEventPartCommandResult>(commandId, {
      input: { ...(typeof body === 'object' && body !== null ? body : {}), clubEventId: id, id: partId },
      ctx,
    })
    return Response.json({
      ok: true,
      id: result.entity.id,
      updatedAt: result.entity.updatedAt.toISOString(),
      actingRole: result.actingRole,
    })
  } catch (error: unknown) {
    return errorResponse(error, commandId)
  }
}

export function PUT(request: Request, context: { params: Promise<{ id: string; partId: string }> }) {
  return run(request, context, 'activities.club_event_parts.update')
}

export function DELETE(request: Request, context: { params: Promise<{ id: string; partId: string }> }) {
  return run(request, context, 'activities.club_event_parts.delete')
}

const commonErrors = [
  { status: 400, description: 'Invalid input; `lock_token_required`', schema: errorSchema },
  { status: 403, description: '`scope_denied`', schema: errorSchema },
  { status: 404, description: 'Not found', schema: errorSchema },
]

export const openApi: OpenApiRouteDoc = {
  tag: 'Activities',
  summary: 'Change or remove a part of a club event',
  methods: {
    PUT: {
      summary: 'Change a part',
      description:
        'Changes the part’s title, category, type, visiting teams, gathering and deadline; for a part with a group the activity’s name, type and invited teams and the session’s gathering and deadline follow in the same transaction (a changed gathering time is announced). An open part also takes `startsAt` and `endsAt`. Send the part’s lock token in the platform optimistic-lock header.',
      requestBody: {
        contentType: 'application/json',
        schema: clubEventPartUpdateSchema.omit({ clubEventId: true, id: true }),
      },
      responses: [{ status: 200, description: 'The changed part', schema: responseSchema }],
      errors: [
        ...commonErrors,
        { status: 409, description: '`optimistic_lock_conflict`, `club_event_cancelled`', schema: errorSchema },
        {
          status: 422,
          description:
            '`club_event_part_group_fixed`, `club_event_part_has_session` (times of a part with a group), `activity_type_requires_team`, `activity_times_inverted`, `activities_reference_invalid`, `occurrence_confirm_by_in_past`',
          schema: errorSchema,
        },
      ],
    },
    DELETE: {
      summary: 'Remove a part',
      description:
        'Removes the part with its activity and session while the session is planned and nobody declared or was checked off (an open part always). Undoable. Send the part’s lock token in the platform optimistic-lock header.',
      responses: [{ status: 200, description: 'The removed part', schema: responseSchema }],
      errors: [
        ...commonErrors,
        {
          status: 409,
          description:
            '`club_event_part_in_use` (cancel it instead), `club_event_cancelled`, `optimistic_lock_conflict`',
          schema: errorSchema,
        },
      ],
    },
  },
}
