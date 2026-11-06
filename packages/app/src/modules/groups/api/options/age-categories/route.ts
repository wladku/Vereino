// `GET /api/groups/options/age-categories` — the age category picker of a team (README B-12, club spec REQ-019, #92):
// the entries of the club's age category dictionary (`dictionaries`, seeded with the PZPN defaults and edited by the
// club administrator), in the dictionary's sort order. Everyone who works with groups reads it through `groups.view`,
// so a coordinator needs no `dictionaries` feature.
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse, trustedScopeOf } from '@/modules/foundation'
import { listAgeCategories } from '../../../services/age-categories'
import { errorSchema } from '../../shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['groups.view'] },
}

const responseSchema = z.object({
  items: z.array(z.object({ id: z.uuid(), value: z.string(), label: z.string() })),
})

export async function GET(request: Request): Promise<Response> {
  try {
    const ctx = await commandContextForRequest(request)
    const scope = ctx ? trustedScopeOf(ctx) : null
    if (!ctx || !scope) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    return Response.json({ items: await listAgeCategories(ctx.container, scope) })
  } catch (error: unknown) {
    return errorResponse(error, 'groups.options.age_categories')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Groups',
  summary: 'Age category options',
  methods: {
    GET: {
      summary: 'List the age categories a team may carry',
      description:
        'The entries of the club’s age category dictionary (key `groups.age_categories` of the `dictionaries` module), in the dictionary’s sort order; empty when the club has no such dictionary or it is inactive. The `id` is what a group’s `ageCategoryEntryId` takes.',
      responses: [{ status: 200, description: 'The age category options', schema: responseSchema }],
      errors: [{ status: 401, description: 'Unauthorized', schema: errorSchema }],
    },
  },
}
