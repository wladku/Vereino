// `GET` and `POST /api/club_core/places/{id}/files` — a place's regulations PDF and photos (UX parity spec, REQ-U03,
// DD-U06; #86). `GET` lists them for the club administrator; `POST` adds one as `multipart/form-data` with `file` and
// `kind`: a `photo` (PNG, JPEG or WebP up to 5 MB, at most 10 per place) or the `regulations` (a PDF up to 10 MB,
// replacing the previous one). The format is read from the file's bytes — 422 `place_file_format_unsupported`,
// `place_file_too_large`, `place_photos_limit_reached`.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import { withUpload } from '../../../../commands/logos'
import type { PlaceFileCommandResult } from '../../../../commands/place-files'
import { PLACE_FILE_KINDS } from '../../../../lib/files'
import { listPlaceFiles } from '../../../../services/place-files'
import { errorSchema } from '../../../shared'
import { readCheckedUpload } from '../../../uploads'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['club_core.manage'] },
  POST: { requireAuth: true, requireFeatures: ['club_core.manage'] },
}

const paramsSchema = z.object({ id: z.uuid() })
const kindSchema = z.enum(PLACE_FILE_KINDS)

const unauthorized = (): Response => Response.json({ error: 'Unauthorized' }, { status: 401 })

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = paramsSchema.parse(await context.params)
    const ctx = await commandContextForRequest(request)
    if (!ctx) return unauthorized()
    return Response.json(await listPlaceFiles(ctx, id))
  } catch (error: unknown) {
    return errorResponse(error, 'club_core.place_files.list')
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = paramsSchema.parse(await context.params)
    const ctx = await commandContextForRequest(request)
    if (!ctx) return unauthorized()
    const { upload, fields } = await readCheckedUpload(ctx, request, (form) =>
      kindSchema.parse(form.kind) === 'photo' ? 'place_photo' : 'place_regulations',
    )
    const { result } = await ctx.container
      .resolve<CommandBus>('commandBus')
      .execute<unknown, PlaceFileCommandResult>('club_core.places.files.add', {
        input: { placeId: id, kind: fields.kind },
        ctx: withUpload(ctx, upload),
      })
    const row = result.entity
    return Response.json(
      {
        id: row.id,
        kind: row.kind,
        fileName: row.fileName,
        size: row.fileSize,
        position: row.position,
        replacedId: result.replacedId ?? null,
      },
      { status: 201 },
    )
  } catch (error: unknown) {
    return errorResponse(error, 'club_core.place_files.add')
  }
}

const placeFileItemSchema = z.object({
  id: z.uuid(),
  kind: kindSchema,
  fileName: z.string(),
  mimeType: z.string(),
  size: z.number().int(),
  position: z.number().int(),
  url: z.string().describe('The authenticated attachment file route'),
  thumbnailUrl: z.string().nullable().describe('A photo preview through the authenticated image route'),
  createdAt: z.string(),
})

const uploadSchema = z.object({
  file: z.string().describe('A photo: PNG, JPEG or WebP up to 5 MB. Regulations: a PDF up to 10 MB.'),
  kind: kindSchema,
})

const createdSchema = z.object({
  id: z.uuid(),
  kind: kindSchema,
  fileName: z.string(),
  size: z.number().int(),
  position: z.number().int(),
  replacedId: z.uuid().nullable().describe('The regulations file this upload replaced'),
})

export const openApi: OpenApiRouteDoc = {
  tag: 'Club core',
  summary: 'Place files',
  methods: {
    GET: {
      summary: "List a place's regulations and photos",
      responses: [{ status: 200, description: 'Files', schema: z.object({ items: z.array(placeFileItemSchema) }) }],
      errors: [
        { status: 403, description: '`scope_denied`', schema: errorSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
      ],
    },
    POST: {
      summary: 'Add a photo or the regulations PDF to a place',
      description:
        'Multipart upload with `file` and `kind` (`photo` | `regulations`). The format is read from the file itself. A second regulations PDF replaces the first; at most 10 photos.',
      requestBody: { contentType: 'multipart/form-data', schema: uploadSchema },
      responses: [{ status: 201, description: 'Created', schema: createdSchema }],
      errors: [
        { status: 400, description: '`upload_file_missing`, invalid kind', schema: errorSchema },
        { status: 403, description: '`scope_denied`', schema: errorSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
        {
          status: 422,
          description: '`place_file_format_unsupported`, `place_file_too_large`, `place_photos_limit_reached`',
          schema: errorSchema,
        },
      ],
    },
  },
}
