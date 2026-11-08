// `GET /api/facilities/internal-bookings/options` — the section options of the "General purpose" booking dialog (M-11;
// #123): the live active sections of the club, by name. Coaches hold neither `club_core.view` nor a backend option
// source, so this read gives names only; the sections the caller coordinates come first.
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse, scopeContract, trustedScopeOf } from '@/modules/foundation'
import { listSections } from '../../../services/directory'
import { errorSchema } from '../../shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['facilities.bookings.create'] },
}

const responseSchema = z.object({
  sections: z.array(z.object({ id: z.uuid(), name: z.string(), coordinated: z.boolean() })),
})

export async function GET(request: Request): Promise<Response> {
  try {
    const ctx = await commandContextForRequest(request)
    const scope = ctx ? trustedScopeOf(ctx) : null
    if (!ctx || !scope) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const grants = await scopeContract.resolve(ctx)
    const coordinated = new Set(grants.flatMap((grant) => (grant.kind === 'coordinator' ? [...(grant.ids ?? [])] : [])))
    const sections = (await listSections(ctx.container, scope)).map((section) => ({
      id: section.id,
      name: section.name,
      coordinated: coordinated.has(section.id),
    }))
    sections.sort((a, b) => Number(b.coordinated) - Number(a.coordinated))
    return Response.json({ sections }, { headers: { 'cache-control': 'no-store' } })
  } catch (error: unknown) {
    return errorResponse(error, 'facilities.internal_bookings.options')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Facilities',
  summary: 'Internal booking form options',
  methods: {
    GET: {
      summary: 'List the sections a booking can be made for',
      description: 'The live active sections of the club, by name, the ones the caller coordinates first. Names only.',
      responses: [{ status: 200, description: 'The options', schema: responseSchema }],
      errors: [
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 403, description: 'Without `facilities.bookings.create`', schema: errorSchema },
      ],
    },
  },
}
