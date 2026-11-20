// `GET /api/club_core/public/{clubSlug}/events/{eventSlug}` — the tournament page P-T1 of a published club event (club
// events spec REQ-T09, DD-T11, DD-T12, DD-T13; #381): the club header and the event — its name, dates, status,
// description, place with its address and map link, poster, funders and days with their parts (time, category, type,
// our public group with its section or the club's name, the visiting teams' names, cancellations). No session: the
// club comes from the one slug lookup of `clubCorePublicSite` (DD-35); the event from the optional
// `activities.publicEvents` contribution, read inside the club's scope. No person data and no cancellation reason.
// 404 `public_page_not_found` for an unknown club, `public_events_disabled` while the club does not publish its page or
// the `events` block, `public_club_event_not_found` for an unknown event, one that is not public or one without a live
// part; rate-limited per client IP.
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { clubCoreErrors } from '../../../../errors'
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
} from '../../../../public-shared'

export const metadata = {
  GET: { requireAuth: false, rateLimit: { ...PUBLIC_RATE_LIMIT, keyPrefix: 'club_core_public_club_event' } },
}

async function coded(code: 'public_events_disabled' | 'public_club_event_not_found'): Promise<Response> {
  const error = await clubCoreErrors.create(code)
  return Response.json(error.body, { status: error.status, headers: { 'Cache-Control': PUBLIC_CACHE_CONTROL } })
}

export async function GET(_request: Request, context: PublicRouteContext): Promise<Response> {
  return publicRoute('club_core.public.club_event', async () => {
    const clubSlug = await routeParam(context, 'clubSlug')
    const eventSlug = await routeParam(context, 'eventSlug')
    const { site } = await publicSite()
    const result = await site.publicClubEvent(clubSlug, eventSlug)
    if (result.status === 'ok') return jsonResponse(result.value)
    if (result.status === 'disabled') return coded('public_events_disabled')
    return result.frame ? coded('public_club_event_not_found') : notOkResponse(result)
  })
}

const teamSchema = z.object({ name: z.string(), clubName: z.string().nullable() })

const ourTeamSchema = z
  .union([
    z.object({ groupName: z.string(), section: z.object({ name: z.string(), slug: z.string() }) }),
    z.object({ clubName: z.string() }),
  ])
  .nullable()
  .describe("A public group of a public section with its section, else the club's name; null for an open part")

const partSchema = z.object({
  title: z.string(),
  category: z.string().nullable(),
  type: z.string().describe('`tournament`, `match`, `sparring` or `other`'),
  date: z.string().describe('Club-zone date `YYYY-MM-DD`'),
  startTime: z.string().describe('`HH:mm`'),
  endTime: z.string().describe('`HH:mm`'),
  cancelled: z.boolean(),
  ourTeam: ourTeamSchema,
  visitingTeams: z.array(teamSchema).describe("The visiting teams' and their clubs' names only"),
})

const clubEventPageSchema = z.object({
  club: z.object({
    name: z.string(),
    slug: z.string(),
    logo: publicLogoSchema,
    contact: z.object({ phone: z.string() }).nullable().describe('Only with the `contact` block'),
    links: publicClubLinksSchema,
    accent: publicClubAccentSchema,
    nav: publicClubNavSchema,
  }),
  event: z.object({
    name: z.string(),
    slug: z.string(),
    status: z.enum(['planned', 'cancelled']).describe('A cancelled event carries no reason'),
    dateFrom: z.string().describe("The first part's club-zone date"),
    dateTo: z.string().describe("The last part's club-zone end date"),
    description: z.string().nullable(),
    place: z.object({ name: z.string(), address: z.string().nullable(), mapUrl: z.string().nullable() }).nullable(),
    poster: z.object({ url: z.string() }).nullable(),
    funders: z.array(z.object({ name: z.string(), logoUrl: z.string() })).describe('In upload order'),
    days: z.array(z.object({ date: z.string(), parts: z.array(partSchema) })).describe('In date order'),
  }),
})

export const openApi: OpenApiRouteDoc = {
  tag: 'Club core',
  summary: 'Public club event page',
  methods: {
    GET: {
      summary: 'Read the public page of a club event',
      description:
        'Sessionless. A club event the club made public, while the club publishes its page and the `events` block and the event has a live part. No person data. Rate-limited per client IP.',
      responses: [{ status: 200, description: 'The club event page', schema: clubEventPageSchema }],
      errors: [
        {
          status: 404,
          description:
            '`public_page_not_found`, `public_events_disabled` (the page or the `events` block is off), `public_club_event_not_found` (unknown, not public or without a part)',
          schema: publicErrorSchema,
        },
        { status: 429, description: 'Too many requests', schema: publicErrorSchema },
      ],
    },
  },
}
