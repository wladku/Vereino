// `POST /api/activities/occurrences/{id}/restore` — `activities.occurrences.restore` (REQ-A05 of the groups and
// activities parity spec, TEST-A07, #268): the club administrator puts a cancelled session back on the schedule with a
// reason of 3–500 characters, only while the session's end is in the future and only when its place and coach are still
// free. Send the lock token in the platform optimistic-lock header. A coordinator or a coach gets 403.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import type { OccurrenceCommandResult } from '../../../../commands/occurrences'
import { errorSchema } from '../../../shared'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['activities.manage'] },
}

const paramsSchema = z.object({ id: z.uuid() })
const bodySchema = z.object({ reason: z.string().min(3).max(500) })

const responseSchema = z.object({
  ok: z.literal(true),
  id: z.uuid(),
  status: z.literal('planned'),
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
    const { result } = await commandBus.execute<unknown, OccurrenceCommandResult>('activities.occurrences.restore', {
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
    return errorResponse(error, 'activities.occurrences.restore')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Activities',
  summary: 'Restore a cancelled session',
  methods: {
    POST: {
      summary: 'Restore a cancelled session with a reason',
      description:
        'The club administrator puts a cancelled session back on the schedule (`cancelled → planned`) with a reason of 3–500 characters, kept in the audit log. Only while the session has not ended, and only when its place tree and its coach are still free. Send the lock token in the platform optimistic-lock header (400 `lock_token_required` without it).',
      requestBody: { contentType: 'application/json', schema: bodySchema },
      responses: [{ status: 200, description: 'The restored session', schema: responseSchema }],
      errors: [
        { status: 400, description: 'Invalid input (a reason of 3–500 characters is required)', schema: errorSchema },
        { status: 403, description: '`scope_denied` (only the club administrator restores)', schema: errorSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
        {
          status: 409,
          description:
            '`occurrence_not_cancelled`, `occurrence_already_ended`, `occurrence_place_conflict` / `occurrence_coach_conflict` with the `conflicts` list, `optimistic_lock_conflict`',
          schema: errorSchema,
        },
      ],
    },
  },
}
