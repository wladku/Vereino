// `GET` and `POST /api/club_core/sections/{id}/materials` — a section's materials (club spec glossary *Section*: public
// materials, UI table "Public page" group; #29). `GET` lists them for the club administrator and the section's
// coordinators (403 `scope_denied` for another section); `POST` adds one as `multipart/form-data` with `file` (PDF,
// PNG, JPEG or WebP up to 10 MB, checked by its bytes — 422 `material_format_unsupported` / `material_too_large`),
// `title` and `isPublic` (`true` publishes it with the `materials` block).
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import { withUpload } from '../../../../commands/logos'
import type { MaterialCommandResult } from '../../../../commands/materials'
import { listSectionMaterials } from '../../../../services/section-content'
import { errorSchema } from '../../../shared'
import { readCheckedUpload } from '../../../uploads'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['club_core.view'] },
  POST: { requireAuth: true, requireFeatures: ['club_core.sections.public_content'] },
}

const paramsSchema = z.object({ id: z.uuid() })

const unauthorized = (): Response => Response.json({ error: 'Unauthorized' }, { status: 401 })

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = paramsSchema.parse(await context.params)
    const ctx = await commandContextForRequest(request)
    if (!ctx) return unauthorized()
    return Response.json(await listSectionMaterials(ctx, id))
  } catch (error: unknown) {
    return errorResponse(error, 'club_core.materials.list')
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = paramsSchema.parse(await context.params)
    const ctx = await commandContextForRequest(request)
    if (!ctx) return unauthorized()
    const { upload, fields } = await readCheckedUpload(ctx, request, 'material')
    const { result } = await ctx.container
      .resolve<CommandBus>('commandBus')
      .execute<unknown, MaterialCommandResult>('club_core.materials.create', {
        input: { sectionId: id, title: fields.title ?? '', isPublic: fields.isPublic === 'true' },
        ctx: withUpload(ctx, upload),
      })
    return Response.json({ id: result.entity.id, updatedAt: result.entity.updatedAt.toISOString() }, { status: 201 })
  } catch (error: unknown) {
    return errorResponse(error, 'club_core.materials.create')
  }
}

const materialItemSchema = z.object({
  id: z.uuid(),
  sectionId: z.uuid(),
  title: z.string(),
  fileName: z.string(),
  mimeType: z.string(),
  fileSize: z.number().int(),
  isPublic: z.boolean(),
  downloadUrl: z.string().describe('The authenticated attachment file route'),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const uploadSchema = z.object({
  file: z.string().describe('PDF, PNG, JPEG or WebP, at most 10 MB'),
  title: z.string(),
  isPublic: z.enum(['true', 'false']).optional(),
})

export const openApi: OpenApiRouteDoc = {
  tag: 'Club core',
  summary: 'Section materials',
  methods: {
    GET: {
      summary: "List a section's materials",
      responses: [{ status: 200, description: 'Materials', schema: z.object({ items: z.array(materialItemSchema) }) }],
      errors: [
        { status: 403, description: '`scope_denied`', schema: errorSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
      ],
    },
    POST: {
      summary: 'Add a section material',
      description: 'Multipart upload with `file`, `title` and `isPublic`. The format is read from the file itself.',
      requestBody: { contentType: 'multipart/form-data', schema: uploadSchema },
      responses: [{ status: 201, description: 'Created', schema: z.object({ id: z.uuid(), updatedAt: z.string() }) }],
      errors: [
        { status: 400, description: '`upload_file_missing`, invalid title', schema: errorSchema },
        { status: 403, description: '`scope_denied`', schema: errorSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
        { status: 422, description: '`material_format_unsupported`, `material_too_large`', schema: errorSchema },
      ],
    },
  },
}
