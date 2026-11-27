// `DELETE /api/activities/club-events/{id}/files/{fileId}` — `activities.club_event_files.delete` (club events spec
// REQ-T08; #379): the event's managers remove the poster or a funder logo, with the file's `updatedAt` as the lock
// token. Undoable: the file stays in `attachments`, so the undo puts the link back in its place. A picture (event
// photos spec DD-I12, #872) is deleted for good: its marks go with it and its bytes are released after the commit.
//
// `PUT` — `activities.club_event_files.update` (event photos spec REQ-I01, REQ-I04): a picture's `description`,
// `kind` (changing it clears the marks and the confirmation) and `position` (its new place in the order), with the
// picture's `updatedAt` as the lock token.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import type { ClubEventFileCommandResult } from '../../../../../commands/club-event-files'
import { jsonBody, pictureResponseSchema, runPictureCommand } from '../../../../club-event-pictures-shared'
import { conflictErrorSchema, errorSchema } from '../../../../shared'

export const metadata = {
  PUT: { requireAuth: true, requireFeatures: ['activities.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['activities.manage'] },
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string; fileId: string }> },
): Promise<Response> {
  return runPictureCommand(request, context, 'activities.club_event_files.update', await jsonBody(request))
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
    PUT: {
      summary: 'Edit a picture of a club event',
      description:
        'A picture’s `description` (2–200), `kind` (`photo` | `graphic`; a change clears the marks and the confirmation) or `position` (its new place, 0-based). Send the picture’s `updatedAt` as the lock token.',
      requestBody: {
        contentType: 'application/json',
        schema: z.object({
          description: z.string().optional(),
          kind: z.enum(['photo', 'graphic']).optional(),
          position: z.number().int().min(0).optional(),
        }),
      },
      responses: [{ status: 200, description: 'The picture', schema: pictureResponseSchema }],
      errors: [
        { status: 400, description: '`lock_token_required`; invalid body', schema: errorSchema },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 403, description: '`scope_denied`', schema: errorSchema },
        { status: 404, description: 'Not found (also a poster or a logo)', schema: errorSchema },
        { status: 409, description: 'Stale lock token; `club_event_cancelled`', schema: conflictErrorSchema },
        { status: 422, description: '`club_event_picture_description_invalid`', schema: errorSchema },
      ],
    },
    DELETE: {
      summary: 'Remove the poster, a funder logo or a picture of a club event',
      description:
        'Send the file’s `updatedAt` as the lock token. Undoable for the poster and the logos: the undo puts the file back in its place. A picture is deleted for good (its undo answers 409 `club_event_picture_erased`).',
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
