// `GET /api/facilities/public/{clubSlug}/places/{placeSlug}/schedule?month=YYYY-MM` — the public month of a place
// (facilities spec P-04, REQ-014, TEST-024; #124): per day the opening windows and stretches of time with a state —
// open to public, club training hours, bookable, closed, taken by the club, booked, requested — plus the place's
// opening hours, rates, rules and the club phone. It names no renter, person, group or activity and carries no record
// id. Without `month` the club's current month; a month before the previous one or beyond twelve ahead answers 400.
// 404 `public_place_not_found` for an unknown club or place or a place without a public calendar, 404
// `public_places_disabled` without the club's `places_calendar` block. Rate-limited per client IP; shared caches
// only, 60 s (DD-45).
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { PUBLIC_SLOT_STATES } from '../../../../../../lib/public-schedule'
import { RENTER_CATEGORIES } from '../../../../../../lib/rates'
import { publicScheduleView } from '../../../../../../services/public-schedule'
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
} from '../../../../../public-shared'

export const metadata = {
  GET: { requireAuth: false, rateLimit: { ...PUBLIC_RATE_LIMIT, keyPrefix: 'facilities_public_schedule' } },
}

export async function GET(request: Request, context: PublicRouteContext): Promise<Response> {
  return publicRoute('facilities.public.schedule', async () => {
    const month = new URL(request.url).searchParams.get('month') ?? undefined
    const container = await createRequestContainer()
    const result = await publicScheduleView(
      container,
      await routeParam(context, 'clubSlug'),
      await routeParam(context, 'placeSlug'),
      month,
      new Date(),
    )
    return result.status === 'ok' ? jsonResponse(result.value) : notOkResponse(result)
  })
}

const windowSchema = z.object({ from: z.string(), to: z.string() })

const scheduleSchema = z.object({
  club: publicClubSchema,
  place: publicPlaceCardSchema.extend({
    photoUrls: z.array(z.string()),
    regulationsText: z.string().nullable(),
    regulationsUrl: z.string().nullable().describe('The regulations PDF, or null'),
  }),
  month: z.string().describe('YYYY-MM'),
  previousMonth: z.string().nullable(),
  nextMonth: z.string().nullable(),
  timeZone: z.string(),
  currency: z.string(),
  openingHours: z
    .object({
      seasons: z.array(
        z.object({
          from: z.string(),
          to: z.string(),
          windows: z.array(z.object({ weekday: z.number(), from: z.string(), to: z.string() })),
        }),
      ),
    })
    .nullable()
    .describe('The effective opening hours (DD-41); null = no limit'),
  rates: z.array(
    z.object({
      category: z.enum(RENTER_CATEGORIES),
      pricePer90: z.number().describe('Minor units per 90-minute unit'),
      seasonFrom: z.string().nullable(),
      seasonTo: z.string().nullable(),
      includesLighting: z.boolean(),
    }),
  ),
  phone: z.string().nullable(),
  days: z.array(
    z.object({
      date: z.string(),
      opening: z.array(windowSchema).nullable().describe('null = no limit, [] = closed all day'),
      slots: z.array(
        windowSchema.extend({
          state: z.enum(PUBLIC_SLOT_STATES),
          canRequest: z.boolean().describe('A bookable stretch a guest may request (E08-S05)'),
        }),
      ),
    }),
  ),
})

export const openApi: OpenApiRouteDoc = {
  tag: 'Facilities',
  summary: 'Public facility calendar',
  methods: {
    GET: {
      summary: 'Read a month of the public calendar of a facility',
      description:
        'Sessionless (REQ-014). States only — no renter, person, group or activity names and no record ids. Query `month=YYYY-MM` (default: the current club month; from one month back to twelve ahead). Rate-limited per client IP; `Cache-Control: public, s-maxage=60`.',
      query: z.object({ month: z.string().optional() }),
      responses: [{ status: 200, description: 'The month', schema: scheduleSchema }],
      errors: [
        { status: 400, description: '`public_schedule_month_invalid`', schema: publicErrorSchema },
        {
          status: 404,
          description: '`public_place_not_found`, `public_places_disabled`',
          schema: publicErrorSchema,
        },
        { status: 429, description: 'Too many requests', schema: publicErrorSchema },
      ],
    },
  },
}
