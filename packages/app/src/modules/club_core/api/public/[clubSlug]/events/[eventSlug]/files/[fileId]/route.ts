// `GET /api/club_core/public/{clubSlug}/events/{eventSlug}/files/{fileId}` — the poster or a funder logo of a
// published club event (club events spec REQ-T08, REQ-T09, DD-T10, DD-T11; #381): only while the club publishes its
// page and the `events` block and the event is public with a live part. Read through the platform's
// `attachmentService` with the exact owner and assignment the `activities.publicEvents` contribution returns, inside
// the club found by its slug; anything else answers the public 404. Served with `nosniff`; rate-limited per client IP.
// A picture (event photos spec REQ-I05, BR-I01, DD-I11; #872) streams only while BR-I01 holds, `private, no-store`.
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
  GET: { requireAuth: false, rateLimit: { ...PUBLIC_RATE_LIMIT, keyPrefix: 'club_core_public_club_event_file' } },
}

export async function GET(_request: Request, context: PublicRouteContext): Promise<Response> {
  return publicRoute('club_core.public.club_event_file', async () => {
    const clubSlug = await routeParam(context, 'clubSlug')
    const eventSlug = await routeParam(context, 'eventSlug')
    const fileId = await routeParam(context, 'fileId')
    const { site, container } = await publicSite()
    const result = await site.clubEventFile(clubSlug, eventSlug, fileId)
    return result.status === 'ok' ? fileResponse(container, result.value) : notOkResponse(result)
  })
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Club core',
  summary: 'Public club event file',
  methods: {
    GET: {
      summary: 'Download the poster, a funder logo or a public picture of a public club event',
      description:
        'Sessionless. A file of a club event the club made public, while the club publishes its page and the `events` block and the event has a live part. A picture only while it is published and every person marked on it has the image consent in force (BR-I01), served `private, no-store`. Rate-limited per client IP.',
      responses: [{ status: 200, description: 'The image', schema: z.unknown() }],
      errors: [
        { status: 404, description: '`public_page_not_found`', schema: publicErrorSchema },
        { status: 429, description: 'Too many requests', schema: publicErrorSchema },
      ],
    },
  },
}
