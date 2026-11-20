// `POST /api/people/persons/{id}/anonymize` — `people.persons.anonymize` (people life-cycle spec *API* row, REQ-L05,
// DD-L06, DD-L07, J-L04; phase L6, #308): the club administrator anonymises a person who left, on a recorded erasure
// request, with the last name typed to confirm. 409 `anonymize_blocked` with `reasons` (each `{ code, module?,
// recordId?, params? }`), 422 `confirmation_mismatch`. Not undoable.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import type { AnonymizeCommandResult } from '../../../../commands/erasure'
import { errorSchema } from '../../../shared'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['people.persons.anonymize'] },
}

const paramsSchema = z.object({ id: z.uuid() })

const bodySchema = z.object({ requestId: z.uuid(), confirmLastName: z.string().max(200) })

const responseSchema = z.object({
  id: z.uuid(),
  anonymizedAt: z.string(),
  erasureHoldUntil: z.string().nullable(),
})

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = paramsSchema.parse(await context.params)
    const ctx = await commandContextForRequest(request)
    if (!ctx?.auth) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const body: unknown = await request.json().catch(() => ({}))
    const fields = typeof body === 'object' && body !== null ? body : {}
    const commandBus = ctx.container.resolve<CommandBus>('commandBus')
    const { result } = await commandBus.execute<unknown, AnonymizeCommandResult>('people.persons.anonymize', {
      input: { ...fields, id },
      ctx,
    })
    return Response.json({
      id: result.personId,
      anonymizedAt: result.anonymizedAt,
      erasureHoldUntil: result.erasureHoldUntil,
    })
  } catch (error: unknown) {
    return errorResponse(error, 'people.persons.anonymize')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'People',
  summary: 'Anonymise a former person',
  methods: {
    POST: {
      summary: 'Anonymise a person who left the club',
      description:
        'Erases at once the phone, e-mail, notes, PESEL, external id, photo, birth date, locale and consents of a person who left, the consents on the guardianships where they are the ward, the notes of their departure requests and the source data of import rows that matched them. The name stays while a payment on a charge naming them as debtor or payer is under the retention hold (`erasureHoldUntil`, 31 December of the fifth year after the latest payment; null when there is none) and is cleared by the daily job after it; meanwhile only a reader with `people.manage` sees it, everyone else reads "Former member". Refused with 409 `anonymize_blocked` and `reasons` unless the person left, the account is closed, no charge naming them is open, they hold no cash, no guardianship is active and `requestId` names their recorded erasure request; 422 `confirmation_mismatch` when `confirmLastName` is not their last name. Send the person record `updatedAt` in the platform optimistic-lock header (400 `lock_token_required` without it, 409 when stale). Not undoable.',
      requestBody: { contentType: 'application/json', schema: bodySchema },
      responses: [{ status: 200, description: 'Anonymised', schema: responseSchema }],
      errors: [
        { status: 403, description: 'scope_denied', schema: errorSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
        { status: 409, description: 'anonymize_blocked', schema: errorSchema },
        { status: 422, description: 'confirmation_mismatch', schema: errorSchema },
      ],
    },
  },
}
