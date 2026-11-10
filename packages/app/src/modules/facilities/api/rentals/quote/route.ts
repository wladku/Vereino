// `POST /api/facilities/rentals/quote` (facilities spec the `facilities.rentals.create` row "+ `/quote` without
// saving", B-23/B-24 "New rental"; REQ-013; #122): the live quote of the rental dialog — the end, the amount from the
// rate for the renter category on the date (the winter-lighting rate for a municipal club in its season), the payment
// due date and the free-cancellation deadline — and every issue the save would refuse (units, rate, closure or opening
// hours, zone, conflicts with their times, the renter's entry ban), so staff see them next to the fields before
// saving. Nothing is written and no lock is taken: the save re-checks under the occupancy lock (DD-43).
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import {
  assertInScope,
  commandContextForRequest,
  errorResponse,
  scopeContract,
  trustedScopeOf,
} from '@/modules/foundation'
import { PLACE_KINDS, placeTarget } from '../../../commands/shared'
import { rentalQuoteSchema } from '../../../data/validators'
import { findPlaces } from '../../../services/directory'
import { quoteRentalSlot } from '../../../services/rental-slot'
import { facilitiesErrors } from '../../errors'
import { conflictViewSchema, errorSchema } from '../../shared'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['facilities.rentals.manage'] },
}

const issueCodes = [
  'rental_units_invalid',
  'rental_rate_missing',
  'place_closed',
  'maintenance_scheduled',
  'zone_not_reservable',
  'rental_conflict',
  'entry_ban_active',
] as const

const responseSchema = z.object({
  endsAt: z.string(),
  amount: z.number().int().nullable().describe('Minor units; null without a rate'),
  rateId: z.string().nullable(),
  appliedCategory: z
    .string()
    .nullable()
    .describe('The category of the rate applied (winter lighting for a municipal club in season)'),
  cancellationDeadline: z.string(),
  paymentDeadline: z.string(),
  issues: z.array(z.object({ code: z.enum(issueCodes), conflicts: z.array(conflictViewSchema).optional() })),
})

export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await commandContextForRequest(request)
    const scope = ctx ? trustedScopeOf(ctx) : null
    if (!ctx || !scope) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const input = rentalQuoteSchema.parse(await request.json().catch(() => ({})))
    const grants = await scopeContract.resolve(ctx)
    await assertInScope(grants, PLACE_KINDS, placeTarget({ id: input.placeId, ...scope, placeId: input.placeId }))
    const places = await findPlaces(ctx.container, scope, [input.placeId])
    if (!places.has(input.placeId)) await facilitiesErrors.throw('facilities_reference_invalid', { field: 'placeId' })
    const assessment = await quoteRentalSlot(
      ctx.container,
      scope,
      {
        placeId: input.placeId,
        startsAt: new Date(input.startsAt),
        units: input.units,
        renterCategory: input.renterCategory,
        renterType: input.renterType ?? null,
        renterId: input.renterId ?? null,
        ignoreIds: input.ignoreRentalId ? [input.ignoreRentalId] : [],
      },
      new Date(),
    )
    return Response.json({
      endsAt: assessment.endsAt.toISOString(),
      amount: assessment.amount,
      rateId: assessment.rateId,
      appliedCategory: assessment.appliedCategory,
      cancellationDeadline: assessment.cancellationDeadline.toISOString(),
      paymentDeadline: assessment.paymentDeadline.toISOString(),
      issues: assessment.issues,
    })
  } catch (error: unknown) {
    return errorResponse(error, 'facilities.rentals.quote')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Facilities',
  summary: 'Quote a rental',
  methods: {
    POST: {
      summary: 'Quote a rental without saving it',
      description:
        'Returns the end, the amount, the payment due date and the free-cancellation deadline of a rental slot, and the issues a save would refuse with (`rental_units_invalid`, `rental_rate_missing`, `place_closed`, `zone_not_reservable`, `rental_conflict` with the conflicting entries, `entry_ban_active`). `ignoreRentalId` leaves a rental being moved out of the conflicts. Nothing is saved.',
      requestBody: { contentType: 'application/json', schema: rentalQuoteSchema },
      responses: [{ status: 200, description: 'The quote and its issues', schema: responseSchema }],
      errors: [
        { status: 400, description: 'Invalid input', schema: errorSchema },
        { status: 403, description: 'scope_denied', schema: errorSchema },
        { status: 422, description: '`facilities_reference_invalid` (unknown place)', schema: errorSchema },
      ],
    },
  },
}
