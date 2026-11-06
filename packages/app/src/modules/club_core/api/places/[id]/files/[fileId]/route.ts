// `DELETE /api/club_core/places/{id}/files/{fileId}` — remove a place's photo or regulations PDF (UX parity spec,
// REQ-U03; #86). The club administrator; undoable (the file is kept, so the undo finds it). A file link has no
// editable fields, so no lock token is needed.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import type { PlaceFileCommandResult } from '../../../../../commands/place-files'
import { errorSchema } from '../../../../shared'

export const metadata = {
  DELETE: { requireAuth: true, requireFeatures: ['club_core.manage'] },
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
    await ctx.container
      .resolve<CommandBus>('commandBus')
      .execute<unknown, PlaceFileCommandResult>('club_core.places.files.delete', {
        input: { id: fileId, placeId: id },
        ctx,
      })
    return new Response(null, { status: 204 })
  } catch (error: unknown) {
    return errorResponse(error, 'club_core.place_files.delete')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Club core',
  summary: 'Place file',
  methods: {
    DELETE: {
      summary: "Remove a place's photo or regulations PDF",
      description: 'Undoable. No lock token: a file link has no editable fields.',
      responses: [{ status: 204, description: 'Removed' }],
      errors: [
        { status: 403, description: '`scope_denied`', schema: errorSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
      ],
    },
  },
}
