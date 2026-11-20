// `DELETE /api/activities/club-events/{id}/files/{fileId}` — `activities.club_event_files.delete` (club events spec
// REQ-T08; #379): the event's managers remove the poster or a funder logo, with the file's `updatedAt` as the lock
// token. Undoable: the file stays in `attachments`, so the undo puts the link back in its place.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import type { ClubEventFileCommandResult } from '../../../../../commands/club-event-files'
import { conflictErrorSchema, errorSchema } from '../../../../shared'

export const metadata = {
  DELETE: { requireAuth: true, requireFeatures: ['activities.manage'] },
}

const paramsSchema = z.object({ id: z.uuid(), fileId: z.uuid() })

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string; fileId: string }> },
): Promise<Response> {
  try {
    const { id, fileId } = paramsSchema.parse(await context.params)
    const ctx = await commandContextForRequest(request)
    if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const { result } = await ctx.container
      .resolve<CommandBus>('commandBus')
      .execute<unknown, ClubEventFileCommandResult>('activities.club_event_files.delete', {
        input: { clubEventId: id, id: fileId },
        ctx,
      })
    return Response.json({ ok: true, actingRole: result.actingRole })
  } catch (error: unknown) {
    return errorResponse(error, 'activities.club_event_files.delete')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Activities',
  summary: 'Club event file',
  methods: {
    DELETE: {
      summary: 'Remove the poster or a funder logo of a club event',
      description: 'Send the file’s `updatedAt` as the lock token. Undoable: the undo puts the file back in its place.',
      responses: [
        { status: 200, description: 'Removed', schema: z.object({ ok: z.literal(true), actingRole: z.string() }) },
      ],
      errors: [
        { status: 400, description: '`lock_token_required`', schema: errorSchema },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 403, description: '`scope_denied`', schema: errorSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
        { status: 409, description: 'Stale lock token; `club_event_cancelled`', schema: conflictErrorSchema },
      ],
    },
  },
}
