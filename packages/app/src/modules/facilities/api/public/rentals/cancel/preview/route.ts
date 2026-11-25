// `POST /api/facilities/public/rentals/cancel/preview` (facilities parity spec REQ-R17, J-R06, the preview row of
// *API, Command, and Error Contracts*; DD-R13, DD-35, DD-44; #286): what the renter's cancellation page states before
// the button — the place, the slot, the amount, whether cancelling is still free, the deadline and the payee — and
// never the renter's contact data. The token goes in the body, never in this path; it spends nothing. No session: the
// link record names the club (one lookup by its hash). 410 with no data for an unknown, spent or expired link and for
// a rental that no longer holds its slot.
import { z } from 'zod'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { errorResponse } from '@/modules/foundation'
import { rentalCancelPreviewSchema } from '../../../../../data/validators'
import { cancelPreview } from '../../../../../services/rental-links'
import { publicClubSchema, publicErrorSchema } from '../../../../public-shared'
import { enforceSessionlessLimits, tokenLimit } from '@/modules/foundation'

export const metadata = {
  POST: {
    requireAuth: false,
    rateLimit: { points: 30, duration: 600, keyPrefix: 'facilities_public_rental_cancel_preview' },
  },
}

const NO_STORE = { 'Cache-Control': 'no-store' }

export async function POST(request: Request): Promise<Response> {
  try {
    const body: unknown = await request.json().catch(() => null)
    const parsed = rentalCancelPreviewSchema.safeParse(body)
    if (!parsed.success) return Response.json({ error: 'Validation failed' }, { status: 400, headers: NO_STORE })
    const limited = await enforceSessionlessLimits(request, [
      tokenLimit('facilities_rental_cancel_token_read', parsed.data.token, 'read'),
    ])
    if (limited) return limited
    const container = await createRequestContainer()
    return Response.json(await cancelPreview(container, parsed.data.token), { headers: NO_STORE })
  } catch (error: unknown) {
    const response = errorResponse(error, 'facilities.public.rental_cancel_preview')
    response.headers.set('Cache-Control', 'no-store')
    return response
  }
}

const cancelPreviewSchema = z.object({
  placeName: z.string(),
  startsAt: z.string(),
  endsAt: z.string(),
  timeZone: z.string(),
  amount: z.number().int().describe('Minor units'),
  currency: z.string(),
  free: z.boolean().describe('True while cancelling is free; false when the payment is forfeited'),
  cancellationDeadline: z.string().describe('The last instant a cancellation is free'),
  payeeName: z.string().nullable().describe('The place owner the rental is paid to; null when the club is the payee'),
  club: publicClubSchema
    .nullable()
    .describe("The header of the club's public pages (the club the link named); null while it publishes no page"),
})

export const openApi: OpenApiRouteDoc = {
  tag: 'Facilities',
  summary: "Preview a rental's cancellation",
  methods: {
    POST: {
      summary: "Read what cancelling a rental through the renter's link would do",
      description:
        'Sessionless (REQ-R17). The token from the e-mail goes in the body; nothing is spent. No contact data. Rate-limited per client IP.',
      requestBody: { contentType: 'application/json', schema: rentalCancelPreviewSchema },
      responses: [{ status: 200, description: 'The rental the link cancels', schema: cancelPreviewSchema }],
      errors: [
        { status: 400, description: 'Invalid input', schema: publicErrorSchema },
        { status: 410, description: '`token_link_expired`, `token_link_used`', schema: publicErrorSchema },
        { status: 429, description: 'Too many requests', schema: publicErrorSchema },
      ],
    },
  },
}
