// `PUT /api/activities/club-events/{id}/files/{fileId}/people` — `activities.club_event_files.set_people` (event photos
// spec REQ-I03, DD-I03; #872): the event's managers mark the club persons who can be recognised on a photo (as a set,
// at most 60) and confirm that every recognisable person is marked and nobody outside the club is recognisable; for a
// graphic, that no person can be recognised (`personIds` empty). The picture's `updatedAt` is the lock token. Undoable.
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { jsonBody, pictureResponseSchema, runPictureCommand } from '../../../../../club-event-pictures-shared'
import { conflictErrorSchema, errorSchema } from '../../../../../shared'

export const metadata = {
  PUT: { requireAuth: true, requireFeatures: ['activities.manage'] },
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string; fileId: string }> },
): Promise<Response> {
  return runPictureCommand(request, context, 'activities.club_event_files.set_people', await jsonBody(request))
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Activities',
  summary: 'People on a club event picture',
  methods: {
    PUT: {
      summary: 'Mark the people on a picture and confirm them',
      description:
        'Replaces the marks with `personIds` (club persons, at most 60) and sets or clears the confirmation. A confirmed photo needs at least one mark; a graphic takes none. Send the picture’s `updatedAt` as the lock token. Undoable.',
      requestBody: {
        contentType: 'application/json',
        schema: z.object({ personIds: z.array(z.uuid()).max(60), confirmed: z.boolean() }),
      },
      responses: [{ status: 200, description: 'The picture', schema: pictureResponseSchema }],
      errors: [
        { status: 400, description: '`lock_token_required`; invalid body', schema: errorSchema },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 403, description: '`scope_denied`', schema: errorSchema },
        { status: 404, description: 'Not found (also a person who is not of this club)', schema: errorSchema },
        { status: 409, description: 'Stale lock token; `club_event_cancelled`', schema: conflictErrorSchema },
        {
          status: 422,
          description: '`club_event_photo_unmarked`, `club_event_graphic_has_no_people`',
          schema: errorSchema,
        },
      ],
    },
  },
}
