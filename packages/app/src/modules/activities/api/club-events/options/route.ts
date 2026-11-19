// `GET /api/activities/club-events/options` — the option sources of the club event and part forms (club events spec
// REQ-T01, REQ-T02, REQ-T05, *API, Command, and Error Contracts*; #376): the sections the caller manages events of (the
// coordinator's sections; every section for the club administrator, who may also choose the whole club), the active
// groups of those sections with their kind and section, the bookable places of the club with `isExternal`, and the
// club's declaration kind per activity type. Names only.
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse, scopeContract, trustedScopeOf } from '@/modules/foundation'
import { ACTIVITY_TYPES } from '../../../lib/activities-rules'
import { eventPlaceOptions } from '../../../lib/member-event'
import { DECLARATION_KINDS } from '../../../lib/policy'
import { attendanceSettings, listGroupsInSections, listSectionsAmong, placeOptions } from '../../../services/directory'
import { errorSchema } from '../../shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['activities.manage'] },
}

const responseSchema = z.object({
  wholeClub: z.boolean().describe('The caller may create a whole-club event (the club administrator).'),
  sections: z.array(z.object({ id: z.uuid(), name: z.string() })),
  groups: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      kind: z.enum(['team', 'class_group']),
      sectionId: z.uuid(),
      sectionName: z.string().nullable(),
      ageCategoryLabel: z
        .string()
        .nullable()
        .describe('The category a new part proposes for the group (DD-T03); null when none is known.'),
    }),
  ),
  places: z.array(z.object({ id: z.uuid(), label: z.string(), isExternal: z.boolean() })),
  declarationKinds: z.record(z.enum(ACTIVITY_TYPES), z.enum(DECLARATION_KINDS)),
})

export async function GET(request: Request): Promise<Response> {
  try {
    const ctx = await commandContextForRequest(request)
    const scope = ctx ? trustedScopeOf(ctx) : null
    if (!ctx || !scope) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const grants = await scopeContract.resolve(ctx)
    const wholeClub = grants.some((grant) => grant.kind === 'club_admin')
    const sectionIds = wholeClub
      ? null
      : grants.flatMap((grant) => (grant.kind === 'coordinator' ? [...(grant.ids ?? [])] : []))
    const [sections, groups, places, settings] = await Promise.all([
      listSectionsAmong(ctx.container, scope, sectionIds),
      listGroupsInSections(ctx.container, scope, sectionIds),
      placeOptions(ctx.container, scope),
      attendanceSettings(ctx.container, scope),
    ])
    const sectionNames = new Map(sections.map((section) => [section.id, section.name]))
    return Response.json(
      {
        wholeClub,
        sections: sections.map((section) => ({ id: section.id, name: section.name })),
        groups: groups
          .filter((group) => sectionNames.has(group.sectionId))
          .map((group) => ({
            id: group.id,
            name: group.name,
            kind: group.kind,
            sectionId: group.sectionId,
            sectionName: sectionNames.get(group.sectionId) ?? null,
            ageCategoryLabel: null,
          })),
        places: eventPlaceOptions(places),
        declarationKinds: settings.declarationKinds,
      },
      { headers: { 'cache-control': 'no-store' } },
    )
  } catch (error: unknown) {
    return errorResponse(error, 'activities.club_events.options')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Activities',
  summary: 'Club event form options',
  methods: {
    GET: {
      summary: 'List the sections, groups and places of the club event forms',
      description:
        'The sections the caller manages club events of (`wholeClub` for the club administrator), their active groups, the bookable places of the club (leaves, "Parent › Place", each with `isExternal`) and the club’s declaration kind per activity type. Names only.',
      responses: [{ status: 200, description: 'The options', schema: responseSchema }],
      errors: [
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 403, description: 'Missing `activities.manage`', schema: errorSchema },
      ],
    },
  },
}
