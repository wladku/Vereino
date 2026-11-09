// `GET /api/facilities/rentals/requests` (facilities spec B-25 `/backend/facilities/requests` and the B-01 widget
// "Requests awaiting approval"; REQ-024; #125): the confirmed online requests whose 48-hour hold is still valid, the
// soonest expiry first, for the club administrator (`facilities.rentals.approve`, the club-wide grant): the place, the
// slot, the requester and their contact (decrypted), the category, the purpose, the indicative amount, the time to
// expiry, the entry-ban hint and the entries colliding with the slot (kind and times only).
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import {
  assertInScope,
  commandContextForRequest,
  errorResponse,
  scopeContract,
  trustedScopeOf,
} from '@/modules/foundation'
import { MANAGE_KINDS, facilityTarget } from '../../../commands/shared'
import { requestQueueQuerySchema } from '../../../data/validators'
import { requestQueue } from '../../../services/request-queue'
import { errorSchema } from '../../shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['facilities.view', 'facilities.rentals.approve'] },
}

export async function GET(request: Request): Promise<Response> {
  try {
    const ctx = await commandContextForRequest(request)
    const scope = ctx ? trustedScopeOf(ctx) : null
    if (!ctx || !scope) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const parsed = requestQueueQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
    if (!parsed.success) return Response.json({ error: 'Invalid query' }, { status: 400 })
    await assertInScope(
      await scopeContract.resolve(ctx),
      MANAGE_KINDS,
      facilityTarget({ id: scope.organizationId, ...scope }),
    )
    const queue = await requestQueue(ctx.container, scope, parsed.data, new Date())
    return Response.json(queue, { headers: { 'cache-control': 'no-store' } })
  } catch (error: unknown) {
    return errorResponse(error, 'facilities.requests.queue')
  }
}

const conflictSchema = z.object({
  kind: z.enum(['session', 'rental', 'booking', 'closure', 'request']),
  start: z.string(),
  end: z.string(),
})

const itemSchema = z.object({
  id: z.uuid(),
  updatedAt: z.string().describe('The lock token of approve / reject'),
  placeId: z.uuid(),
  placeName: z.string(),
  startsAt: z.string(),
  endsAt: z.string(),
  units: z.number().int(),
  renterDisplayName: z.string(),
  renterCategory: z.string(),
  contactName: z.string().nullable(),
  contactPhone: z.string().nullable(),
  contactEmail: z.string().nullable(),
  purpose: z.string().nullable(),
  amount: z.number().int().nullable().describe('Indicative, minor units; null without a rate'),
  holdExpiresAt: z.string(),
  entryBanMatch: z.boolean().describe('The requester’s name matches a renter banned from the place (a hint only)'),
  conflicts: z.array(conflictSchema),
})

const responseSchema = z.object({
  items: z.array(itemSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
  totalPages: z.number().int(),
  timeZone: z.string(),
  currency: z.string(),
})

export const openApi: OpenApiRouteDoc = {
  tag: 'Facilities',
  summary: 'Booking requests awaiting approval',
  methods: {
    GET: {
      summary: 'List the booking requests awaiting approval',
      description:
        'The confirmed online requests whose 48-hour hold is still valid, the soonest expiry first (B-25, the B-01 widget). Club administrator only.',
      query: requestQueueQuerySchema,
      responses: [{ status: 200, description: 'One page of requests', schema: responseSchema }],
      errors: [
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 403, description: '`scope_denied`', schema: errorSchema },
      ],
    },
  },
}
