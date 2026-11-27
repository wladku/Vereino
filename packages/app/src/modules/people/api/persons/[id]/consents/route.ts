// `POST /api/people/persons/{id}/consents` — `people.persons.set_own_consents` for the club administrator (people
// life-cycle spec API table, REQ-L10; #309): the B-10 Guardians tab changes an adult participant's own consents. The
// command authorizes the `club_admin` grant (or the person themself); a person under 18 gets 422 `consents_minor`. The
// person's lock token travels in the platform optimistic-lock header.
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { z } from 'zod'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import type { OwnConsentsResult } from '../../../../commands/own-consents'
import { consentChangesSchema, consentNoteSchema } from '../../../../data/validators'
import { errorSchema, ownConsentsResponse, ownConsentsResponseSchema } from '../../../shared'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['people.manage'] },
}

const paramsSchema = z.object({ id: z.uuid() })
const bodySchema = z.object({ changes: consentChangesSchema, note: consentNoteSchema.optional() }).strict()

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = paramsSchema.parse(await context.params)
    const ctx = await commandContextForRequest(request)
    if (!ctx?.auth) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const body: unknown = await request.json().catch(() => ({}))
    const commandBus = ctx.container.resolve<CommandBus>('commandBus')
    const { result } = await commandBus.execute<unknown, OwnConsentsResult>('people.persons.set_own_consents', {
      input: { ...(typeof body === 'object' && body !== null ? body : {}), id },
      ctx,
    })
    return Response.json(ownConsentsResponse(result.person), { headers: { 'cache-control': 'private, no-store' } })
  } catch (error: unknown) {
    return errorResponse(error, 'people.persons.consents')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'People',
  summary: "An adult participant's own consents",
  methods: {
    POST: {
      summary: "Change an adult participant's own consents",
      description:
        'The club administrator gives or withdraws the consents `regulations` and `trips` of an adult participant (`true` gives, `false` withdraws, an absent key keeps); each change records the instant and the acting person and is appended to the consent history. The `image` consent is only withdrawn here, on the request of the person, with a `note` (2–200 characters): a grant answers 422 `image_consent_subject_only`, a withdrawal without a note 422 `consent_note_required` (event photos spec BR-I05). 422 `consents_minor` for a person under 18 or without a birth date. Send the person lock token in the platform optimistic-lock header.',
      requestBody: { contentType: 'application/json', schema: bodySchema },
      responses: [{ status: 200, description: 'The consents after the change', schema: ownConsentsResponseSchema }],
      errors: [
        { status: 400, description: 'Validation failed, `lock_token_required`', schema: errorSchema },
        { status: 403, description: 'scope_denied', schema: errorSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
        { status: 409, description: 'optimistic_lock_conflict', schema: errorSchema },
        {
          status: 422,
          description: 'consents_minor, image_consent_subject_only, consent_note_required',
          schema: errorSchema,
        },
      ],
    },
  },
}
