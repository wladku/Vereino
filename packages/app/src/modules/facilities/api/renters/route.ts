// `GET /api/facilities/renters` (facilities parity spec the renters row of *API*; DD-R07; REQ-R14; #277): the renter
// options of the slot dialog's rental kind, inside the module and the caller's facilities scope, so the facility
// attendant's role needs no `club_core` or `people` feature. At most 20 options for a term of 2–80 characters: the
// renters of rentals on the caller's places in the last 24 months, with the category and the contact of their last
// rental; the club's institutions by name (name and type only); and persons by name only for a caller with
// `people.view`. `placeId` narrows the rental history to that place and its family (403 for a place outside the
// caller's scope). Follows `api.option-source-routes`, as `internal-bookings/options` does.
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import type { RbacService } from '@open-mercato/core/modules/auth/services/rbacService'
import { commandContextForRequest, errorResponse, scopeContract, trustedScopeOf } from '@/modules/foundation'
import { renterSearchQuerySchema } from '../../data/validators'
import { RENTER_TYPES } from '../../lib/rentals'
import { inPlaces, rentalPlaceIds } from '../../lib/place-scope'
import { placeFamilyIds } from '../../services/occupancy'
import { searchRenters } from '../../services/renters'
import { errorSchema } from '../shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['facilities.rentals.manage'] },
}

const optionSchema = z.object({
  renterType: z.enum(RENTER_TYPES),
  renterId: z.uuid().nullable().describe('Null for a renter not in the register'),
  displayName: z.string(),
  lastCategory: z.string().nullable().describe('The renter category of the renter’s last rental on the caller’s places'),
  lastContact: z
    .object({ name: z.string().nullable(), phone: z.string().nullable(), email: z.string().nullable() })
    .nullable()
    .describe('The contact of the renter’s last rental on the caller’s places'),
})

const responseSchema = z.object({ items: z.array(optionSchema), total: z.number() })

export async function GET(request: Request): Promise<Response> {
  try {
    const ctx = await commandContextForRequest(request)
    const scope = ctx ? trustedScopeOf(ctx) : null
    if (!ctx || !scope) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const parsed = renterSearchQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
    if (!parsed.success) {
      return Response.json({ error: 'Invalid query', code: 'renter_search_invalid' }, { status: 400 })
    }
    const grants = await scopeContract.resolve(ctx)
    // The places whose rentals the caller manages, decided before any matching; none → nothing to search in.
    const scoped = rentalPlaceIds(grants, true)
    if (scoped !== null && scoped.length === 0) {
      return Response.json({ error: 'Forbidden', code: 'scope_denied' }, { status: 403 })
    }
    let placeIds = scoped
    if (parsed.data.placeId) {
      if (!inPlaces(scoped, parsed.data.placeId)) {
        return Response.json({ error: 'Forbidden', code: 'scope_denied' }, { status: 403 })
      }
      const family = await placeFamilyIds(ctx.container, scope, parsed.data.placeId)
      placeIds = family.filter((id) => inPlaces(scoped, id))
    }
    const userId = ctx.auth?.sub
    const rbac = ctx.container.resolve<RbacService>('rbacService')
    const canViewPeople = !!userId && (await rbac.userHasAllFeatures(userId, ['people.view'], scope))
    const items = await searchRenters(ctx.container, scope, {
      search: parsed.data.search,
      placeIds,
      canViewPeople,
      now: new Date(),
    })
    return Response.json({ items, total: items.length }, { headers: { 'cache-control': 'no-store' } })
  } catch (error: unknown) {
    return errorResponse(error, 'facilities.renters')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Facilities',
  summary: 'Renter options',
  methods: {
    GET: {
      summary: 'Search the renters a rental can be entered for',
      description:
        'At most 20 options for `search` (2–80 characters): the renters of rentals on the caller’s places in the last 24 months (most recent first, with the renter category and the contact of their last rental), the club’s institutions by name (name and type only) and, only for a caller with `people.view`, persons by name. The club administrator reads the rentals of every place, a facility attendant those of the places of their assignments; `placeId` narrows the rentals to that place, its ancestors and descendants.',
      query: renterSearchQuerySchema,
      responses: [{ status: 200, description: 'The renter options', schema: responseSchema }],
      errors: [
        { status: 400, description: '`renter_search_invalid`: `search` shorter than 2 or longer than 80', schema: errorSchema },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        {
          status: 403,
          description: 'Without `facilities.rentals.manage`; `scope_denied` for a place outside the caller’s scope',
          schema: errorSchema,
        },
      ],
    },
  },
}
