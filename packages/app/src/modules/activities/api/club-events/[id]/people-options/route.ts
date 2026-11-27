// `GET /api/activities/club-events/{id}/people-options?q=` — the person picker of "Who is in the photo?" (event photos
// spec REQ-I03; #872), for the event's managers only (anyone else gets 404): the participants of the event's part
// sessions first, then, with a search term (three letters or more of a first or last name), the club's other live
// persons whose name matches. Ids and display names only; at most 50.
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse, scopeContract, trustedScopeOf } from '@/modules/foundation'
import { eventParticipantIds } from '../../../../services/club-event-pictures'
import { clubEventRecordManagerRole } from '../../../../services/club-event-scope'
import { findClubEvent } from '../../../../services/club-events'
import { findPersons, searchPersonIds } from '../../../../services/directory'
import { errorSchema } from '../../../shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['activities.view'] },
}

const paramsSchema = z.object({ id: z.uuid() })
const querySchema = z.object({ q: z.string().trim().max(100).optional() })

const LIMIT = 50

const itemSchema = z.object({ id: z.uuid(), displayName: z.string(), isParticipant: z.boolean() })
const responseSchema = z.object({
  items: z.array(itemSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
  totalPages: z.number().int(),
})

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const params = paramsSchema.safeParse(await context.params)
    if (!params.success) return Response.json({ error: 'Not found' }, { status: 404 })
    const { q } = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams))
    const ctx = await commandContextForRequest(request)
    const scope = ctx ? trustedScopeOf(ctx) : null
    if (!ctx || !scope) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const event = await findClubEvent(ctx.container, scope, params.data.id)
    if (!event || !clubEventRecordManagerRole(await scopeContract.resolve(ctx), event)) {
      return Response.json({ error: 'Not found' }, { status: 404 })
    }
    const participants = await eventParticipantIds(ctx.container, scope, event.id)
    const matches = q ? await searchPersonIds(ctx.container, scope, q) : null
    const participantSet = new Set(participants)
    const candidates = [
      ...participants.filter((id) => !matches || matches.has(id)),
      ...[...(matches ?? [])].filter((id) => !participantSet.has(id)),
    ]
    const persons = await findPersons(ctx.container, scope, candidates)
    const name = (id: string) => {
      const person = persons.get(id)
      return person ? `${person.firstName} ${person.lastName}`.trim() : ''
    }
    const items = candidates
      .filter((id) => persons.has(id) && !persons.get(id)?.anonymized)
      .map((id) => ({ id, displayName: name(id), isParticipant: participantSet.has(id) }))
      .sort(
        (a, b) => Number(b.isParticipant) - Number(a.isParticipant) || a.displayName.localeCompare(b.displayName, 'pl'),
      )
      .slice(0, LIMIT)
    return Response.json({ items, total: items.length, page: 1, pageSize: LIMIT, totalPages: 1 })
  } catch (error: unknown) {
    return errorResponse(error, 'activities.club_events.people_options')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Activities',
  summary: 'People to mark on a club event picture',
  methods: {
    GET: {
      summary: 'List the people a manager can mark on a picture',
      description:
        'For the event’s managers only. The participants of the event’s part sessions first; with `q` (three letters or more of a name) also the club’s other matching persons. At most 50.',
      query: querySchema,
      responses: [{ status: 200, description: 'The people', schema: responseSchema }],
      errors: [
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        {
          status: 404,
          description: 'Not found (also for a caller who does not manage the event)',
          schema: errorSchema,
        },
      ],
    },
  },
}
