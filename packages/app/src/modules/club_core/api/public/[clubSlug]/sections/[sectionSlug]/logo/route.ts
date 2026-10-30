// `GET /api/club_core/public/{clubSlug}/sections/{sectionSlug}/logo` — a public section's own logo (club spec glossary
// *Logo*, REQ-028; #29). A section without its own logo answers 404: its pages point to the club logo instead (the
// effective logo). Read through the platform's `attachmentService` with the exact owner and assignment of the section
// logo; rate-limited per client IP.
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
} from '../../../../../public-shared'

export const metadata = {
  GET: { requireAuth: false, rateLimit: { ...PUBLIC_RATE_LIMIT, keyPrefix: 'club_core_public_logo' } },
}

export async function GET(_request: Request, context: PublicRouteContext): Promise<Response> {
  return publicRoute('club_core.public.section_logo', async () => {
    const clubSlug = await routeParam(context, 'clubSlug')
    const sectionSlug = await routeParam(context, 'sectionSlug')
    const { site, container } = await publicSite()
    const result = await site.sectionLogo(clubSlug, sectionSlug)
    return result.status === 'ok' ? fileResponse(container, result.value) : notOkResponse(result)
  })
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Club core',
  summary: 'Public section logo',
  methods: {
    GET: {
      summary: "Read a public section's own logo",
      description: 'Sessionless. The PNG, JPEG or WebP image of the section logo. Rate-limited per client IP.',
      responses: [{ status: 200, description: 'The image', schema: z.unknown() }],
      errors: [
        { status: 404, description: '`public_page_not_found`, `public_page_disabled`', schema: publicErrorSchema },
        { status: 429, description: 'Too many requests', schema: publicErrorSchema },
      ],
    },
  },
}
