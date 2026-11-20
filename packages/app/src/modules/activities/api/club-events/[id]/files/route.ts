// `POST /api/activities/club-events/{id}/files` — `activities.club_event_files.add` (club events spec REQ-T08, DD-T10;
// #379): the event's managers add the poster or a funder logo as `multipart/form-data` with `file`, `kind`
// (`poster` | `funder_logo`) and, for a logo, `funderName` (2–120, the image's alternative text). PNG, JPEG or WebP
// read from the bytes; a poster up to 5 MB replaces the live one, a logo up to 2 MB, at most 12. Undoable.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import { withClubEventUpload, type ClubEventFileCommandResult } from '../../../../commands/club-event-files'
import { CLUB_EVENT_FILE_KINDS } from '../../../../lib/club-event-files'
import { clubEventFileView } from '../../../../services/club-events'
import { readClubEventUpload } from '../../../club-event-uploads'
import { errorSchema } from '../../../shared'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['activities.manage'] },
}

const paramsSchema = z.object({ id: z.uuid() })
const kindSchema = z.enum(CLUB_EVENT_FILE_KINDS)

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = paramsSchema.parse(await context.params)
    const ctx = await commandContextForRequest(request)
    if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const { upload, kind, funderName } = await readClubEventUpload(ctx, request)
    const { result } = await ctx.container
      .resolve<CommandBus>('commandBus')
      .execute<unknown, ClubEventFileCommandResult>('activities.club_event_files.add', {
        input: { clubEventId: id, kind, funderName },
        ctx: withClubEventUpload(ctx, upload),
      })
    return Response.json(
      { ...clubEventFileView(result.entity), replacedId: result.replacedId, actingRole: result.actingRole },
      { status: 201 },
    )
  } catch (error: unknown) {
    return errorResponse(error, 'activities.club_event_files.add')
  }
}

const uploadSchema = z.object({
  file: z.string().describe('PNG, JPEG or WebP, read from the bytes: a poster up to 5 MB, a logo up to 2 MB.'),
  kind: kindSchema,
  funderName: z.string().optional().describe('Required for a `funder_logo` (2–120): the image’s alternative text.'),
})

const createdSchema = z.object({
  id: z.uuid(),
  kind: kindSchema,
  funderName: z.string().nullable(),
  fileName: z.string(),
  mimeType: z.string(),
  fileSize: z.number().int(),
  position: z.number().int(),
  url: z.string().describe('The authenticated image route.'),
  createdAt: z.string(),
  updatedAt: z.string(),
  replacedId: z.uuid().nullable().describe('The poster this upload replaced.'),
  actingRole: z.string(),
})

export const openApi: OpenApiRouteDoc = {
  tag: 'Activities',
  summary: 'Club event files',
  methods: {
    POST: {
      summary: 'Add the poster or a funder logo to a club event',
      description:
        'Multipart upload with `file`, `kind` (`poster` | `funder_logo`) and `funderName` for a logo. The format is read from the file itself (PNG, JPEG, WebP; no SVG, no PDF). A new poster replaces the live one; at most 12 logos. Undoable.',
      requestBody: { contentType: 'multipart/form-data', schema: uploadSchema },
      responses: [{ status: 201, description: 'Created', schema: createdSchema }],
      errors: [
        { status: 400, description: 'Invalid kind', schema: errorSchema },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 403, description: '`scope_denied`', schema: errorSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
        { status: 409, description: '`club_event_cancelled`', schema: errorSchema },
        {
          status: 422,
          description:
            '`club_event_file_missing`, `club_event_file_too_large`, `club_event_file_format_unsupported`, `club_event_funders_limit`, `club_event_funder_name_invalid`',
          schema: errorSchema,
        },
        { status: 503, description: 'No attachment service', schema: errorSchema },
      ],
    },
  },
}
