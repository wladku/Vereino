// `GET /api/training/library` (training outlines spec M-O8, DD-O13; REQ-O11, REQ-O12; E24-S05, #685): the listed
// entries a signed-in coach may see (`clubs` and `public`), searchable by text (topic, goal), age category and part,
// sorted by ranking (Bayesian average), most used or newest. Never another club's ids, persons or rater keys.
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import { librarySearchSchema } from '../../lib/library'
import { clubViewer, errorSchema, libraryListSchema, libraryOf } from '../library-shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['training.library.use'] },
}

export async function GET(request: Request): Promise<Response> {
  try {
    const ctx = await commandContextForRequest(request)
    const viewer = ctx ? await clubViewer(ctx) : null
    if (!ctx || !viewer) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const query = librarySearchSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
    if (!query.success) return Response.json({ error: 'Invalid query' }, { status: 400 })
    const list = await libraryOf(ctx).search(query.data, viewer)
    return Response.json(list, { headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error: unknown) {
    return errorResponse(error, 'training.library.search')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Training',
  summary: 'Training outline library',
  methods: {
    GET: {
      summary: 'Search the shared outline library',
      description:
        'Listed entries shared with clubs on Vereino or the public. `q` matches the topic and the goal, `ageCategory` and `part` (an entry with exercises in that part) filter, `sort` is `ranking` (default), `used` or `newest`.',
      query: librarySearchSchema,
      responses: [{ status: 200, description: 'One page of entries', schema: libraryListSchema }],
      errors: [
        { status: 400, description: 'Invalid query', schema: errorSchema },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 404, description: '`library_not_configured`', schema: errorSchema },
      ],
    },
  },
}
