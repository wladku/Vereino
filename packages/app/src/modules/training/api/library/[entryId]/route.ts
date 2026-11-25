// `GET /api/training/library/{entryId}` (training outlines spec M-O8; REQ-O12; E24-S05, #685): one listed entry the
// signed-in coach may see, with what the coach did with it (used, rated, reported). 404 for a hidden, removed or
// unknown entry.
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import { trainingErrors } from '../../errors'
import { clubViewer, errorSchema, libraryEntrySchema, libraryOf } from '../../library-shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['training.library.use'] },
}

const paramsSchema = z.object({ entryId: z.uuid() })

export async function GET(request: Request, context: { params: Promise<{ entryId: string }> }): Promise<Response> {
  try {
    const params = paramsSchema.safeParse(await context.params)
    if (!params.success) return Response.json({ error: 'Not found' }, { status: 404 })
    const ctx = await commandContextForRequest(request)
    const viewer = ctx ? await clubViewer(ctx) : null
    if (!ctx || !viewer) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const view = await libraryOf(ctx).view(params.data.entryId, viewer)
    if (!view) return await trainingErrors.throw('library_entry_not_found')
    return Response.json(view, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error: unknown) {
    return errorResponse(error, 'training.library.read')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Training',
  summary: 'Training outline library entry',
  methods: {
    GET: {
      summary: 'Read one shared outline',
      description: 'The outline, its credit and licence, its rating and uses, and what the reader did with it.',
      responses: [{ status: 200, description: 'The entry', schema: libraryEntrySchema }],
      errors: [
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 404, description: '`library_entry_not_found`, `library_not_configured`', schema: errorSchema },
      ],
    },
  },
}
