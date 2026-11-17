// `GET /api/club_core/institutions/options` — the option source of institution selectors (people life-cycle spec
// REQ-L14, picker row 6; approved on #255): the live institutions of the club, names only — no contact, bank account
// or notes — so every coordinator picks an existing institution (`clubWideKinds`), e.g. for an external team. The full
// institution records stay the club administrator's (`/api/club_core/institutions`). Never cached (`no-store`).
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
const NO_STORE = { 'cache-control': 'no-store' }

const querySchema = z.object({ search: z.string().trim().max(200).optional() })
const optionSchema = z.object({ id: z.uuid(), name: z.string() })

export async function GET(request: Request): Promise<Response> {
  try {
    const ctx = await commandContextForRequest(request)
    const scope = ctx ? trustedScopeOf(ctx) : null
    if (!ctx || !scope) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE })
    await assertInScope(
      await scopeContract.resolve(ctx),
      OPTION_READ_KINDS,
      { id: scope.organizationId, ...scope },
      OPTION_READ_OPTIONS,
    )
    const { search } = querySchema.parse({ search: new URL(request.url).searchParams.get('search') ?? undefined })
    const items = await ctx.container.resolve<ClubCoreDirectory>(CLUB_CORE_DIRECTORY).institutionOptions(scope, search)
    return Response.json({ items, total: items.length }, { headers: NO_STORE })
  } catch (error: unknown) {
    const response = errorResponse(error, 'club_core.institutions.options')
    response.headers.set('cache-control', 'no-store')
    return response
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Club',
  summary: 'Institution options',
  methods: {
    GET: {
      summary: 'List the institutions for a selector',
      description:
        'The live institutions of the club by name (at most 200; `search` narrows by name), names only. Readable by every coordinator and the club administrator; the full records stay on `/api/club_core/institutions`. Not cached.',
      query: querySchema,
      responses: [
        {
          status: 200,
          description: 'The institutions',
          schema: z.object({ items: z.array(optionSchema), total: z.number() }),
        },
      ],
      errors: [
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 403, description: 'scope_denied', schema: errorSchema },
      ],
    },
  },
}
