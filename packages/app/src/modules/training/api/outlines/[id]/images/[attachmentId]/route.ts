// `/api/training/outlines/{id}/images/{attachmentId}` (training outlines spec *API* → `/api/training/outlines/[id]/images`;
// #683): GET serves an image the outline references (inline, never cached by a shared cache), for whoever may read
// the outline; DELETE → `training.outlines.images.remove` takes it off its exercise (with the outline's lock token in
// the platform optimistic-lock header) and deletes the file once no outline of the club references it. 404 for an
// unknown outline or an image the outline does not reference.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse, scopeContract, trustedScopeOf } from '@/modules/foundation'
import type { ImageCommandResult } from '../../../../../commands/images'
import { outlineImages } from '../../../../../lib/outline'
import { readOutlineImage } from '../../../../../services/images'
import { readOutline } from '../../../../../services/outline-view'
import { errorSchema, updateResponseSchema } from '../../../../shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['training.outlines.write'] },
  DELETE: { requireAuth: true, requireFeatures: ['training.outlines.write'] },
}

const paramsSchema = z.object({ id: z.uuid(), attachmentId: z.uuid() })

type Params = { params: Promise<{ id: string; attachmentId: string }> }

const notFound = () => Response.json({ error: 'Not found' }, { status: 404 })

export async function GET(request: Request, context: Params): Promise<Response> {
  try {
    const params = paramsSchema.safeParse(await context.params)
    if (!params.success) return notFound()
    const ctx = await commandContextForRequest(request)
    const scope = ctx ? trustedScopeOf(ctx) : null
    if (!ctx?.auth || !scope) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const found = await readOutline(ctx.container, scope, await scopeContract.resolve(ctx), params.data.id)
    const image = found
      ? outlineImages(found.view.parts).find((ref) => ref.attachmentId === params.data.attachmentId)
      : undefined
    if (!image) return notFound()
    const file = await readOutlineImage(ctx.container, ctx.auth, image)
    if (!file) return notFound()
    return new Response(new Uint8Array(file.buffer), {
      headers: {
        'Content-Type': file.mimeType,
        'Content-Disposition': `inline; filename="image"; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
        'Content-Length': String(file.buffer.length),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error: unknown) {
    return errorResponse(error, 'training.outlines.images.read')
  }
}

export async function DELETE(request: Request, context: Params): Promise<Response> {
  try {
    const params = paramsSchema.safeParse(await context.params)
    if (!params.success) return notFound()
    const ctx = await commandContextForRequest(request)
    if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const { result } = await ctx.container
      .resolve<CommandBus>('commandBus')
      .execute<unknown, ImageCommandResult>('training.outlines.images.remove', { input: params.data, ctx })
    return Response.json({ ok: true, id: result.entity.id, updatedAt: result.entity.updatedAt.toISOString() })
  } catch (error: unknown) {
    return errorResponse(error, 'training.outlines.images.remove')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Training',
  summary: 'Outline image',
  methods: {
    GET: {
      summary: 'Read one image of an outline',
      description: 'The image bytes (JPEG, PNG or WebP), for whoever may read the outline.',
      responses: [{ status: 200, description: 'The image', schema: z.unknown() }],
      errors: [
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 403, description: '`scope_denied`', schema: errorSchema },
        { status: 404, description: 'Unknown outline or image', schema: errorSchema },
      ],
    },
    DELETE: {
      summary: 'Remove an image from an outline',
      description:
        'Takes the image off its exercise; the file is deleted once no outline of the club references it. Send the outline’s lock token in the platform optimistic-lock header.',
      responses: [{ status: 200, description: 'Removed', schema: updateResponseSchema }],
      errors: [
        { status: 400, description: '`lock_token_required`', schema: errorSchema },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 403, description: '`scope_denied`', schema: errorSchema },
        { status: 404, description: 'Unknown outline or image', schema: errorSchema },
        { status: 409, description: '`optimistic_lock_conflict`, `outline_locked`', schema: errorSchema },
      ],
    },
  },
}
