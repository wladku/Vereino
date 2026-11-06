// `GET /api/groups/member-groups` (E06-S22 #104; README M-10): the groups and sections of the signed-in member and of
// their wards on the club day — the member pages `/club/profile` and `/club/wards/[personId]` show them through the
// `groups` widget on the `vereino:club:ward:groups` spot, so `people` never imports `groups`. The feature gate is
// `people.self` (every member holds it); the persons come only from the caller's `self` and `guardian` grants, so a
// member never reads another family's groups. An option-style read: one short list, no paging.
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse, scopeContract, trustedScopeOf } from '@/modules/foundation'
import { GROUP_KINDS, MEMBERSHIP_ROLES } from '../../lib/groups-rules'
import { clubToday } from '../../services/club-clock'
import { memberGroups } from '../../services/groups-read'
import { errorSchema } from '../shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['people.self'] },
}

export async function GET(request: Request): Promise<Response> {
  try {
    const ctx = await commandContextForRequest(request)
    const trusted = ctx ? trustedScopeOf(ctx) : null
    if (!ctx || !trusted) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const scope = await scopeContract.resolve(ctx)
    const items = await memberGroups(ctx.container, trusted, scope, await clubToday(ctx.container, trusted))
    return Response.json({ items }, { headers: { 'cache-control': 'private, no-store' } })
  } catch (error: unknown) {
    return errorResponse(error, 'groups.member_groups.read')
  }
}

const memberGroupSchema = z.object({
  personId: z.uuid().describe('The member or one of their wards'),
  groupId: z.uuid(),
  groupName: z.string(),
  groupKind: z.enum(GROUP_KINDS),
  sectionId: z.uuid(),
  sectionName: z.string().nullable(),
  role: z.enum(MEMBERSHIP_ROLES),
})

export const openApi: OpenApiRouteDoc = {
  tag: 'Groups',
  summary: "The groups of the member and the member's wards",
  methods: {
    GET: {
      summary: 'Groups and sections of the signed-in member and their wards on the club day',
      description:
        "One row per membership active on the club day in an active group, for the persons of the caller's `self` and `guardian` grants only; sorted by person, section and group. No paging (a family has a handful of groups).",
      responses: [
        { status: 200, description: 'The memberships', schema: z.object({ items: z.array(memberGroupSchema) }) },
      ],
      errors: [{ status: 401, description: 'Unauthorized', schema: errorSchema }],
    },
  },
}
