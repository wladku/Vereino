// `GET /api/club_core/public/{clubSlug}/logo` — the club logo for the public pages (club spec glossary *Logo*,
// REQ-028; #29): the image file of the club found by its slug, read through the platform's `attachmentService` with
// the exact owner and assignment of the club logo. 404 `public_page_not_found` when the club has no logo or the slug is
// unknown, 404 `public_page_disabled` when the club does not publish its page; rate-limited per client IP.
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import {
  PUBLIC_RATE_LIMIT,
  fileResponse,
  notOkResponse,
  publicErrorSchema,
  publicRoute,
  publicSite,
  routeParam,
  type PublicRouteContext,
} from '../../../public-shared'

export const metadata = {
  GET: { requireAuth: false, rateLimit: { ...PUBLIC_RATE_LIMIT, keyPrefix: 'club_core_public_logo' } },
}

export async function GET(_request: Request, context: PublicRouteContext): Promise<Response> {
  return publicRoute('club_core.public.club_logo', async () => {
    const clubSlug = await routeParam(context, 'clubSlug')
    const { site, container } = await publicSite()
    const result = await site.clubLogo(clubSlug)
    return result.status === 'ok' ? fileResponse(container, result.value) : notOkResponse(result)
  })
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Club core',
  summary: 'Public club logo',
  methods: {
    GET: {
      summary: 'Read the club logo of a public page',
      description: 'Sessionless. The PNG, JPEG or WebP image of the club logo. Rate-limited per client IP.',
      responses: [{ status: 200, description: 'The image', schema: z.unknown() }],
      errors: [
        { status: 404, description: '`public_page_not_found`, `public_page_disabled`', schema: publicErrorSchema },
        { status: 429, description: 'Too many requests', schema: publicErrorSchema },
      ],
    },
  },
}
