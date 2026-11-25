// `POST /api/facilities/public/rentals/cancel` — `facilities.rentals.cancel_by_link` (facilities parity spec REQ-R17,
// J-R06, the public cancel row of *API, Command, and Error Contracts*; DD-R13, DD-35, DD-44; #286): the renter
// confirms the cancellation with the token from the e-mail in the body (never in this path). No session: the link
// record names the club. Answers the new status — `cancelled_free` or `cancelled_late` under the staff rules — and
// spends the link; 410 with no data for an unknown, spent or expired link and for a rental that no longer holds its
// slot.
import { z } from 'zod'
import type { CommandBus, CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { errorResponse } from '@/modules/foundation'
import type { RentalCommandResult } from '../../../../commands/rentals'
import { rentalCancelByLinkSchema } from '../../../../data/validators'
import { publicErrorSchema } from '../../../public-shared'
import { enforceSessionlessLimits, tokenLimit } from '@/modules/foundation'

export const metadata = {
  POST: {
    requireAuth: false,
    rateLimit: { points: 30, duration: 600, keyPrefix: 'facilities_public_rental_cancel' },
  },
}

const NO_STORE = { 'Cache-Control': 'no-store' }

export async function POST(request: Request): Promise<Response> {
  try {
    const body: unknown = await request.json().catch(() => null)
    const parsed = rentalCancelByLinkSchema.safeParse(body)
    if (!parsed.success) return Response.json({ error: 'Validation failed' }, { status: 400, headers: NO_STORE })
    const limited = await enforceSessionlessLimits(request, [
      tokenLimit('facilities_rental_cancel_token_write', parsed.data.token, 'write'),
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
      .execute<unknown, RentalCommandResult>('facilities.rentals.cancel_by_link', { input: parsed.data, ctx })
    return Response.json({ status: result.entity.status }, { headers: NO_STORE })
  } catch (error: unknown) {
    const response = errorResponse(error, 'facilities.public.rental_cancel')
    response.headers.set('Cache-Control', 'no-store')
    return response
  }
}

const cancelResultSchema = z.object({
  status: z
    .enum(['cancelled_free', 'cancelled_late'])
    .describe('Free before the cancellation deadline; late after it (the payment is forfeited)'),
})

export const openApi: OpenApiRouteDoc = {
  tag: 'Facilities',
  summary: "Cancel a rental through the renter's link",
  methods: {
    POST: {
      summary: "Cancel a rental with the renter's e-mailed token",
      description:
        'Sessionless (REQ-R17). Spends the single-use link and cancels the rental under the staff rules: free up to the cancellation deadline, late (the charge forfeited) after it. The token goes in the body. Rate-limited per client IP.',
      requestBody: { contentType: 'application/json', schema: rentalCancelByLinkSchema },
      responses: [{ status: 200, description: 'Cancelled', schema: cancelResultSchema }],
      errors: [
        { status: 400, description: 'Invalid input (the confirmation is missing)', schema: publicErrorSchema },
        { status: 410, description: '`token_link_expired`, `token_link_used`', schema: publicErrorSchema },
        { status: 429, description: 'Too many requests', schema: publicErrorSchema },
      ],
    },
  },
}
