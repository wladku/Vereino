// `POST /api/people/guardianships/{id}/consents` — `people.guardianships.set_consents` (club spec glossary *Consents*):
// a guardian of the ward or the club administrator grants or withdraws `regulations`, `image` and `trips`; the ward,
// a coordinator and a former guardian get 403 `scope_denied`. The feature gate is `people.self` (every member and the
// administrator hold it); the record scope decides.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import type { GuardianshipCommandResult } from '../../../../commands/guardianships'
import { consentChangesSchema } from '../../../../data/validators'
import { errorSchema, guardianshipView, guardianshipViewSchema } from '../../../shared'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['people.self'] },
}

const paramsSchema = z.object({ id: z.uuid() })
const bodySchema = z.object({ consents: consentChangesSchema })

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
        'A guardian of the ward or the club administrator; `true` grants, `false` withdraws, an absent key keeps the consent. Send the lock token in the platform optimistic-lock header (400 `lock_token_required` without it). Errors: 403 `scope_denied` (the ward, a coordinator, a former guardian), 404, 409 `optimistic_lock_conflict`, 409 `guardianship_ended`.',
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
      ],
    },
  },
}
