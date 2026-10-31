// `POST /api/activities/occurrences/{id}/cancel` — `activities.occurrences.cancel` (club spec API table, glossary
// *Session cancellation*, REQ-005, REQ-009, TEST-012): a planned session becomes `cancelled` with a reason, by a coach of
// its group, the coordinator of its section or the club administrator; the people it concerns get an in-app notice
// after commit. Send the lock token in the platform optimistic-lock header.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import type { OccurrenceCommandResult } from '../../../../commands/occurrences'
import { errorSchema } from '../../../shared'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['activities.coach'] },
}

const paramsSchema = z.object({ id: z.uuid() })
const bodySchema = z.object({ reason: z.string().min(1).max(500) })

const responseSchema = z.object({
  ok: z.literal(true),
  id: z.uuid(),
  status: z.literal('cancelled'),
  updatedAt: z.string(),
  actingRole: z.string(),
})

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = paramsSchema.parse(await context.params)
    const ctx = await commandContextForRequest(request)
    if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const body: unknown = await request.json().catch(() => ({}))
    const commandBus = ctx.container.resolve<CommandBus>('commandBus')
    const { result } = await commandBus.execute<unknown, OccurrenceCommandResult>('activities.occurrences.cancel', {
      input: { ...(typeof body === 'object' && body !== null ? body : {}), id },
      ctx,
    })
    return Response.json({
      ok: true,
      id: result.entity.id,
      status: result.entity.status,
      updatedAt: result.entity.updatedAt.toISOString(),
      actingRole: result.actingRole,
    })
  } catch (error: unknown) {
    return errorResponse(error, 'activities.occurrences.cancel')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Activities',
  summary: 'Cancel a session',
  methods: {
    POST: {
      summary: 'Cancel a planned session with a reason',
      description:
        'Marks the session cancelled and notifies, in the app, the participants with an account, the guardians of minor participants and the coaches. Send the lock token in the platform optimistic-lock header (400 `lock_token_required` without it).',
      requestBody: { contentType: 'application/json', schema: bodySchema },
      responses: [{ status: 200, description: 'The cancelled session', schema: responseSchema }],
      errors: [
        { status: 400, description: 'Invalid input (a reason is required)', schema: errorSchema },
        { status: 403, description: 'scope_denied', schema: errorSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
        {
          status: 409,
          description: '`invalid_transition` (the session is done or already cancelled), `optimistic_lock_conflict`',
          schema: errorSchema,
        },
      ],
    },
  },
}
