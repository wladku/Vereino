// `POST /api/training/outlines/{id}/images` → `training.outlines.images.add` (training outlines spec *API* →
// `/api/training/outlines/[id]/images`; REQ-O06; #683): `multipart/form-data` with `file` (JPEG, PNG or WebP up to
// 5 MB, read from its bytes), `part` (`warm_up`, `main`, `cool_down`) and `index` (the exercise), at most 12 images per
// outline; a second image on the same exercise replaces the first. Send the outline's lock token in the platform
// optimistic-lock header: the upload changes the outline's version. 422 `outline_image_missing`,
// `outline_image_format_unsupported`, `outline_image_too_large`, `outline_images_limit_reached`,
// `outline_exercise_not_found`; 409 `outline_locked`.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { storedFileName } from '@vereino/core'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import { attachmentServiceOf, withImage, type ImageCommandResult } from '../../../../commands/images'
import { throwFieldError } from '../../../../commands/shared'
import { checkOutlineImage, outlineImageUrl } from '../../../../lib/images'
import { errorSchema } from '../../../shared'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['training.outlines.write'] },
}

const paramsSchema = z.object({ id: z.uuid() })

const createdSchema = z.object({
  attachmentId: z.uuid(),
  ownerOutlineId: z.uuid(),
  url: z.string().describe('The authenticated image route'),
  updatedAt: z.string().describe('The outline’s new version'),
})

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const params = paramsSchema.safeParse(await context.params)
    if (!params.success) return Response.json({ error: 'Not found' }, { status: 404 })
    const ctx = await commandContextForRequest(request)
    if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const service = attachmentServiceOf(ctx)
    if (!service.readUploadForm) return Response.json({ error: 'Attachment service is unavailable' }, { status: 503 })
    const form = await service.readUploadForm(request)
    const file = form.get('file')
    if (!file || typeof file === 'string') return await throwFieldError('outline_image_missing', 'file')
    const buffer = Buffer.from(await file.arrayBuffer())
    const checked = checkOutlineImage(buffer)
    if (!checked.ok) {
      if (checked.problem === 'too_large') return await throwFieldError('outline_image_too_large', 'file')
      if (checked.problem === 'empty') return await throwFieldError('outline_image_missing', 'file')
      return await throwFieldError('outline_image_format_unsupported', 'file')
    }
    const image = {
      buffer,
      fileName: storedFileName(file.name, checked.file.format, 'image'),
      mimeType: checked.file.mimeType,
    }
    const { result } = await ctx.container
      .resolve<CommandBus>('commandBus')
      .execute<unknown, ImageCommandResult>('training.outlines.images.add', {
        input: { id: params.data.id, part: form.get('part'), index: form.get('index') },
        ctx: withImage(ctx, image),
      })
    const ref = result.image as NonNullable<ImageCommandResult['image']>
    return Response.json(
      {
        attachmentId: ref.attachmentId,
        ownerOutlineId: ref.ownerOutlineId,
        url: outlineImageUrl(result.entity.id, ref.attachmentId),
        updatedAt: result.entity.updatedAt.toISOString(),
      },
      { status: 201 },
    )
  } catch (error: unknown) {
    return errorResponse(error, 'training.outlines.images.add')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Training',
  summary: 'Outline images',
  methods: {
    POST: {
      summary: 'Add an image to an exercise of an outline',
      description:
        'Multipart upload with `file` (JPEG, PNG or WebP up to 5 MB, read from the file itself), `part` and `index`; at most 12 images per outline. Send the outline’s lock token in the platform optimistic-lock header.',
      requestBody: {
        contentType: 'multipart/form-data',
        schema: z.object({
          file: z.string().describe('The image: JPEG, PNG or WebP up to 5 MB'),
          part: z.enum(['warm_up', 'main', 'cool_down']),
          index: z.string().describe('The exercise’s position in the part, from 0'),
        }),
      },
      responses: [{ status: 201, description: 'Created', schema: createdSchema }],
      errors: [
        { status: 400, description: 'Invalid input, `lock_token_required`', schema: errorSchema },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 403, description: '`scope_denied`', schema: errorSchema },
        { status: 404, description: 'Unknown outline', schema: errorSchema },
        { status: 409, description: '`optimistic_lock_conflict`, `outline_locked`', schema: errorSchema },
        {
          status: 422,
          description:
            '`outline_image_missing`, `outline_image_format_unsupported`, `outline_image_too_large`, `outline_images_limit_reached`, `outline_exercise_not_found`',
          schema: errorSchema,
        },
      ],
    },
  },
}
