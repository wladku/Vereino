// `POST` and `DELETE /api/club_core/sections/{id}/logo` — a section's own logo (club spec glossary *Logo*, REQ-028,
// TEST-040; #29): upload or replace it (`multipart/form-data`, `file`: PNG, JPEG or WebP up to 2 MB — 422
// `logo_format_unsupported` / `logo_too_large`), or remove it, which restores the club logo. The club administrator,
// or a coordinator of this section (403 `scope_denied` for another section). Send the section lock token in the
// platform optimistic-lock header.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import { withUpload, type LogoCommandResult } from '../../../../commands/logos'
import { staffLogoUrl } from '../../../../lib/files'
import { errorSchema } from '../../../shared'
import { readCheckedUpload } from '../../../uploads'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['club_core.sections.public_content'] },
  DELETE: { requireAuth: true, requireFeatures: ['club_core.sections.public_content'] },
}

const paramsSchema = z.object({ id: z.uuid() })

const unauthorized = (): Response => Response.json({ error: 'Unauthorized' }, { status: 401 })

function logoResponse(result: LogoCommandResult): Response {
  const logoAttachmentId = result.entity.logoAttachmentId ?? null
  return Response.json({
    ok: true,
    id: result.entity.id,
    logoAttachmentId,
    logoUrl: staffLogoUrl(logoAttachmentId),
    updatedAt: result.entity.updatedAt.toISOString(),
  })
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = paramsSchema.parse(await context.params)
    const ctx = await commandContextForRequest(request)
    if (!ctx) return unauthorized()
    const { upload } = await readCheckedUpload(ctx, request, 'logo')
    const { result } = await ctx.container
      .resolve<CommandBus>('commandBus')
      .execute<unknown, LogoCommandResult>('club_core.logos.set', {
        input: { target: 'section', sectionId: id },
        ctx: withUpload(ctx, upload),
      })
    return logoResponse(result)
  } catch (error: unknown) {
    return errorResponse(error, 'club_core.logos.set')
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = paramsSchema.parse(await context.params)
    const ctx = await commandContextForRequest(request)
    if (!ctx) return unauthorized()
    const { result } = await ctx.container
      .resolve<CommandBus>('commandBus')
      .execute<unknown, LogoCommandResult>('club_core.logos.remove', {
        input: { target: 'section', sectionId: id },
        ctx,
      })
    return logoResponse(result)
  } catch (error: unknown) {
    return errorResponse(error, 'club_core.logos.remove')
  }
}

const responseSchema = z.object({
  ok: z.literal(true),
  id: z.uuid(),
  logoAttachmentId: z.string().nullable().describe('null: the section shows the club logo'),
  logoUrl: z.string().nullable(),
  updatedAt: z.string(),
})

const uploadSchema = z.object({ file: z.string().describe('PNG, JPEG or WebP image, at most 2 MB (no SVG)') })

export const openApi: OpenApiRouteDoc = {
  tag: 'Club core',
  summary: 'Section logo',
  methods: {
    POST: {
      summary: "Upload or replace a section's own logo",
      description:
        'Multipart upload with a `file` field, by the club administrator or a coordinator of the section. Send the section lock token in the platform optimistic-lock header (400 `lock_token_required` without it).',
      requestBody: { contentType: 'multipart/form-data', schema: uploadSchema },
      responses: [{ status: 200, description: 'The new logo', schema: responseSchema }],
      errors: [
        { status: 400, description: '`upload_file_missing`', schema: errorSchema },
        { status: 403, description: '`scope_denied`', schema: errorSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
        { status: 409, description: '`optimistic_lock_conflict`', schema: errorSchema },
        { status: 422, description: '`logo_format_unsupported`, `logo_too_large`', schema: errorSchema },
      ],
    },
    DELETE: {
      summary: "Remove a section's own logo",
      description: 'The section shows the club logo again. Undoable.',
      responses: [{ status: 200, description: 'Logo removed', schema: responseSchema }],
      errors: [
        { status: 403, description: '`scope_denied`', schema: errorSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
        { status: 409, description: '`optimistic_lock_conflict`', schema: errorSchema },
      ],
    },
  },
}
