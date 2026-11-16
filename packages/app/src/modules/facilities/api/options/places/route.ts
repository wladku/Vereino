// `GET /api/facilities/options/places` (facilities parity spec, the option route of *API*; DD-R06; #275): the option
// source of every facilities place picker and list, inside the module and the caller's facilities scope, so the
// facility attendant's role needs no `club_core` feature. The live active places with their parent, kind, surface,
// capacity and whether they are a leaf, external or open to online requests. Staff with `facilities.view` read the
// places the calendar shows them — the attendant the assigned places and their descendants, other staff the club; a
// maintainer holding only `facilities.maintenance.manage` reads the places assigned to them.
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import type { RbacService } from '@open-mercato/core/modules/auth/services/rbacService'
import { commandContextForRequest, errorResponse, scopeContract, trustedScopeOf } from '@/modules/foundation'
import { inPlaces, optionPlaceIds } from '../../../lib/place-scope'
import { placeOptions } from '../../../services/directory'
import { errorSchema } from '../../shared'

export const metadata = {
  // `facilities.view` or `facilities.maintenance.manage`: checked in the handler (the metadata requires all features).
  GET: { requireAuth: true },
}

const optionSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  parentId: z.uuid().nullable(),
  parentName: z.string().nullable(),
  kind: z.string(),
  surface: z.string().nullable(),
  isLeaf: z.boolean(),
  isExternal: z.boolean(),
  capacityGroups: z.number(),
  acceptsOnlineRequests: z.boolean(),
})

export async function GET(request: Request): Promise<Response> {
  try {
    const ctx = await commandContextForRequest(request)
    const scope = ctx ? trustedScopeOf(ctx) : null
    if (!ctx || !scope) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const userId = ctx.auth?.sub
    const rbac = ctx.container.resolve<RbacService>('rbacService')
    const canView = !!userId && (await rbac.userHasAllFeatures(userId, ['facilities.view'], scope))
    const canPlan = !!userId && (await rbac.userHasAllFeatures(userId, ['facilities.maintenance.manage'], scope))
    if (!canView && !canPlan) return Response.json({ error: 'Forbidden', code: 'scope_denied' }, { status: 403 })
    const visible = optionPlaceIds(await scopeContract.resolve(ctx), canView)
    const items = (await placeOptions(ctx.container, scope))
      .filter((option) => inPlaces(visible, option.id))
      .map((option) => ({
        id: option.id,
        name: option.name,
        parentId: option.parentId,
        parentName: option.parentName,
        kind: option.kind,
        surface: option.surface,
        isLeaf: option.isLeaf,
        isExternal: option.isExternal,
        capacityGroups: option.capacityGroups,
        acceptsOnlineRequests: option.acceptsOnlineRequests,
      }))
    return Response.json({ items, total: items.length }, { headers: { 'cache-control': 'no-store' } })
  } catch (error: unknown) {
    return errorResponse(error, 'facilities.options.places')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Facilities',
  summary: 'Facility place options',
  methods: {
    GET: {
      summary: 'List the places of the facility pickers',
      description:
        'The live active places in the caller’s facilities scope, by name, with their parent, kind, surface, capacity in groups and whether they are a leaf, external or open to online requests. A bookable place is an active leaf that is not external. Staff with `facilities.view` read the club; a facility attendant reads the assigned places and their descendants; a caller with `facilities.maintenance.manage` but without `facilities.view` reads the places assigned to them.',
      responses: [
        {
          status: 200,
          description: 'The places',
          schema: z.object({ items: z.array(optionSchema), total: z.number() }),
        },
      ],
      errors: [
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        {
          status: 403,
          description: '`scope_denied`: without `facilities.view` and `facilities.maintenance.manage`',
          schema: errorSchema,
        },
      ],
    },
  },
}
