// `GET /api/club_core/public/{clubSlug}` — the public club page (club spec API table, DD-23, DD-35, REQ-025; #29):
// the club's name, description, logo and contact (with the `contact` block) and the tiles of its public sections. No
// session: the club comes from the one slug lookup of `clubCorePublicSite`. 404 `public_page_not_found` for an unknown
// slug, 404 `public_page_disabled` when the club does not publish its page; rate-limited per client IP.
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import {
  PUBLIC_RATE_LIMIT,
  jsonResponse,
  notOkResponse,
  publicErrorSchema,
  publicLogoSchema,
  publicRoute,
  publicSite,
  routeParam,
  type PublicRouteContext,
} from '../../public-shared'

export const metadata = {
  GET: { requireAuth: false, rateLimit: { ...PUBLIC_RATE_LIMIT, keyPrefix: 'club_core_public_club' } },
}

export async function GET(_request: Request, context: PublicRouteContext): Promise<Response> {
  return publicRoute('club_core.public.club', async () => {
    const clubSlug = await routeParam(context, 'clubSlug')
    const { site } = await publicSite()
    const result = await site.clubPage(clubSlug)
    return result.status === 'ok' ? jsonResponse(result.value) : notOkResponse(result)
  })
}

const clubPageSchema = z.object({
  club: z.object({
    name: z.string(),
    slug: z.string(),
    description: z.string().nullable(),
    logo: publicLogoSchema,
    contact: z.object({ phone: z.string() }).nullable().describe('Only with the `contact` block'),
  }),
  sections: z.array(z.object({ name: z.string(), slug: z.string(), logo: publicLogoSchema })),
  blocks: z.record(z.string(), z.unknown()).describe('Blocks of optional providers of other modules (DD-28)'),
})

export const openApi: OpenApiRouteDoc = {
  tag: 'Club core',
  summary: 'Public club page',
  methods: {
    GET: {
      summary: 'Read the public club page',
      description:
        'Sessionless. The club and its public, active sections; blocks the club does not publish are absent from the response. Rate-limited per client IP.',
      responses: [{ status: 200, description: 'The club page', schema: clubPageSchema }],
      errors: [
        { status: 404, description: '`public_page_not_found`, `public_page_disabled`', schema: publicErrorSchema },
        { status: 429, description: 'Too many requests', schema: publicErrorSchema },
      ],
    },
  },
}
