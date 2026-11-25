// `PUT /api/training/library/{entryId}/rating` → `training.library.rate` (training outlines spec *API*, BR-O6, DD-O12;
// REQ-O12; E24-S05, #685): `{ stars }` 1–5, once per coach and changeable, only after the coach used the entry
// (closed a session whose outline came from it): 409 `rating_requires_use` otherwise.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import type { RateResult } from '../../../../commands/library'
import { errorSchema } from '../../../library-shared'

export const metadata = {
  PUT: { requireAuth: true, requireFeatures: ['training.library.use'] },
}

const paramsSchema = z.object({ entryId: z.uuid() })
const bodySchema = z.object({ stars: z.number().int().min(1).max(5) })

export async function PUT(request: Request, context: { params: Promise<{ entryId: string }> }): Promise<Response> {
  try {
    const params = paramsSchema.safeParse(await context.params)
    if (!params.success) return Response.json({ error: 'Not found' }, { status: 404 })
    const ctx = await commandContextForRequest(request)
    if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const body: unknown = await request.json().catch(() => ({}))
    const input = { ...(body && typeof body === 'object' ? body : {}), entryId: params.data.entryId }
    const { result } = await ctx.container
      .resolve<CommandBus>('commandBus')
      .execute<unknown, RateResult>('training.library.rate', { input, ctx })
    return Response.json({ stars: result.stars, averageRating: result.averageRating, ratingCount: result.ratingCount })
  } catch (error: unknown) {
    return errorResponse(error, 'training.library.rate')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Training',
  summary: 'Rate a library outline',
  methods: {
    PUT: {
      summary: 'Rate a shared outline after using it',
      requestBody: { contentType: 'application/json', schema: bodySchema },
      responses: [
        {
          status: 200,
          description: 'The rating and the entry’s new average',
          schema: z.object({
            stars: z.number().int(),
            averageRating: z.number().nullable(),
            ratingCount: z.number().int(),
          }),
        },
      ],
      errors: [
        { status: 400, description: 'Invalid input', schema: errorSchema },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 403, description: '`scope_unlinked`', schema: errorSchema },
        { status: 404, description: '`library_entry_not_found`, `library_not_configured`', schema: errorSchema },
        { status: 409, description: '`rating_requires_use`', schema: errorSchema },
      ],
    },
  },
}
