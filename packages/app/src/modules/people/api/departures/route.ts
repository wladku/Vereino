// `POST /api/people/departures` — `people.persons.depart` (people life-cycle spec *API* row, REQ-L03, J-L02; phase L4,
// #306): confirms a previewed departure in one transaction. 409 `departure_preview_stale` when the plan changed or the
// token expired, 409 `departure_blocked` with `details.blockers`, 422 `last_club_admin`, `departure_payer_required`
// (with `details.wardPersonIds`) and `departure_date_in_past`; phase L5 (#307): 422 `departure_handover_required` (with
// `details.groupIds`) and `departure_handover_invalid` for a leaving coach's groups. Undoable through the audit log until the last day.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import type { DepartureCommandResult } from '../../commands/departures'
import { departureSchema } from '../../data/validators'
import { errorSchema } from '../shared'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['people.manage'] },
}

export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await commandContextForRequest(request)
    if (!ctx?.auth) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const body: unknown = await request.json().catch(() => ({}))
    const commandBus = ctx.container.resolve<CommandBus>('commandBus')
    const { result } = await commandBus.execute<unknown, DepartureCommandResult>('people.persons.depart', {
      input: body,
      ctx,
    })
    return Response.json({
      personIds: result.snapshot.personIds,
      lastDay: result.snapshot.lastDay,
      ended: result.summary.ended,
    })
  } catch (error: unknown) {
    return errorResponse(error, 'people.persons.depart')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'People',
  summary: 'Confirm a departure',
  methods: {
    POST: {
      summary: 'Leave the club',
      description:
        "Ends the persons' role assignments, guardianships and group memberships on `lastDay` (rows that would start later are removed), sets their last day, hands the primary payer of a staying ward to `nextPayer` from the day after, ends the contracts with the persons and removes their place maintainer assignments, and closes their open requests. For each group in the preview's `handOvers` send one `handOver` entry: from the day after the last day the group's planned sessions and default-coach activities go to `toPersonId` (a coach of the club) or stay without a coach when it is null, each session with a substitution entry; the accounts close the day after the last day. Send the `previewToken` of the preview: a change since answers 409 `departure_preview_stale`. Undoable through the audit log until the last day.",
      requestBody: { contentType: 'application/json', schema: departureSchema },
      responses: [
        {
          status: 200,
          description: 'Departure recorded',
          schema: z.object({ personIds: z.array(z.uuid()), lastDay: z.string(), ended: z.number().int() }),
        },
      ],
      errors: [
        { status: 403, description: 'scope_denied', schema: errorSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
        { status: 409, description: 'departure_blocked, departure_preview_stale', schema: errorSchema },
        {
          status: 422,
          description:
            'departure_date_in_past, departure_payer_required, departure_handover_required, departure_handover_invalid, departure_handover_coach_invalid, last_club_admin',
          schema: errorSchema,
        },
      ],
    },
  },
}
