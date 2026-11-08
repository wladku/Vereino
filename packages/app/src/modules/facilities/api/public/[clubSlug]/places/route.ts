// `GET /api/facilities/public/{clubSlug}/places` — the club's facilities with a public calendar (facilities spec P-03,
// REQ-014, TEST-024; #124): name, kind, surface, address, the first photo and whether the place takes online requests.
// No session: the club comes from `club_core`'s one slug lookup. 404 `public_place_not_found` for an unknown club,
// 404 `public_places_disabled` when the club does not publish its page or its `places_calendar` block. Rate-limited
// per client IP; shared caches only, 60 s (DD-45).
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { publicPlacesView } from '../../../../services/public-schedule'
import {
  PUBLIC_RATE_LIMIT,
  jsonResponse,
  notOkResponse,
  publicClubSchema,
  publicErrorSchema,
  publicPlaceCardSchema,
  publicRoute,
  routeParam,
  type PublicRouteContext,
} from '../../../public-shared'

export const metadata = {
  GET: { requireAuth: false, rateLimit: { ...PUBLIC_RATE_LIMIT, keyPrefix: 'facilities_public_places' } },
}

export async function GET(_request: Request, context: PublicRouteContext): Promise<Response> {
  return publicRoute('facilities.public.places', async () => {
    const container = await createRequestContainer()
    const result = await publicPlacesView(container, await routeParam(context, 'clubSlug'))
    return result.status === 'ok' ? jsonResponse(result.value) : notOkResponse(result)
  })
}

const placesSchema = z.object({ club: publicClubSchema, places: z.array(publicPlaceCardSchema) })

export const openApi: OpenApiRouteDoc = {
  tag: 'Facilities',
  summary: 'Public facilities',
  methods: {
    GET: {
      summary: 'List the facilities of a club with a public calendar',
      description:
        'Sessionless (REQ-014). Active places marked "public schedule", by name; no personal data. Rate-limited per client IP; `Cache-Control: public, s-maxage=60`.',
      responses: [{ status: 200, description: 'The places', schema: placesSchema }],
      errors: [
        {
          status: 404,
          description: '`public_place_not_found` (unknown club), `public_places_disabled` (no places calendar)',
          schema: publicErrorSchema,
        },
        { status: 429, description: 'Too many requests', schema: publicErrorSchema },
      ],
    },
  },
}
