// `GET /api/people/invitations/pending` (personal invitation link spec REQ-IL02, IL-D03; Q-IL05 approved 2026-11-26;
// #868): the guardians with a pending account invitation in the caller's reach — the club administrator's whole club,
// a coach's coached groups, a coordinator's coordinated sections — with their children's first names and groups.
// Names only, no contact data. `groupId` / `sectionId` narrow the list; ids outside the reach yield an empty list.
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse, scopeContract, trustedScopeOf } from '@/modules/foundation'
import { shareReach } from '../../../lib/invitation-links'
import { listPendingFamilies } from '../../../services/invitation-links'
import { errorSchema } from '../../shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['people.invitations.share'] },
}

const querySchema = z.object({
  groupId: z.uuid().optional(),
  sectionId: z.uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
})

export async function GET(request: Request): Promise<Response> {
  try {
    const query = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams))
    const ctx = await commandContextForRequest(request)
    const scope = ctx ? trustedScopeOf(ctx) : null
    if (!ctx?.auth || !scope) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const reach = shareReach(await scopeContract.resolve(ctx))
    const families = await listPendingFamilies(ctx.container, scope, reach, query)
    const start = (query.page - 1) * query.pageSize
    return Response.json({
      items: families.slice(start, start + query.pageSize),
      total: families.length,
      page: query.page,
      pageSize: query.pageSize,
      totalPages: Math.max(1, Math.ceil(families.length / query.pageSize)),
    })
  } catch (error: unknown) {
    return errorResponse(error, 'people.invitations.pending')
  }
}

const familySchema = z.object({
  personId: z.uuid(),
  displayName: z.string(),
  invitedAt: z.string().nullable(),
  children: z.array(z.object({ firstName: z.string(), groupName: z.string() })),
})

export const openApi: OpenApiRouteDoc = {
  tag: 'People',
  summary: 'Families with a pending invitation',
  methods: {
    GET: {
      summary: 'List the guardians with a pending account invitation in the caller’s reach',
      description:
        "The club administrator's whole club, a coach's coached groups, a coordinator's coordinated sections: each active guardian whose account is invited (no password, never signed in) and who has a child in one of those groups today, with the children's first names and groups. Names only — no e-mail or phone. `groupId` or `sectionId` narrow the list; ids outside the reach yield an empty list.",
      query: querySchema,
      responses: [
        {
          status: 200,
          description: 'The families',
          schema: z.object({
            items: z.array(familySchema),
            total: z.number(),
            page: z.number(),
            pageSize: z.number(),
            totalPages: z.number(),
          }),
        },
      ],
      errors: [{ status: 400, description: 'Invalid query', schema: errorSchema }],
    },
  },
}
