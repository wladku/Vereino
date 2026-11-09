// `GET /api/club_core/public/{clubSlug}/places/{placeSlug}/files/{fileId}` — a photo or the regulations PDF of a place
// with a public calendar (club spec DD-23, DD-29; facilities spec P-03, P-04; #124): only while the club publishes its
// `places_calendar` block and the place is active with `is_public_schedule`. Read through the platform's
// `attachmentService` with the exact owner and assignment of the place file; anything else answers the public 404.
// Rate-limited per client IP.
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
} from '../../../../../../public-shared'

export const metadata = {
  GET: { requireAuth: false, rateLimit: { ...PUBLIC_RATE_LIMIT, keyPrefix: 'club_core_public_place_file' } },
}

export async function GET(_request: Request, context: PublicRouteContext): Promise<Response> {
  return publicRoute('club_core.public.place_file', async () => {
    const clubSlug = await routeParam(context, 'clubSlug')
    const placeSlug = await routeParam(context, 'placeSlug')
    const fileId = await routeParam(context, 'fileId')
    const { site, container } = await publicSite()
    const result = await site.placeFile(clubSlug, placeSlug, fileId)
    return result.status === 'ok' ? fileResponse(container, result.value) : notOkResponse(result)
  })
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Club core',
  summary: 'Public place file',
  methods: {
    GET: {
      summary: 'Download a photo or the regulations PDF of a place with a public calendar',
      description:
        'Sessionless. A file of an active place with `is_public_schedule`, while the club publishes the `places_calendar` block. Rate-limited per client IP.',
      responses: [{ status: 200, description: 'The file', schema: z.unknown() }],
      errors: [
        { status: 404, description: '`public_page_not_found`, `public_page_disabled`', schema: publicErrorSchema },
        { status: 429, description: 'Too many requests', schema: publicErrorSchema },
      ],
    },
  },
}
