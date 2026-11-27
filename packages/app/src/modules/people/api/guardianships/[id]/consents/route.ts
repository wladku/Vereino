// `POST /api/people/guardianships/{id}/consents` — `people.guardianships.set_consents` (club spec glossary *Consents*):
// a guardian of the ward or the club administrator grants or withdraws `regulations`, `image` and `trips`; the ward,
// a coordinator and a former guardian get 403 `scope_denied`. The feature gate is `people.self` (every member and the
// administrator hold it); the record scope decides.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import type { GuardianshipCommandResult } from '../../../../commands/guardianships'
import { consentChangesSchema, consentNoteSchema } from '../../../../data/validators'
import { errorSchema, guardianshipView, guardianshipViewSchema } from '../../../shared'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['people.self'] },
}

const paramsSchema = z.object({ id: z.uuid() })
const bodySchema = z.object({ consents: consentChangesSchema, note: consentNoteSchema.optional() })

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = paramsSchema.parse(await context.params)
    const ctx = await commandContextForRequest(request)
    if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const body: unknown = await request.json().catch(() => ({}))
    const commandBus = ctx.container.resolve<CommandBus>('commandBus')
    const { result } = await commandBus.execute<unknown, GuardianshipCommandResult>(
      'people.guardianships.set_consents',
      { input: { ...(typeof body === 'object' && body !== null ? body : {}), id }, ctx },
    )
    // Only a guardian of the ward or the administrator gets here, and both may see the consents.
    return Response.json({
      ...guardianshipView(result.guardianship, { withConsents: true }),
      actingRole: result.actingRole,
    })
  } catch (error: unknown) {
    return errorResponse(error, 'people.guardianships.set_consents')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'People',
  summary: 'Change the consents of a guardianship',
  methods: {
    POST: {
      summary: 'Grant or withdraw consents',
      description:
        "A guardian of the ward or the club administrator; `true` grants, `false` withdraws, an absent key keeps the consent. Every change is appended to the consent history. The `image` consent (event photos spec BR-I05): only the guardian of this guardianship grants it or changes it (403 `scope_denied` for the other guardian); the club administrator only withdraws it, on the guardian's request, with a `note` (2–200 characters) — a grant answers 422 `image_consent_subject_only`, a withdrawal without a note 422 `consent_note_required`. Send the lock token in the platform optimistic-lock header (400 `lock_token_required` without it). Errors: 403 `scope_denied` (the ward, a coordinator, a former guardian), 404, 409 `optimistic_lock_conflict`, 409 `guardianship_ended`.",
      requestBody: { contentType: 'application/json', schema: bodySchema },
      responses: [
        {
          status: 200,
          description: 'The guardianship with its consents and the acting role',
          schema: guardianshipViewSchema.extend({ actingRole: z.string() }),
        },
      ],
      errors: [
        { status: 403, description: 'scope_denied', schema: errorSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
        { status: 409, description: 'optimistic_lock_conflict, guardianship_ended', schema: errorSchema },
        { status: 422, description: 'image_consent_subject_only, consent_note_required', schema: errorSchema },
      ],
    },
  },
}
