// `POST /api/activities/club-events/{id}/files/{fileId}/publish` — `activities.club_event_files.publish` (event photos
// spec REQ-I04, BR-I01; #872): a manager publishes a picture whose people are confirmed. Whether a guest sees it is
// decided on every read (BR-I01). The picture's `updatedAt` is the lock token. Undoable.
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { pictureResponseSchema, runPictureCommand } from '../../../../../club-event-pictures-shared'
import { conflictErrorSchema, errorSchema } from '../../../../../shared'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['activities.manage'] },
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; fileId: string }> },
): Promise<Response> {
  return runPictureCommand(request, context, 'activities.club_event_files.publish')
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Activities',
  summary: 'Publish a picture',
  methods: {
    POST: {
      summary: 'Publish a picture',
      description:
        'Publishes the picture (staff’s intention): it is public only while the event is public and every marked person’s image consent is in force (BR-I01). Needs its people confirmed. Send the picture’s `updatedAt` as the lock token. Undoable.',
      responses: [{ status: 200, description: 'The picture', schema: pictureResponseSchema }],
      errors: [
        { status: 400, description: '`lock_token_required`', schema: errorSchema },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 403, description: '`scope_denied`', schema: errorSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
        { status: 409, description: 'Stale lock token; `club_event_cancelled`', schema: conflictErrorSchema },
        { status: 422, description: '`club_event_people_unconfirmed`', schema: errorSchema },
      ],
    },
  },
}
