// `PUT /api/people/persons/{id}/medical` — `people.persons.medical.set` (training outlines and medical expiry spec API
// table, REQ-O01, BR-O1, Q-O01; #682): sets or clears a person's sports medical certificate "valid until" date. The
// feature gate is `people.self` (every member and the administrator hold it); the command decides by the record scope —
// the adult person, a guardian of the ward, and with `people.medical.manage` the club administrator or a coordinator of
// one of the person's sections. 409 `medical_consent_missing` while no `medical` consent is in force. The person's lock
// token (`updatedAt`) travels in the platform optimistic-lock header.
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { z } from 'zod'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import type { MedicalSetResult } from '../../../../commands/medical'
import { errorSchema } from '../../../shared'

export const metadata = {
  PUT: { requireAuth: true, requireFeatures: ['people.self'] },
}

const paramsSchema = z.object({ id: z.uuid() })
const bodySchema = z.object({ validUntil: z.iso.date().nullable() }).strict()
const responseSchema = z.object({
  id: z.uuid(),
  validUntil: z.iso.date().nullable(),
  updatedAt: z.string().nullable(),
})

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = paramsSchema.parse(await context.params)
    const ctx = await commandContextForRequest(request)
    if (!ctx?.auth) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const { validUntil } = bodySchema.parse(await request.json().catch(() => ({})))
    const commandBus = ctx.container.resolve<CommandBus>('commandBus')
    const { result } = await commandBus.execute<unknown, MedicalSetResult>('people.persons.medical.set', {
      input: { id, validUntil },
      ctx,
    })
    const updatedAt = result.person.updatedAt
    return Response.json(
      {
        id: result.person.id,
        validUntil: result.person.medicalValidUntil ?? null,
        updatedAt: updatedAt ? new Date(updatedAt).toISOString() : null,
      },
      { headers: { 'cache-control': 'private, no-store' } },
    )
  } catch (error: unknown) {
    return errorResponse(error, 'people.persons.medical')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'People',
  summary: "A person's sports medical certificate date",
  methods: {
    PUT: {
      summary: 'Set or clear the medical certificate "valid until" date',
      description:
        "Health data (GDPR Art. 9): stored encrypted, only while a `medical` consent of the adult person or of a guardian of a minor is in force (409 `medical_consent_missing`); `null` clears it. Written by the adult person, a guardian of the ward, and with `people.medical.manage` the club administrator or a coordinator of one of the person's sections; a coach never writes (403 `scope_denied`). A person under 18 cannot set their own (422 `consents_minor`). Send the person lock token in the platform optimistic-lock header.",
      requestBody: { contentType: 'application/json', schema: bodySchema },
      responses: [{ status: 200, description: 'The date after the change', schema: responseSchema }],
      errors: [
        { status: 400, description: 'Validation failed, `lock_token_required`', schema: errorSchema },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 403, description: 'scope_denied', schema: errorSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
        {
          status: 409,
          description: '`medical_consent_missing`, `optimistic_lock_conflict`, `person_anonymized`',
          schema: errorSchema,
        },
        { status: 422, description: 'consents_minor', schema: errorSchema },
      ],
    },
  },
}
