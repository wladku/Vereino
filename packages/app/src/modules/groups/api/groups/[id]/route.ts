// `GET /api/groups/groups/{id}` — one group with its section and season names and the caller's acting role, guarded by
// `assertInScope` with the list's grant kinds. The acting role is the least-privileged grant that contains the group:
// a coach or assistant of the group reads it as `coach` (club spec *Record scope*; #26's deferred coach acting role).
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import {
  assertInScope,
  commandContextForRequest,
  errorResponse,
  scopeContract,
  trustedScopeOf,
} from '@/modules/foundation'
import { findGroup, sectionNames, seasonNames } from '../../../services/groups-read'
import { GROUP_READ_KINDS, errorSchema, groupDetailSchema } from '../../shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['groups.view'] },
}

const paramsSchema = z.object({ id: z.uuid() })

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = paramsSchema.parse(await context.params)
    const ctx = await commandContextForRequest(request)
    const scope = ctx ? trustedScopeOf(ctx) : null
    if (!ctx || !scope) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const group = await findGroup(ctx.container, scope, id)
    if (!group) return Response.json({ error: 'Not found' }, { status: 404 })
    const actingRole = await assertInScope(await scopeContract.resolve(ctx), GROUP_READ_KINDS, {
      id: group.id,
      tenantId: group.tenantId,
      organizationId: group.organizationId,
      sectionId: group.sectionId,
      groupId: group.id,
    })
    const [sections, seasons] = await Promise.all([
      sectionNames(ctx.container, scope, [group.sectionId]),
      seasonNames(ctx.container, scope, group.seasonId ? [group.seasonId] : []),
    ])
    return Response.json({
      id: group.id,
      sectionId: group.sectionId,
      sectionName: sections.get(group.sectionId) ?? null,
      name: group.name,
      kind: group.kind,
      league: group.league ?? null,
      seasonId: group.seasonId ?? null,
      seasonName: group.seasonId ? (seasons.get(group.seasonId) ?? null) : null,
      description: group.description ?? null,
      isActive: group.isActive,
      createdAt: group.createdAt.toISOString(),
      updatedAt: group.updatedAt.toISOString(),
      actingRole,
    })
  } catch (error: unknown) {
    return errorResponse(error, 'groups.groups.detail')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Groups',
  summary: 'Group detail',
  methods: {
    GET: {
      summary: 'Read one group',
      description:
        "Returns the group when it is in the caller's record scope (its coach or assistant, the coordinator of its section, the club administrator), with the role the caller reads it as.",
      responses: [{ status: 200, description: 'The group', schema: groupDetailSchema }],
      errors: [
        { status: 403, description: 'scope_denied', schema: errorSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
      ],
    },
  },
}
