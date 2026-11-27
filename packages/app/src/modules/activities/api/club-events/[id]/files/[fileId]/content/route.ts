// `GET /api/activities/club-events/{id}/files/{fileId}/content` — the bytes of a picture for the event's managers
// (event photos spec REQ-I04, DD-I12; #872): the only staff route to a picture, published or not. A caller who does not
// manage the event (DD-T06) gets the same 404 as for an unknown id, so nothing tells them a picture exists. Served
// `private, no-store` with `nosniff`; the platform image route never sees a picture's attachment id.
import { z } from 'zod'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AttachmentService } from '@open-mercato/core/modules/attachments'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse, scopeContract, trustedScopeOf } from '@/modules/foundation'
import { ClubEventFile } from '../../../../../../data/entities'
import {
  CLUB_EVENT_FILE_PARTITION,
  CLUB_EVENT_PICTURE_KINDS,
  CLUB_EVENT_PICTURE_OWNER_ENTITY,
} from '../../../../../../lib/club-event-files'
import { clubEventRecordManagerRole } from '../../../../../../services/club-event-scope'
import { findClubEvent } from '../../../../../../services/club-events'
import { errorSchema } from '../../../../../shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['activities.view'] },
}

const paramsSchema = z.object({ id: z.uuid(), fileId: z.uuid() })

const notFound = () => Response.json({ error: 'Not found' }, { status: 404 })

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string; fileId: string }> },
): Promise<Response> {
  try {
    const params = paramsSchema.safeParse(await context.params)
    if (!params.success) return notFound()
    const ctx = await commandContextForRequest(request)
    const scope = ctx ? trustedScopeOf(ctx) : null
    if (!ctx || !scope || !ctx.auth) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const event = await findClubEvent(ctx.container, scope, params.data.id)
    if (!event || !clubEventRecordManagerRole(await scopeContract.resolve(ctx), event)) return notFound()
    const picture = await ctx.container
      .resolve<EntityManager>('em')
      .fork()
      .findOne(ClubEventFile, {
        ...scope,
        id: params.data.fileId,
        clubEventId: event.id,
        kind: { $in: [...CLUB_EVENT_PICTURE_KINDS] },
        deletedAt: null,
      })
    if (!picture || !ctx.container.hasRegistration('attachmentService')) return notFound()
    const file = await ctx.container.resolve<AttachmentService>('attachmentService').readScoped({
      attachmentId: picture.attachmentId,
      auth: ctx.auth,
      expectedOwner: { entityId: CLUB_EVENT_PICTURE_OWNER_ENTITY, recordId: picture.id },
      expectedAssignment: { type: CLUB_EVENT_PICTURE_OWNER_ENTITY, id: picture.id },
      expectedPartitionCode: CLUB_EVENT_FILE_PARTITION,
      requirePrivatePartition: true,
    })
    return new Response(new Uint8Array(file.buffer), {
      headers: {
        'Content-Type': picture.mimeType,
        'Content-Length': String(file.buffer.length),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error: unknown) {
    return errorResponse(error, 'activities.club_event_files.content')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Activities',
  summary: 'Club event picture content',
  methods: {
    GET: {
      summary: 'Read the bytes of a picture of a club event',
      description:
        'For the event’s managers only (the club administrator; a coordinator of the event’s section). Anyone else, and an unknown id, gets 404. `Cache-Control: private, no-store`.',
      responses: [{ status: 200, description: 'The image', schema: z.unknown() }],
      errors: [
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
      ],
    },
  },
}
