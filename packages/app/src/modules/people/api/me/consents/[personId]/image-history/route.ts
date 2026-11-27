// `GET /api/people/me/consents/{personId}/image-history` (event photos spec API table, REQ-I06, REQ-I07; #871): the
// history of the image consent of the caller themself or of a ward of an active guardianship, with the public photos
// that show the person now (`publicPhotos`, from phase 2's optional contract; none before). The caller comes only from
// the session; any other person — another family's child, a former ward, another club's id — answers 404.
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse, trustedScopeOf } from '@/modules/foundation'
import { readMemberImageHistory } from '../../../../../services/image-history'
import { errorSchema, imageHistoryQuerySchema, imageHistorySchema } from '../../../../shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['people.self'] },
}

const paramsSchema = z.object({ personId: z.uuid() })

export async function GET(request: Request, context: { params: Promise<{ personId: string }> }): Promise<Response> {
  try {
    const { personId } = paramsSchema.parse(await context.params)
    const query = imageHistoryQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams))
    const ctx = await commandContextForRequest(request)
    const scope = ctx ? trustedScopeOf(ctx) : null
    if (!ctx?.auth || !scope) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const history = await readMemberImageHistory(ctx.container, scope, ctx.auth.sub, personId, query)
    if (!history) return Response.json({ error: 'Not found' }, { status: 404 })
    return Response.json(history, { headers: { 'cache-control': 'private, no-store' } })
  } catch (error: unknown) {
    return errorResponse(error, 'people.me.image_history')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'People',
  summary: 'Image consent history (member)',
  methods: {
    GET: {
      summary: "The image consent history of the caller or of the caller's ward",
      description:
        'Each decision of the image consent with its date, its author (a family member by name, staff by role) and whether it was given to the current wording, newest first; `earlier` lists decisions stored before history was kept; `publicPhotos` counts the public event photos that show the person now. Only for the caller themself or a ward of an active guardianship; any other person answers 404.',
      query: imageHistoryQuerySchema,
      responses: [
        {
          status: 200,
          description: 'One page of the history and the public photos',
          schema: imageHistorySchema.extend({
            publicPhotos: z.object({
              count: z.number().int(),
              events: z.array(z.object({ name: z.string(), url: z.string() })),
            }),
          }),
        },
      ],
      errors: [
        { status: 400, description: 'Validation failed', schema: errorSchema },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
      ],
    },
  },
}
