// `PUT /api/people/me/consents` — `people.persons.set_own_consents` (people life-cycle spec API table, REQ-L10; #309):
// an adult participant gives and withdraws their own consents `{ regulations, image, trips }`. The person comes only
// from the session; a person under 18 (or without a birth date) gets 422 `consents_minor`. The person's lock token
// (`person.updatedAt` of `GET /api/people/me`) travels in the platform optimistic-lock header.
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { z } from 'zod'
import { commandContextForRequest, errorResponse, trustedScopeOf } from '@/modules/foundation'
import type { OwnConsentsResult } from '../../../commands/own-consents'
import { consentChangesSchema } from '../../../data/validators'
import { errorSchema, ownConsentsResponse, ownConsentsResponseSchema } from '../../shared'

export const metadata = {
  PUT: { requireAuth: true, requireFeatures: ['people.self'] },
}

const bodySchema = z.object({ changes: consentChangesSchema }).strict()

export async function PUT(request: Request): Promise<Response> {
  try {
    const ctx = await commandContextForRequest(request)
    if (!ctx?.auth || !trustedScopeOf(ctx)) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    // The body never names a person: the strict schema refuses an `id`, so the command targets the caller's own person.
    const { changes } = bodySchema.parse(await request.json().catch(() => ({})))
    const commandBus = ctx.container.resolve<CommandBus>('commandBus')
    const { result } = await commandBus.execute<unknown, OwnConsentsResult>('people.persons.set_own_consents', {
      input: { changes },
      ctx,
    })
    return Response.json(ownConsentsResponse(result.person), { headers: { 'cache-control': 'private, no-store' } })
  } catch (error: unknown) {
    return errorResponse(error, 'people.me.consents')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'People',
  summary: 'Own consents of an adult participant',
  methods: {
    PUT: {
      summary: 'Give or withdraw own consents',
      description:
        '`changes` names any of `regulations`, `image` and `trips`: `true` gives, `false` withdraws, an absent key keeps the consent. Each change records the instant and the acting person. Only a person aged 18 or more with a known birth date holds own consents (422 `consents_minor`). Nothing blocks taking part when a consent is not given. Send the person lock token (`person.updatedAt`) in the platform optimistic-lock header.',
      requestBody: { contentType: 'application/json', schema: bodySchema },
      responses: [{ status: 200, description: 'The consents after the change', schema: ownConsentsResponseSchema }],
      errors: [
        { status: 400, description: 'Validation failed, `lock_token_required`', schema: errorSchema },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 404, description: 'person_not_linked', schema: errorSchema },
        { status: 409, description: 'optimistic_lock_conflict', schema: errorSchema },
        { status: 422, description: 'consents_minor', schema: errorSchema },
      ],
    },
  },
}
