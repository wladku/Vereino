// `POST /api/facilities/incidents/{id}/photos` — a photo of an incident (M-12 "Report incident" → photo, B-27; #126):
// `multipart/form-data` with `file`, a PNG, JPEG or WebP up to 5 MB, at most 5 per incident, added with
// `facilities.log.write` by whoever may report at the incident's place. The request is read through the platform's
// bounded `attachmentService.readUploadForm` and the file is checked by its bytes before the command runs — 422
// `incident_photo_missing`, `incident_photo_format_unsupported`, `incident_photo_too_large`,
// `incident_photos_limit_reached`. A photo is evidence: there is no delete.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { storedFileName } from '@vereino/core'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import { attachmentServiceOf, withPhoto, type IncidentPhotoCommandResult } from '../../../../commands/incident-photos'
import { throwFieldError } from '../../../../commands/shared'
import { checkIncidentPhoto } from '../../../../lib/incidents'
import { incidentPhotoUrl } from '../../../../services/incident-photos'
import { errorSchema } from '../../../shared'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['facilities.log.write'] },
}

const paramsSchema = z.object({ id: z.uuid() })

const createdSchema = z.object({
  id: z.uuid(),
  fileName: z.string(),
  mimeType: z.string(),
  size: z.number().int(),
  position: z.number().int(),
  url: z.string().describe('The authenticated photo route'),
})

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = paramsSchema.parse(await context.params)
    const ctx = await commandContextForRequest(request)
    if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const service = attachmentServiceOf(ctx)
    if (!service.readUploadForm) return Response.json({ error: 'Attachment service is unavailable' }, { status: 503 })
    const form = await service.readUploadForm(request)
    const file = form.get('file')
    if (!file || typeof file === 'string') return throwFieldError('incident_photo_missing', 'file')
    const buffer = Buffer.from(await file.arrayBuffer())
    const checked = checkIncidentPhoto(buffer)
    if (!checked.ok) {
      if (checked.problem === 'too_large') return throwFieldError('incident_photo_too_large', 'file')
      if (checked.problem === 'empty') return throwFieldError('incident_photo_missing', 'file')
      return throwFieldError('incident_photo_format_unsupported', 'file')
    }
    const photo = {
      buffer,
      fileName: storedFileName(file.name, checked.file.format, 'photo'),
      mimeType: checked.file.mimeType,
    }
    const { result } = await ctx.container
      .resolve<CommandBus>('commandBus')
      .execute<unknown, IncidentPhotoCommandResult>('facilities.incidents.photos.add', {
        input: { incidentId: id },
        ctx: withPhoto(ctx, photo),
      })
    const row = result.entity
    return Response.json(
      {
        id: row.id,
        fileName: row.fileName,
        mimeType: row.mimeType,
        size: row.fileSize,
        position: row.position,
        url: incidentPhotoUrl(row.incidentId, row.id),
      },
      { status: 201 },
    )
  } catch (error: unknown) {
    return errorResponse(error, 'facilities.incidents.photos.add')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Facilities',
  summary: 'Incident photos',
  methods: {
    POST: {
      summary: 'Add a photo to an incident',
      description:
        'Multipart upload with `file`: a PNG, JPEG or WebP up to 5 MB, read from the file itself; at most 5 photos per incident. Allowed to the facility attendant at their places and to the club administrator. Photos are never deleted.',
      requestBody: {
        contentType: 'multipart/form-data',
        schema: z.object({ file: z.string().describe('The photo: PNG, JPEG or WebP up to 5 MB') }),
      },
      responses: [{ status: 201, description: 'Created', schema: createdSchema }],
      errors: [
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 403, description: '`scope_denied` (another place)', schema: errorSchema },
        { status: 404, description: 'Unknown incident', schema: errorSchema },
        {
          status: 422,
          description:
            '`incident_photo_missing`, `incident_photo_format_unsupported`, `incident_photo_too_large`, `incident_photos_limit_reached`',
          schema: errorSchema,
        },
      ],
    },
  },
}
