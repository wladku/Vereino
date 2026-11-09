// `POST /api/facilities/public/requests/verify` — `facilities.rentals.verify_request` (facilities spec the verify row
// of *API, Command, and Error Contracts*, P-05; REQ-024, DD-35, DD-44; #125): the confirmation page posts the token
// from the e-mail in the body — never in this path, so access logs never carry it. No session: the token record names
// the club (one lookup by its hash). Answers the request's summary while it waits for the administrator; 410 for an
// unknown, used or expired link, 409 `slot_unavailable` when the slot was taken in the meantime.
import { z } from 'zod'
import type { CommandBus, CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { errorResponse } from '@/modules/foundation'
import type { VerifyRequestResult } from '../../../../commands/requests'
import { requestVerifySchema } from '../../../../data/validators'
import { requestSummary } from '../../../../services/request-queue'
import { publicErrorSchema } from '../../../public-shared'

export const metadata = {
  POST: {
    requireAuth: false,
    rateLimit: { points: 30, duration: 600, keyPrefix: 'facilities_public_request_verify' },
  },
}

const NO_STORE = { 'Cache-Control': 'no-store' }

export async function POST(request: Request): Promise<Response> {
  try {
    const body: unknown = await request.json().catch(() => null)
    const parsed = requestVerifySchema.safeParse(body)
    if (!parsed.success) return Response.json({ error: 'Validation failed' }, { status: 400, headers: NO_STORE })
    const container = await createRequestContainer()
    const ctx: CommandRuntimeContext = {
      container,
      auth: null,
      organizationScope: null,
      selectedOrganizationId: null,
      organizationIds: null,
      request,
    }
    const { result } = await container
      .resolve<CommandBus>('commandBus')
      .execute<unknown, VerifyRequestResult>('facilities.rentals.verify_request', { input: parsed.data, ctx })
    return Response.json(await requestSummary(container, result.entity, result.timeZone), { headers: NO_STORE })
  } catch (error: unknown) {
    const response = errorResponse(error, 'facilities.public.request_verify')
    response.headers.set('Cache-Control', 'no-store')
    return response
  }
}

const requestSummarySchema = z.object({
  status: z.literal('pending_approval'),
  placeName: z.string(),
  startsAt: z.string(),
  endsAt: z.string(),
  timeZone: z.string(),
  units: z.number().int(),
  amount: z.number().int().nullable().describe('Indicative, minor units; null without a rate'),
  currency: z.string(),
  holdExpiresAt: z.string().describe('The administrator decides until then'),
})

export const openApi: OpenApiRouteDoc = {
  tag: 'Facilities',
  summary: 'Confirm a booking request',
  methods: {
    POST: {
      summary: 'Confirm a booking request with the e-mailed token',
      description:
        'Sessionless (REQ-024). Spends the 1-hour link and holds the slot for 48 hours against other requests while the administrator decides. The token goes in the body. Rate-limited per client IP.',
      requestBody: { contentType: 'application/json', schema: requestVerifySchema },
      responses: [{ status: 200, description: 'Awaiting the administrator', schema: requestSummarySchema }],
      errors: [
        { status: 400, description: 'Invalid input', schema: publicErrorSchema },
        { status: 409, description: '`slot_unavailable` (taken in the meantime)', schema: publicErrorSchema },
        { status: 410, description: '`token_link_expired`, `token_link_used`', schema: publicErrorSchema },
        { status: 429, description: 'Too many requests', schema: publicErrorSchema },
      ],
    },
  },
}
