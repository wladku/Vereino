// `GET /api/training/library/{entryId}/images/{n}` (training outlines spec *API* → library image routes; E24-S05,
// #685): image `n` of a listed entry the signed-in coach may see, read through `trainingLibrary` (the platform
// attachment route serves only the owning tenant). Cached privately.
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import { trainingErrors } from '../../../../errors'
import { clubViewer, errorSchema, imageResponse, libraryOf } from '../../../../library-shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['training.library.use'] },
}

const paramsSchema = z.object({ entryId: z.uuid(), n: z.coerce.number().int().min(0).max(11) })

export async function GET(
  request: Request,
  context: { params: Promise<{ entryId: string; n: string }> },
): Promise<Response> {
  try {
    const params = paramsSchema.safeParse(await context.params)
    if (!params.success) return Response.json({ error: 'Not found' }, { status: 404 })
    const ctx = await commandContextForRequest(request)
    const viewer = ctx ? await clubViewer(ctx) : null
    if (!ctx || !viewer) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const file = await libraryOf(ctx).readImage(params.data.entryId, params.data.n, viewer)
    if (!file) return trainingErrors.throw('library_entry_not_found')
    return imageResponse(file, false)
  } catch (error: unknown) {
    return errorResponse(error, 'training.library.image')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Training',
  summary: 'Library outline image',
  methods: {
    GET: {
      summary: 'Read an image of a shared outline',
      responses: [{ status: 200, description: 'The image (JPEG, PNG or WebP)', schema: z.unknown() }],
      errors: [
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 404, description: '`library_entry_not_found`, `library_not_configured`', schema: errorSchema },
      ],
    },
  },
}
