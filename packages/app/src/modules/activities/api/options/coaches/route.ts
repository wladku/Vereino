// `GET /api/activities/options/coaches` — the coach picker of the activity wizard (README B-14, club spec REQ-005,
// #93): the persons with an active `coach` role assignment or an active `coach` / `assistant` membership of any group
// on the club's today, by name, narrowed by `search`. Names only — the planner may pick any coach of the club, as the
// conflict check covers every session of that coach.
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse, trustedScopeOf } from '@/modules/foundation'
import { coachOptions } from '../../../lib/coach-options'
import { clubClock, coachCandidateIds, findPersons } from '../../../services/directory'
import { errorSchema } from '../../shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['activities.manage'] },
}

const querySchema = z.object({
  search: z.string().trim().max(200).optional(),
})

const responseSchema = z.object({
  items: z.array(z.object({ id: z.string(), name: z.string() })),
})

export async function GET(request: Request): Promise<Response> {
  try {
    const ctx = await commandContextForRequest(request)
    const scope = ctx ? trustedScopeOf(ctx) : null
    if (!ctx || !scope) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const query = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams))
    const { today } = await clubClock(ctx.container, scope)
    const persons = await findPersons(ctx.container, scope, await coachCandidateIds(ctx.container, scope, today))
    return Response.json({ items: coachOptions([...persons.values()], query.search) })
  } catch (error: unknown) {
    return errorResponse(error, 'activities.options.coaches')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Activities',
  summary: 'Coach options',
  methods: {
    GET: {
      summary: 'List the persons who may coach',
      description:
        'The persons with an active `coach` role assignment or an active `coach` / `assistant` group membership on the club’s today, sorted by last name, at most 50. `search` keeps the persons whose first or last name starts with every word (case and diacritics ignored).',
      query: querySchema,
      responses: [{ status: 200, description: 'The coach options', schema: responseSchema }],
      errors: [
        { status: 400, description: 'Invalid query', schema: errorSchema },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
      ],
    },
  },
}
