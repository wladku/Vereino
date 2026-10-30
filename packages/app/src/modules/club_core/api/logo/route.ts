// `POST` and `DELETE /api/club_core/logo` — the club logo (club spec glossary *Logo*, REQ-028, TEST-040; #29): upload
// or replace it as `multipart/form-data` with a `file` field (PNG, JPEG or WebP up to 2 MB, checked by its bytes — 422
// `logo_format_unsupported` / `logo_too_large`), or remove it (the pages then show the initial of the club name). The
// club administrator only; send the settings lock token in the platform optimistic-lock header once the settings exist.
// The logo is read back through `GET /api/club_core/settings` (`logoAttachmentId`, `logoUrl`).
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import { withUpload, type LogoCommandResult } from '../../commands/logos'
import { staffLogoUrl } from '../../lib/files'
import { errorSchema } from '../shared'
import { readCheckedUpload } from '../uploads'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['club_core.manage'] },
  DELETE: { requireAuth: true, requireFeatures: ['club_core.manage'] },
}

const unauthorized = (): Response => Response.json({ error: 'Unauthorized' }, { status: 401 })

function logoResponse(result: LogoCommandResult): Response {
  const logoAttachmentId = result.entity.logoAttachmentId ?? null
  return Response.json({
    ok: true,
    logoAttachmentId,
    logoUrl: staffLogoUrl(logoAttachmentId),
    updatedAt: result.entity.updatedAt.toISOString(),
  })
}

export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await commandContextForRequest(request)
    if (!ctx) return unauthorized()
    const { upload } = await readCheckedUpload(ctx, request, 'logo')
    const { result } = await ctx.container
      .resolve<CommandBus>('commandBus')
      .execute<unknown, LogoCommandResult>('club_core.logos.set', {
        input: { target: 'club' },
        ctx: withUpload(ctx, upload),
      })
    return logoResponse(result)
  } catch (error: unknown) {
    return errorResponse(error, 'club_core.logos.set')
  }
}

export async function DELETE(request: Request): Promise<Response> {
  try {
    const ctx = await commandContextForRequest(request)
    if (!ctx) return unauthorized()
    const { result } = await ctx.container
      .resolve<CommandBus>('commandBus')
      .execute<unknown, LogoCommandResult>('club_core.logos.remove', { input: { target: 'club' }, ctx })
    return logoResponse(result)
  } catch (error: unknown) {
    return errorResponse(error, 'club_core.logos.remove')
  }
}

const logoResponseSchema = z.object({
  ok: z.literal(true),
  logoAttachmentId: z.string().nullable(),
  logoUrl: z.string().nullable(),
  updatedAt: z.string(),
})

const uploadSchema = z.object({ file: z.string().describe('PNG, JPEG or WebP image, at most 2 MB (no SVG)') })

export const openApi: OpenApiRouteDoc = {
  tag: 'Club core',
  summary: 'Club logo',
  methods: {
    POST: {
      summary: 'Upload or replace the club logo',
      description:
        'Multipart upload with a `file` field. The format is read from the file itself. Send the settings lock token in the platform optimistic-lock header once the settings exist.',
      requestBody: { contentType: 'multipart/form-data', schema: uploadSchema },
      responses: [{ status: 200, description: 'The new logo', schema: logoResponseSchema }],
      errors: [
        { status: 400, description: '`upload_file_missing`', schema: errorSchema },
        { status: 403, description: '`scope_denied`', schema: errorSchema },
        { status: 409, description: '`optimistic_lock_conflict`', schema: errorSchema },
        { status: 413, description: 'Request larger than the attachment limit', schema: errorSchema },
        { status: 422, description: '`logo_format_unsupported`, `logo_too_large`', schema: errorSchema },
      ],
    },
    DELETE: {
      summary: 'Remove the club logo',
      description: 'The pages then show the initial of the club name. Undoable.',
      responses: [{ status: 200, description: 'Logo removed', schema: logoResponseSchema }],
      errors: [
        { status: 403, description: '`scope_denied`', schema: errorSchema },
        { status: 409, description: '`optimistic_lock_conflict`', schema: errorSchema },
      ],
    },
  },
}
