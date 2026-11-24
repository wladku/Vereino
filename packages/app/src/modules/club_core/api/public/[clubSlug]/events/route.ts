// `GET /api/club_core/public/{clubSlug}/events?section=` — the public Events page P-06 (navigation spec REQ-N13, API
// table; #263): the one-off events (matches, sparrings, tournaments, camps) of the public groups in public sections and
// one entry per published club event with a live part (club events spec REQ-T10, DD-T12; #381; never its parts),
// "upcoming" (ending today or later, soonest first) and "past" (the last 60 days, newest first), optionally filtered to
// one public section by its slug (an unknown one shows all). No session: the club comes from the one slug lookup of
// `clubCorePublicSite`; the events from the optional `activities.publicEvents` contribution. 404 `public_page_not_found`
// for an unknown slug, 404 `public_events_disabled` while the club does not publish its page or the `events` block;
// rate-limited per client IP.
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { clubCoreErrors } from '../../../errors'
import {
  PUBLIC_CACHE_CONTROL,
  PUBLIC_RATE_LIMIT,
  jsonResponse,
  notOkResponse,
  publicClubAccentSchema,
  publicClubLinksSchema,
  publicClubNavSchema,
  publicErrorSchema,
  publicLogoSchema,
  publicRoute,
  publicSite,
  routeParam,
  type PublicRouteContext,
} from '../../../public-shared'

export const metadata = {
  GET: { requireAuth: false, rateLimit: { ...PUBLIC_RATE_LIMIT, keyPrefix: 'club_core_public_events' } },
}

export async function GET(request: Request, context: PublicRouteContext): Promise<Response> {
  return publicRoute('club_core.public.events', async () => {
    const clubSlug = await routeParam(context, 'clubSlug')
    const section = new URL(request.url).searchParams.get('section')
    const { site } = await publicSite()
    const result = await site.publicEvents(clubSlug, section || null)
    if (result.status === 'ok') return jsonResponse(result.value)
    if (result.status === 'not_found') return notOkResponse(result)
    const error = await clubCoreErrors.create('public_events_disabled')
    return Response.json(error.body, { status: error.status, headers: { 'Cache-Control': PUBLIC_CACHE_CONTROL } })
  })
}

const eventSchema = z.object({
  kind: z.enum(['event', 'club_event']).describe('A one-off event, or a club event with its own page'),
  name: z.string(),
  type: z.string().describe('The activity type: `match`, `sparring`, `tournament`, `camp`, …; `club_event`'),
  date: z.string().describe('Club-zone start date `YYYY-MM-DD`'),
  endDate: z.string().describe('Club-zone end date (later than `date` for a camp)'),
  startTime: z.string().describe('`HH:mm`'),
  endTime: z.string().describe('`HH:mm`'),
  place: z.string().nullable(),
  mapUrl: z.string().nullable().describe('A map link, only for an external venue'),
  cancelled: z.boolean(),
  past: z.boolean().describe('Ended before today'),
  section: z
    .object({ name: z.string(), slug: z.string() })
    .nullable()
    .describe("Null for a club event of the whole club (or of a section that is not public): the club's logo"),
  sectionLogo: publicLogoSchema,
  clubEventSlug: z.string().nullable().describe("A club event's page slug (`/p/{clubSlug}/events/{clubEventSlug}`)"),
  partsCount: z.number().int().nullable().describe("A club event's number of parts"),
  posterUrl: z.string().nullable().describe("A club event's poster"),
})

const eventsPageSchema = z.object({
  club: z.object({
    name: z.string(),
    slug: z.string(),
    logo: publicLogoSchema,
    contact: z.object({ phone: z.string() }).nullable().describe('Only with the `contact` block'),
    links: publicClubLinksSchema,
    accent: publicClubAccentSchema,
    nav: publicClubNavSchema,
  }),
  sections: z.array(z.object({ name: z.string(), slug: z.string() })).describe('The public sections (filter chips)'),
  section: z.string().nullable().describe('The section the lists are filtered to; null: all'),
  upcoming: z.array(eventSchema).describe('Ending today or later, soonest first'),
  past: z.array(eventSchema).describe('Ended before today, started in the last 60 days, newest first'),
})

export const openApi: OpenApiRouteDoc = {
  tag: 'Club core',
  summary: 'Public events page',
  methods: {
    GET: {
      summary: 'Read the public events of a club',
      description:
        'Sessionless. The one-off events of public groups in public sections and the published club events (one entry each); `section` (a public section slug, optional) narrows the lists, an unknown one shows all. Rate-limited per client IP.',
      query: z.object({ section: z.string().optional().describe('A public section slug') }),
      responses: [{ status: 200, description: 'The events page', schema: eventsPageSchema }],
      errors: [
        {
          status: 404,
          description: '`public_page_not_found`, `public_events_disabled` (the page or the `events` block is off)',
          schema: publicErrorSchema,
        },
        { status: 429, description: 'Too many requests', schema: publicErrorSchema },
      ],
    },
  },
}
