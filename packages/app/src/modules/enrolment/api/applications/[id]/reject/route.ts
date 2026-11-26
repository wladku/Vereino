// `POST /api/enrolment/applications/{id}/reject` → `enrolment.applications.reject` (sign-up form spec M-J3, REQ-J12, BR-J5;
// #799): Rejects an open application with a reason the applicant sees (e-mailed). Undoable. The body carries `updatedAt` (409
// `optimistic_lock_conflict` when someone else changed it); an application of another section answers 404.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import type { ApplicationCommandResult } from '../../../../commands/shared'
import { enrolmentErrors } from '../../../errors'
import { decidedResponseSchema, errorSchema } from '../../../shared'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['enrolment.applications.decide'] },
}

const paramsSchema = z.object({ id: z.uuid() })
const bodySchema = z.object({ reason: z.string().min(1).max(500), updatedAt: z.string() })

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const params = paramsSchema.safeParse(await context.params)
    if (!params.success) return await enrolmentErrors.throw('application_not_found')
    const ctx = await commandContextForRequest(request)
    if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const body: unknown = await request.json().catch(() => ({}))
    const input = { ...(body && typeof body === 'object' ? body : {}), id: params.data.id }
    const { result } = await ctx.container
      .resolve<CommandBus>('commandBus')
      .execute<unknown, ApplicationCommandResult & { waitingNumber?: number | null }>('enrolment.applications.reject', {
        input,
        ctx,
      })
    return Response.json({
      ok: true,
      id: result.entity.id,
      state: result.entity.state,
      updatedAt: result.entity.updatedAt.toISOString(),
      waitingNumber: result.waitingNumber ?? null,
    })
  } catch (error: unknown) {
    return errorResponse(error, 'enrolment.applications.reject')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Enrolment',
  summary: 'Application decision',
  methods: {
    POST: {
      summary: 'Rejects an open application with a reason the applicant sees (e-mailed). Undoable.',
      requestBody: { contentType: 'application/json', schema: bodySchema },
      responses: [{ status: 200, description: 'Decided', schema: decidedResponseSchema }],
      errors: [
        { status: 400, description: 'Invalid input, `lock_token_required`', schema: errorSchema },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 404, description: '`application_not_found`', schema: errorSchema },
        { status: 409, description: '`application_state_conflict`, `optimistic_lock_conflict`', schema: errorSchema },
        { status: 422, description: '`decision_reason_required`, field errors', schema: errorSchema },
      ],
    },
  },
}
