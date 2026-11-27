// `POST /api/activities/club-events/{id}/files/publish-all` — `activities.club_event_files.publish_all` (event photos
// spec REQ-I04; #872): a manager publishes every draft picture of the event whose people are confirmed; the others are
// reported as skipped. Undoable: the undo unpublishes the pictures it published.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import type { PublishAllResult } from '../../../../../commands/club-event-pictures'
import { errorSchema } from '../../../../shared'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['activities.manage'] },
}

const paramsSchema = z.object({ id: z.uuid() })

const responseSchema = z.object({
  ok: z.literal(true),
  actingRole: z.string(),
  publishedIds: z.array(z.uuid()),
  skippedIds: z.array(z.uuid()).describe('Draft pictures whose people are not confirmed.'),
})

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = paramsSchema.parse(await context.params)
    const ctx = await commandContextForRequest(request)
    if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const { result } = await ctx.container
      .resolve<CommandBus>('commandBus')
      .execute<unknown, PublishAllResult>('activities.club_event_files.publish_all', {
        input: { clubEventId: id },
        ctx,
      })
    return Response.json({
      ok: true,
      actingRole: result.actingRole,
      publishedIds: result.publishedIds,
      skippedIds: result.skippedIds,
    })
  } catch (error: unknown) {
    return errorResponse(error, 'activities.club_event_files.publish_all')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Activities',
  summary: 'Publish all pictures of a club event',
  methods: {
    POST: {
      summary: 'Publish every confirmed draft picture of a club event',
      description:
        'Publishes the draft pictures whose people are confirmed and reports the skipped ones. A picture is public only while BR-I01 holds. Undoable.',
      responses: [{ status: 200, description: 'Published', schema: responseSchema }],
      errors: [
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 403, description: '`scope_denied`', schema: errorSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
        { status: 409, description: '`club_event_cancelled`', schema: errorSchema },
      ],
    },
  },
}
