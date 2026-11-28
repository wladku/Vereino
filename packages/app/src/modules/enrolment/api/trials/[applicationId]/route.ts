// `PUT /api/enrolment/trials/{applicationId}` → `enrolment.trials.mark` (sign-up form spec M-J4, DD-J12, REQ-J16;
// phase 4, #801): the coach marks a trial participant present or absent, or clears the mark (`outcome: null`), from
// the moment the attendance list opens until the session is cancelled (409 `application_state_conflict` otherwise).
// Nothing is written to the attendance list, so the reports and the fees stay as they are. The body carries
// `updatedAt` (409 `optimistic_lock_conflict` when someone else changed it); a participant of a session the caller
// does not coach answers 404.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import type { MarkTrialResult } from '../../../commands/trials'
import { enrolmentErrors } from '../../errors'
import { errorSchema } from '../../shared'

export const metadata = {
  PUT: { requireAuth: true, requireFeatures: ['enrolment.trials.mark'] },
}

const paramsSchema = z.object({ applicationId: z.uuid() })
const bodySchema = z.object({ outcome: z.enum(['present', 'absent']).nullable(), updatedAt: z.string() })

export async function PUT(
  request: Request,
  context: { params: Promise<{ applicationId: string }> },
): Promise<Response> {
  try {
    const params = paramsSchema.safeParse(await context.params)
    if (!params.success) return await enrolmentErrors.throw('application_not_found')
    const ctx = await commandContextForRequest(request)
    if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const body: unknown = await request.json().catch(() => ({}))
    const input = { ...(body && typeof body === 'object' ? body : {}), id: params.data.applicationId }
    const { result } = await ctx.container
      .resolve<CommandBus>('commandBus')
      .execute<unknown, MarkTrialResult>('enrolment.trials.mark', { input, ctx })
    return Response.json({
      ok: true,
      id: result.entity.id,
      outcome: result.outcome,
      updatedAt: result.entity.updatedAt.toISOString(),
    })
  } catch (error: unknown) {
    return errorResponse(error, 'enrolment.trials.mark')
  }
}

const responseSchema = z.object({
  ok: z.literal(true),
  id: z.uuid(),
  outcome: z.enum(['present', 'absent']).nullable(),
  updatedAt: z.string(),
})

export const openApi: OpenApiRouteDoc = {
  tag: 'Enrolment',
  summary: 'Mark a trial participant',
  methods: {
    PUT: {
      summary: 'Marks a trial participant of a session the caller coaches present or absent, or clears the mark',
      requestBody: { contentType: 'application/json', schema: bodySchema },
      responses: [{ status: 200, description: 'Marked', schema: responseSchema }],
      errors: [
        { status: 400, description: 'Invalid input, `lock_token_required`', schema: errorSchema },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 404, description: '`application_not_found`', schema: errorSchema },
        {
          status: 409,
          description: '`application_state_conflict` (list not open, or cancelled), `optimistic_lock_conflict`',
          schema: errorSchema,
        },
      ],
    },
  },
}
