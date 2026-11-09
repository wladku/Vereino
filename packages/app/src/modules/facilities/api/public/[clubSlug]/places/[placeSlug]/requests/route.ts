// `POST /api/facilities/public/{clubSlug}/places/{placeSlug}/requests` — `facilities.rentals.submit_request`
// (facilities spec the public request row of *API, Command, and Error Contracts*, P-04; REQ-024, V-10, DD-44; #125):
// a guest asks for a bookable slot. No session: the club and the place come from the command's one slug lookup. Two
// rate limits (V-10): per client IP in `metadata` (enforced by the API dispatcher, failing open) and per e-mail here,
// after the input is valid and before the command — keyed by the hash of the normalized address alone and failing
// closed (503 when the limiter's store is down). Both are disabled under `OM_INTEGRATION_TEST`. Answers 202
// `{ status: 'pending_verification' }`: the link goes only by e-mail, never in the response.
import { z } from 'zod'
import type { CommandBus, CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { checkRateLimit, RATE_LIMIT_ERROR_FALLBACK } from '@open-mercato/shared/lib/ratelimit/helpers'
import type { RateLimiterService } from '@open-mercato/shared/lib/ratelimit/service'
import { errorResponse } from '@/modules/foundation'
import { publicRequestSchema } from '../../../../../../data/validators'
import { requestEmailLimit } from '../../../../../../lib/requests'
import { publicErrorSchema, routeParam, type PublicRouteContext } from '../../../../../public-shared'

/** 10 requests per 10 minutes per client IP (S8.6 "public forms"). */
export const metadata = {
  POST: {
    requireAuth: false,
    rateLimit: { points: 10, duration: 600, keyPrefix: 'facilities_public_request' },
  },
}

const NO_STORE = { 'Cache-Control': 'no-store' }

function noStore(response: Response): Response {
  response.headers.set('Cache-Control', 'no-store')
  return response
}

export async function POST(request: Request, context: PublicRouteContext): Promise<Response> {
  try {
    const body: unknown = await request.json().catch(() => null)
    const parsed = publicRequestSchema.safeParse(body)
    if (!parsed.success) {
      return Response.json(
        { error: 'Validation failed', details: parsed.error.issues },
        { status: 400, headers: NO_STORE },
      )
    }
    const container = await createRequestContainer()
    // Fail closed: without the limiter the per-e-mail limit cannot be enforced (V-10).
    if (!container.hasRegistration('rateLimiterService')) {
      return Response.json({ error: 'Service temporarily unavailable.' }, { status: 503, headers: NO_STORE })
    }
    const limit = requestEmailLimit(parsed.data.contactEmail)
    const limited = await checkRateLimit(
      container.resolve<RateLimiterService>('rateLimiterService'),
      limit.config,
      limit.key,
      RATE_LIMIT_ERROR_FALLBACK,
      limit.options,
    )
    if (limited) return noStore(limited)
    // No session: the slugs name the club inside the command (DD-35).
    const ctx: CommandRuntimeContext = {
      container,
      auth: null,
      organizationScope: null,
      selectedOrganizationId: null,
      organizationIds: null,
      request,
    }
    await container.resolve<CommandBus>('commandBus').execute('facilities.rentals.submit_request', {
      input: {
        ...parsed.data,
        clubSlug: await routeParam(context, 'clubSlug'),
        placeSlug: await routeParam(context, 'placeSlug'),
      },
      ctx,
    })
    return Response.json({ status: 'pending_verification' }, { status: 202, headers: NO_STORE })
  } catch (error: unknown) {
    return noStore(errorResponse(error, 'facilities.public.request'))
  }
}

const acceptedSchema = z.object({ status: z.literal('pending_verification') })

export const openApi: OpenApiRouteDoc = {
  tag: 'Facilities',
  summary: 'Request a booking',
  methods: {
    POST: {
      summary: 'Request a booking of a public place',
      description:
        'Sessionless (REQ-024). 1–4 units of 90 minutes in a `reservable_paid` zone of a place that takes online requests, free of sessions, rentals, club bookings, closures and other confirmed requests. `website` is a honeypot (leave it empty). Stores the request as `pending_verification` and e-mails a confirmation link valid for 1 hour; the response never carries it. Rate-limited per client IP and per e-mail address.',
      requestBody: { contentType: 'application/json', schema: publicRequestSchema },
      responses: [{ status: 202, description: 'The confirmation e-mail is on its way', schema: acceptedSchema }],
      errors: [
        { status: 400, description: 'Invalid input', schema: publicErrorSchema },
        {
          status: 403,
          description: '`requests_not_accepted` (the place or the club takes no online requests)',
          schema: publicErrorSchema,
        },
        { status: 404, description: '`public_place_not_found`, `public_places_disabled`', schema: publicErrorSchema },
        {
          status: 409,
          description: '`slot_unavailable` (taken, closed or held by another request)',
          schema: publicErrorSchema,
        },
        {
          status: 422,
          description:
            '`request_zone_invalid`, `request_regulations_required`, `request_refused` (honeypot), `rental_units_invalid`, `rental_rate_missing`, `rental_start_past`',
          schema: publicErrorSchema,
        },
        { status: 429, description: 'Too many requests (per IP or per e-mail)', schema: publicErrorSchema },
        { status: 503, description: 'The per-e-mail limiter is unavailable', schema: publicErrorSchema },
      ],
    },
  },
}
