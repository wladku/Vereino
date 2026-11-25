// `POST /api/facilities/public/requests/verify` — `facilities.rentals.verify_request` (facilities spec the verify row
// of *API, Command, and Error Contracts*, P-05; REQ-024, DD-35, DD-44; #125): the confirmation page posts the token
// from the e-mail in the body — never in this path, so access logs never carry it. No session: the token record names
// the club (one lookup by its hash). Answers the request's summary while it waits for the administrator; 410 for an
// unknown, used or expired link (no data), 409 `slot_unavailable` with the place's public slug when the slot was taken
// in the meantime. The answer carries the club's public header (`club`, #261), read inside the scope the token named,
// and once — to the person who proved the address — what they entered (`summary`, #289).
import { z } from 'zod'
import type { CommandBus, CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { errorResponse } from '@/modules/foundation'
import type { VerifyRequestResult } from '../../../../commands/requests'
import { requestVerifySchema } from '../../../../data/validators'
import { requestSummary } from '../../../../services/request-queue'
import { publicClubSchema, publicErrorSchema } from '../../../public-shared'
import { enforceSessionlessLimits, tokenLimit } from '@/modules/foundation'

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
    const limited = await enforceSessionlessLimits(request, [
      tokenLimit('facilities_request_verify_token_write', parsed.data.token, 'write'),
    ])
    if (limited) return limited
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
  club: publicClubSchema
    .nullable()
    .describe("The header of the club's public pages (the club the token named); null while it publishes no page"),
  summary: z
    .object({
      placeName: z.string(),
      placeSlug: z.string().nullable().describe("The place's public calendar; null while it has none"),
      startsAt: z.string(),
      endsAt: z.string(),
      units: z.number().int(),
      renterDisplayName: z.string().describe('The organisation or name the requester entered'),
      contactName: z.string().nullable(),
      contactEmail: z.string().nullable(),
      amount: z.number().int().nullable().describe('Indicative, minor units; null without a rate'),
      payeeName: z.string().nullable().describe('The owner institution a rental is paid to; null = the club'),
    })
    .describe(
      'What the requester entered (never the phone), answered once: only by the confirmation that spends the link (Q-R16)',
    ),
})

const slotTakenSchema = publicErrorSchema.extend({
  placeSlug: z.string().nullable().describe("The place's public calendar, the way back to it; null while it has none"),
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
        { status: 409, description: '`slot_unavailable` (taken in the meantime)', schema: slotTakenSchema },
        {
          status: 410,
          description: '`token_link_expired`, `token_link_used`; no data of the request',
          schema: publicErrorSchema,
        },
        { status: 429, description: 'Too many requests', schema: publicErrorSchema },
      ],
    },
  },
}
