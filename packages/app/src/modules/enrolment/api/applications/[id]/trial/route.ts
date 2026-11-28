// `POST|DELETE /api/enrolment/applications/{id}/trial` (sign-up form spec M-J3, REQ-J12, DD-J12, Q-J07, BR-J5; phase 4,
// #801): POST → `enrolment.applications.propose_trial` proposes one of the group's next planned sessions as the trial
// session (one at a time) and e-mails the applicant the date, time, place and what to bring; DELETE →
// `enrolment.applications.withdraw_trial` drops a proposed session before it starts and tells the applicant. Both are
// undoable. The body carries `updatedAt` (409 `optimistic_lock_conflict` when someone else changed it); an application
// of another section answers 404.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import type { ApplicationCommandResult } from '../../../../commands/shared'
import { enrolmentErrors } from '../../../errors'
import { decidedResponseSchema, errorSchema } from '../../../shared'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['enrolment.applications.decide'] },
  DELETE: { requireAuth: true, requireFeatures: ['enrolment.applications.decide'] },
}

const paramsSchema = z.object({ id: z.uuid() })
const postBodySchema = z.object({ occurrenceId: z.uuid(), groupId: z.uuid().optional(), updatedAt: z.string() })
const deleteBodySchema = z.object({ updatedAt: z.string() })

async function run(
  request: Request,
  context: { params: Promise<{ id: string }> },
  commandId: 'enrolment.applications.propose_trial' | 'enrolment.applications.withdraw_trial',
): Promise<Response> {
  try {
    const params = paramsSchema.safeParse(await context.params)
    if (!params.success) return await enrolmentErrors.throw('application_not_found')
    const ctx = await commandContextForRequest(request)
    if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const body: unknown = await request.json().catch(() => ({}))
    const input = { ...(body && typeof body === 'object' ? body : {}), id: params.data.id }
    const { result } = await ctx.container
      .resolve<CommandBus>('commandBus')
      .execute<unknown, ApplicationCommandResult>(commandId, { input, ctx })
    return Response.json({
      ok: true,
      id: result.entity.id,
      state: result.entity.state,
      updatedAt: result.entity.updatedAt.toISOString(),
    })
  } catch (error: unknown) {
    return errorResponse(error, commandId)
  }
}

export function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  return run(request, context, 'enrolment.applications.propose_trial')
}

export function DELETE(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  return run(request, context, 'enrolment.applications.withdraw_trial')
}

const errors = [
  { status: 400, description: 'Invalid input, `lock_token_required`', schema: errorSchema },
  { status: 401, description: 'Unauthorized', schema: errorSchema },
  { status: 404, description: '`application_not_found`', schema: errorSchema },
]

export const openApi: OpenApiRouteDoc = {
  tag: 'Enrolment',
  summary: 'Trial session of an application',
  methods: {
    POST: {
      summary:
        "Proposes one of the group's next planned sessions as the trial session (free, one at a time, Q-J07) and e-mails the applicant. Undoable.",
      requestBody: { contentType: 'application/json', schema: postBodySchema },
      responses: [{ status: 200, description: 'Proposed', schema: decidedResponseSchema }],
      errors: [
        ...errors,
        {
          status: 409,
          description: '`application_state_conflict` (closed, or a trial still to come), `optimistic_lock_conflict`',
          schema: errorSchema,
        },
        { status: 422, description: '`trial_session_invalid`, `application_group_invalid`', schema: errorSchema },
      ],
    },
    DELETE: {
      summary: 'Withdraws the proposed trial session before it starts; the application is back in New. Undoable.',
      requestBody: { contentType: 'application/json', schema: deleteBodySchema },
      responses: [{ status: 200, description: 'Withdrawn', schema: decidedResponseSchema }],
      errors: [
        ...errors,
        {
          status: 409,
          description: '`application_state_conflict` (no trial, or its session started), `optimistic_lock_conflict`',
          schema: errorSchema,
        },
      ],
    },
  },
}
