// `POST /api/facilities/maintenance-tasks/{id}/complete` (facilities spec `facilities.maintenance.complete`; REQ-022;
// #128): the club administrator or the place's maintainer marks a planned task done, with the lock token in the
// platform optimistic-lock header; a recurring task gets its next instance (`nextTaskId`).
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import type { MaintenanceCommandResult } from '../../../../commands/maintenance'
import { maintenanceCompleteSchema } from '../../../../data/validators'
import { errorSchema } from '../../../shared'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['facilities.maintenance.manage'] },
}

const paramsSchema = z.object({ id: z.uuid() })

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = paramsSchema.parse(await context.params)
    const ctx = await commandContextForRequest(request)
    if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const body: unknown = await request.json().catch(() => ({}))
    const commandBus = ctx.container.resolve<CommandBus>('commandBus')
    const { result } = await commandBus.execute<unknown, MaintenanceCommandResult>('facilities.maintenance.complete', {
      input: { ...(typeof body === 'object' && body !== null ? body : {}), id },
      ctx,
    })
    const row = result.entity
    return Response.json({
      ok: true,
      id: row.id,
      status: row.status,
      updatedAt: row.updatedAt.toISOString(),
      nextTaskId: result.nextTaskId ?? null,
    })
  } catch (error: unknown) {
    return errorResponse(error, 'facilities.maintenance.complete')
  }
}

const responseSchema = z.object({
  ok: z.literal(true),
  id: z.uuid(),
  status: z.string(),
  updatedAt: z.string(),
  nextTaskId: z.string().nullable().describe('The next instance of a recurring task'),
})

export const openApi: OpenApiRouteDoc = {
  tag: 'Facilities',
  summary: 'Complete a maintenance task',
  methods: {
    POST: {
      summary: 'Complete a maintenance task',
      description:
        'Marks a planned task done (`doneAt` defaults to now; optional `cost` in minor units and `notes`). A `date_recurring` task gets its next instance at the next due date, a `usage_hours` task a new instance counting from `doneAt`. Send the lock token in the platform optimistic-lock header (400 `lock_token_required` without it).',
      requestBody: { contentType: 'application/json', schema: maintenanceCompleteSchema.omit({ id: true }) },
      responses: [{ status: 200, description: 'The task, done', schema: responseSchema }],
      errors: [
        { status: 400, description: 'Invalid input, `lock_token_required`', schema: errorSchema },
        { status: 403, description: '`scope_denied` (a place the caller does not maintain)', schema: errorSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
        { status: 409, description: '`invalid_transition`, `optimistic_lock_conflict`', schema: errorSchema },
      ],
    },
  },
}
