// `POST /api/activities/club-events/{id}/files/{fileId}/unpublish` — `activities.club_event_files.unpublish` (event
// photos spec REQ-I04; #872): a manager takes a picture back to a draft, also on a cancelled event. The picture's
// `updatedAt` is the lock token. Undoable.
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
  return runPictureCommand(request, context, 'activities.club_event_files.unpublish')
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Activities',
  summary: 'Unpublish a picture',
  methods: {
    POST: {
      summary: 'Unpublish a picture',
      description:
        'Takes the picture off the public page (also on a cancelled event). Send the picture’s `updatedAt` as the lock token. Undoable.',
      responses: [{ status: 200, description: 'The picture', schema: pictureResponseSchema }],
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
