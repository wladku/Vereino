// `GET /api/training/public/library/{entryId}/images/{n}` (training outlines spec *API* → library image routes, P-O1;
// E24-S05, #685): image `n` of a `public`, `listed` entry, without a session; shared caches may keep it.
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { errorResponse } from '@/modules/foundation'
import { trainingErrors } from '../../../../../errors'
import { LIBRARY_PUBLIC_RATE_LIMIT, errorSchema, imageResponse, libraryOf } from '../../../../../library-shared'

export const metadata = {
  GET: { requireAuth: false, rateLimit: { ...LIBRARY_PUBLIC_RATE_LIMIT, keyPrefix: 'training_public_library_image' } },
}

const paramsSchema = z.object({ entryId: z.uuid(), n: z.coerce.number().int().min(0).max(11) })

export async function GET(
  _request: Request,
  context: { params: Promise<{ entryId: string; n: string }> },
): Promise<Response> {
  try {
    const params = paramsSchema.safeParse(await context.params)
    if (!params.success) return trainingErrors.throw('library_entry_not_found')
    const container = await createRequestContainer()
    const file = await libraryOf({ container }).readImage(params.data.entryId, params.data.n, { kind: 'public' })
    if (!file) return trainingErrors.throw('library_entry_not_found')
    return imageResponse(file, true)
  } catch (error: unknown) {
    return errorResponse(error, 'training.public.library.image')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Training',
  summary: 'Public library outline image',
  methods: {
    GET: {
      summary: 'Read an image of a public shared outline',
      responses: [{ status: 200, description: 'The image (JPEG, PNG or WebP)', schema: z.unknown() }],
      errors: [
        { status: 404, description: '`library_entry_not_found`, `library_not_configured`', schema: errorSchema },
        { status: 429, description: 'Too many requests', schema: errorSchema },
      ],
    },
  },
}
