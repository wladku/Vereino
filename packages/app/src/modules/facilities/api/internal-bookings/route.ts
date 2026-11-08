// `POST /api/facilities/internal-bookings` — `facilities.internal_bookings.create` (club spec the internal-bookings row
// of *API*; facilities spec glossary *Internal booking*; M-11 "Book" → "General purpose"; REQ-023, R06; #123): a
// coach, coordinator or administrator books a free slot of any club place at once. An occupied slot answers 409
// `rental_conflict` with the conflicting entries and their names (staff see them), a closure or a time outside the
// opening hours 409 `place_closed`; external requests holding the slot are superseded.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import type { InternalBookingCommandResult } from '../../commands/internal-bookings'
import { internalBookingCreateSchema } from '../../data/validators'
import { conflictViewSchema, errorSchema } from '../shared'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['facilities.bookings.create'] },
}

const responseSchema = z.object({
  id: z.uuid(),
  status: z.literal('confirmed'),
  placeId: z.uuid(),
  startsAt: z.string(),
  endsAt: z.string(),
  updatedAt: z.string(),
  actingRole: z.string(),
  supersededRequestIds: z.array(z.uuid()).describe('External requests the booking superseded'),
})

const conflictErrorSchema = errorSchema.extend({ conflicts: z.array(conflictViewSchema).optional() })

export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await commandContextForRequest(request)
    if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const body: unknown = await request.json().catch(() => ({}))
    const commandBus = ctx.container.resolve<CommandBus>('commandBus')
    const { result } = await commandBus.execute<unknown, InternalBookingCommandResult>(
      'facilities.internal_bookings.create',
      { input: typeof body === 'object' && body !== null ? body : {}, ctx },
    )
    const row = result.entity
    return Response.json(
      {
        id: row.id,
        status: row.status,
        placeId: row.placeId,
        startsAt: row.startsAt.toISOString(),
        endsAt: row.endsAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        actingRole: result.actingRole,
        supersededRequestIds: result.supersededRequestIds ?? [],
      },
      { status: 201 },
    )
  } catch (error: unknown) {
    return errorResponse(error, 'facilities.internal_bookings.create')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Facilities',
  summary: 'Book a club place (internal booking)',
  methods: {
    POST: {
      summary: 'Book a free slot of a club place at once',
      description:
        'A coach, coordinator or the club administrator books a place for a general purpose (3–120 characters) and a section, in any zone, without approval, when the slot is inside the opening hours and free of closures, sessions, rentals and other bookings on the place, its ancestors and descendants. Stored `confirmed`; the external requests holding the slot become `superseded`. A booking for a group is a one-off event: `POST /api/activities/events`.',
      requestBody: { contentType: 'application/json', schema: internalBookingCreateSchema },
      responses: [{ status: 201, description: 'The booking', schema: responseSchema }],
      errors: [
        { status: 400, description: 'Invalid input (purpose shorter than 3 or longer than 120)', schema: errorSchema },
        { status: 403, description: '`scope_denied`, `scope_unlinked` (no linked person)', schema: errorSchema },
        {
          status: 409,
          description:
            '`rental_conflict` (with `conflicts` and their labels), `place_closed` (closure or opening hours)',
          schema: conflictErrorSchema,
        },
        {
          status: 422,
          description:
            '`booking_period_invalid`, `booking_start_past`, `booking_section_invalid`, `facilities_reference_invalid`',
          schema: errorSchema,
        },
      ],
    },
  },
}
