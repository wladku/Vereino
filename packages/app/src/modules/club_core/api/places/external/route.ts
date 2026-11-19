// `POST /api/club_core/places/external` — `club_core.places.add_external` (club events spec REQ-T06, DD-T08, *API*
// table; #377): a section coordinator or the club administrator adds a missing venue from a club event form. It holds
// a name, an address, a kind and an optional owner institution and is created as a root, active, external place; the
// answer is the option the form selects. A live place with the same name and address answers 409
// `external_place_exists` with `details.placeId`. Editing and deleting the place stay on `/api/club_core/places`
// (`club_core.manage`).
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import { ADD_EXTERNAL_PLACE_COMMAND } from '../../../commands/external-places'
import type { PlaceCommandResult } from '../../../commands/places'
import { placeAddExternalSchema } from '../../../data/validators'
import { errorSchema } from '../../shared'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['club_core.places.add_external'] },
}

const responseSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  label: z.string(),
  kind: z.string(),
  address: z.string(),
  ownerInstitutionId: z.uuid().nullable(),
  parentId: z.null(),
  isExternal: z.literal(true),
  isPublicSchedule: z.literal(false),
})

export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await commandContextForRequest(request)
    if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const body: unknown = await request.json().catch(() => ({}))
    const commandBus = ctx.container.resolve<CommandBus>('commandBus')
    const { result } = await commandBus.execute<unknown, PlaceCommandResult>(ADD_EXTERNAL_PLACE_COMMAND, {
      input: typeof body === 'object' && body !== null ? body : {},
      ctx,
    })
    const place = result.entity
    return Response.json(
      {
        id: place.id,
        name: place.name,
        // A root place: its label is its name, as the place pickers label a place without a parent.
        label: place.name,
        kind: place.kind,
        address: place.address ?? '',
        ownerInstitutionId: place.ownerInstitutionId ?? null,
        parentId: null,
        isExternal: true,
        isPublicSchedule: false,
      },
      { status: 201 },
    )
  } catch (error: unknown) {
    return errorResponse(error, ADD_EXTERNAL_PLACE_COMMAND)
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Club core',
  summary: 'Add an external place',
  methods: {
    POST: {
      summary: 'Add a missing external place from an event form',
      description:
        'Creates a root, active, external place with a name (2–160), the venue’s address (5–500), a kind (default `other`) and an optional owner institution; every other field takes its default (not managed or rented by the club, no public calendar, no online requests, no opening hours, capacity 1). A section coordinator acts for the whole club; editing and deleting the place need `club_core.manage`. Emits `club_core.place.created`; audited and undoable while no activity, session or club event points at the place (409 `place_in_use`) and it has no sub-places (409 `place_has_children`).',
      requestBody: { contentType: 'application/json', schema: placeAddExternalSchema },
      responses: [{ status: 201, description: 'The added place, as a picker option', schema: responseSchema }],
      errors: [
        {
          status: 400,
          description: 'Validation failed (name 2–160, address 5–500, a known kind)',
          schema: errorSchema,
        },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 403, description: '`scope_denied` (no coordinator or administrator grant)', schema: errorSchema },
        {
          status: 409,
          description:
            '`external_place_exists`: a live place with the same name and address; `details.placeId` names it and `details.pickable` says whether a picker lists it (active, without sub-places)',
          schema: errorSchema,
        },
        {
          status: 422,
          description: '`place_reference_invalid` at `ownerInstitutionId`: not a live institution of the club',
          schema: errorSchema,
        },
      ],
    },
  },
}
