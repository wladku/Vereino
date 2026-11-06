// `GET /api/activities/events/options` — the option sources of the coach's phone form for a one-off event (club spec
// REQ-027, *UI architecture* "New event"; #140): the groups the caller coaches today (the `coach` grant of the record
// scope, with their section's name) and the bookable leaves of the club's places. The coach role holds neither
// `groups.manage` nor `club_core.view`, so the backend option sources are closed to it; this read gives names only.
// `POST /api/activities/events` still authorizes the chosen group (403 outside the coach's groups).
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse, scopeContract, trustedScopeOf } from '@/modules/foundation'
import { eventGroupOptions, eventPlaceOptions } from '../../../lib/member-event'
import { findSections, listGroupsAmong, placeOptions } from '../../../services/directory'
import { errorSchema } from '../../shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['activities.events.create'] },
}

const responseSchema = z.object({
  groups: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      kind: z.enum(['team', 'class_group']),
      sectionName: z.string().nullable(),
    }),
  ),
  places: z.array(z.object({ id: z.uuid(), label: z.string() })),
})

export async function GET(request: Request): Promise<Response> {
  try {
    const ctx = await commandContextForRequest(request)
    const scope = ctx ? trustedScopeOf(ctx) : null
    if (!ctx || !scope) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const grants = await scopeContract.resolve(ctx)
    const groupIds = grants.flatMap((grant) => (grant.kind === 'coach' ? [...(grant.ids ?? [])] : []))
    const [groups, places] = await Promise.all([
      listGroupsAmong(ctx.container, scope, groupIds),
      placeOptions(ctx.container, scope),
    ])
    const sections = await findSections(
      ctx.container,
      scope,
      groups.map((group) => group.sectionId),
    )
    const sectionNames = new Map([...sections.values()].map((section) => [section.id, section.name]))
    return Response.json(
      { groups: eventGroupOptions(groups, sectionNames), places: eventPlaceOptions(places) },
      { headers: { 'cache-control': 'no-store' } },
    )
  } catch (error: unknown) {
    return errorResponse(error, 'activities.events.options')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Activities',
  summary: 'One-off event form options',
  methods: {
    GET: {
      summary: 'List the groups and places of the coach’s event form',
      description:
        'The live active groups the caller coaches today (an active `coach` / `assistant` membership), by section and name, and the bookable places of the club (leaves of the place tree, labelled "Parent › Place"). Names only.',
      responses: [{ status: 200, description: 'The options', schema: responseSchema }],
      errors: [{ status: 401, description: 'Unauthorized', schema: errorSchema }],
    },
  },
}
