// `GET /api/activities/public/{clubSlug}/sessions/{occurrenceId}` — the public session page (club spec DD-17;
// foundation III DD-M14, REQ-M08): the activity name, the date, the time and the status of one session, under the
// club's public slug. No session; rate-limited per client IP. An unknown slug, a club without a published page, an
// unknown session and a session of another club all answer the same 404 `public_session_not_found` without detail.
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { errorResponse } from '@/modules/foundation'
import { activitiesErrors } from '../../../../errors'
import { publicSessionPage } from '../../../../../services/public-session'
import { OCCURRENCE_STATUSES } from '../../../../../lib/activities-rules'

/** 120 requests per minute per client IP, like the other public pages (S8.6); disabled under integration tests. */
export const metadata = {
  GET: { requireAuth: false, rateLimit: { points: 120, duration: 60, keyPrefix: 'activities_public_session' } },
}

type RouteContext = { params: Promise<{ clubSlug?: string; occurrenceId?: string }> }

/** Pages without a session branch may use shared caching (S8.6). */
const CACHE_CONTROL = 'public, s-maxage=60'

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  try {
    const params = await context.params
    const container = await createRequestContainer()
    const page = await publicSessionPage(container, params.clubSlug ?? '', params.occurrenceId ?? '')
    if (!page) {
      const error = await activitiesErrors.create('public_session_not_found')
      return Response.json(error.body, { status: error.status, headers: { 'Cache-Control': CACHE_CONTROL } })
    }
    return Response.json(page, { headers: { 'Cache-Control': CACHE_CONTROL } })
  } catch (error: unknown) {
    return errorResponse(error, 'activities.public.session')
  }
}

const logoSchema = z.object({
  url: z.string().nullable(),
  source: z.enum(['section', 'club', 'initial']),
  initial: z.string(),
})

const pageSchema = z.object({
  club: z.object({
    name: z.string(),
    slug: z.string(),
    logo: logoSchema,
    contact: z
      .object({ phone: z.string() })
      .nullable()
      .describe('The club phone of the page footer, only with the `contact` block'),
    links: z
      .object({ rules: z.string().nullable(), privacyPolicy: z.string().nullable() })
      .describe("The club's rules and privacy policy in the page footer; null while not set"),
  }),
  session: z.object({
    activityName: z.string(),
    occurrenceDate: z.string(),
    startAt: z.string(),
    endAt: z.string(),
    gatheringAt: z.string().nullable().describe('The gathering time before the start (club spec DD-43), or null.'),
    timeZone: z.string(),
    status: z.enum(OCCURRENCE_STATUSES),
  }),
})

export const openApi: OpenApiRouteDoc = {
  tag: 'Activities',
  summary: 'Public session page',
  methods: {
    GET: {
      summary: 'Read the public page of one session',
      description:
        'Sessionless (DD-17). Only the activity name, the date, the time, the gathering time and the status of the session; no names, no roster. Rate-limited per client IP.',
      responses: [{ status: 200, description: 'The session page', schema: pageSchema }],
      errors: [
        {
          status: 404,
          description: '`public_session_not_found` — the same answer for every unknown or foreign target',
          schema: z.object({ error: z.string(), code: z.string().optional() }),
        },
        { status: 429, description: 'Too many requests', schema: z.object({ error: z.string() }) },
      ],
    },
  },
}
