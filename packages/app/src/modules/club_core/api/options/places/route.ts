// `GET /api/club_core/options/places` — the option source of place selectors (club spec *UI and Interaction
// Contracts*: `/api/club_core/options/places`, #31): the live active places of the club with their parent's name, their
// capacity and whether they are a leaf (sessions and bookings point to a leaf). Names only — no contacts, address or
// regulations — so every coordinator reads the whole list (`clubWideKinds`); the full place records stay the club
// administrator's (`/api/club_core/places`).
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import type { GrantKind, ScopeMatchOptions } from '@vereino/core'
import {
  assertInScope,
  commandContextForRequest,
  errorResponse,
  scopeContract,
  trustedScopeOf,
} from '@/modules/foundation'
import { CLUB_CORE_DIRECTORY } from '../../../di'
import type { ClubCoreDirectory } from '../../../services/directory'
import { errorSchema } from '../../shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['club_core.view'] },
}

const OPTION_READ_KINDS: readonly GrantKind[] = ['coordinator', 'club_admin']
const OPTION_READ_OPTIONS: ScopeMatchOptions = { clubWideKinds: ['coordinator'] }

const optionSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  parentName: z.string().nullable(),
  capacityGroups: z.number(),
  isLeaf: z.boolean(),
})

export async function GET(request: Request): Promise<Response> {
  try {
    const ctx = await commandContextForRequest(request)
    const scope = ctx ? trustedScopeOf(ctx) : null
    if (!ctx || !scope) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    await assertInScope(
      await scopeContract.resolve(ctx),
      OPTION_READ_KINDS,
      { id: scope.organizationId, ...scope },
      OPTION_READ_OPTIONS,
    )
    const items = await ctx.container.resolve<ClubCoreDirectory>(CLUB_CORE_DIRECTORY).placeOptions(scope)
    return Response.json({ items, total: items.length })
  } catch (error: unknown) {
    return errorResponse(error, 'club_core.options.places')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Club',
  summary: 'Place options',
  methods: {
    GET: {
      summary: 'List the places for a selector',
      description:
        'The live active places of the club with the name of their parent, their capacity in groups and whether they are a leaf. Readable by every coordinator and the club administrator.',
      responses: [
        {
          status: 200,
          description: 'The places',
          schema: z.object({ items: z.array(optionSchema), total: z.number() }),
        },
      ],
      errors: [{ status: 403, description: 'scope_denied', schema: errorSchema }],
    },
  },
}
