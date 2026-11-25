// `POST /api/training/outlines/{id}/attach` → `training.outlines.attach` (training outlines spec *API*, DD-O07;
// REQ-O07; #683): `{ occurrenceId }` copies the outline into that session; `{ activityId }` makes a copy the series
// outline of that recurring activity, and each of its planned future sessions gets its own copy. The original stays
// where it was. The caller must be allowed to read the outline (its author, a coach of its group, a coordinator, the
// administrator) and to plan the session or activity (a coach of its group, a coordinator of its section, the
// administrator).
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import type { OutlineCommandResult } from '../../../../commands/outlines'
import { createdResponseSchema, errorSchema } from '../../../shared'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['training.outlines.write'] },
}

const paramsSchema = z.object({ id: z.uuid() })
const bodySchema = z.object({ occurrenceId: z.uuid().optional(), activityId: z.uuid().optional() })

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const params = paramsSchema.safeParse(await context.params)
    if (!params.success) return Response.json({ error: 'Not found' }, { status: 404 })
    const ctx = await commandContextForRequest(request)
    if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const body: unknown = await request.json().catch(() => ({}))
    const input = { ...(body && typeof body === 'object' ? body : {}), id: params.data.id }
    const { result } = await ctx.container
      .resolve<CommandBus>('commandBus')
      .execute<unknown, OutlineCommandResult>('training.outlines.attach', { input, ctx })
    return Response.json(
      { id: result.entity.id, updatedAt: result.entity.updatedAt.toISOString(), copyIds: result.copyIds },
      { status: 201 },
    )
  } catch (error: unknown) {
    return errorResponse(error, 'training.outlines.attach')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Training',
  summary: 'Attach a training outline',
  methods: {
    POST: {
      summary: 'Copy an outline into a session or make it a recurring activity’s series outline',
      description:
        'Give exactly one of `occurrenceId` and `activityId`. A series outline’s copies go to the activity’s planned sessions from now on; later sessions get theirs when they are generated.',
      requestBody: { contentType: 'application/json', schema: bodySchema },
      responses: [{ status: 201, description: 'The new outline', schema: createdResponseSchema }],
      errors: [
        { status: 400, description: 'Invalid input', schema: errorSchema },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 403, description: '`scope_denied`, `scope_unlinked`', schema: errorSchema },
        { status: 404, description: 'Unknown outline', schema: errorSchema },
        { status: 409, description: '`outline_exists`, `outline_locked`', schema: errorSchema },
        {
          status: 422,
          description: '`outline_reference_invalid`, `outline_activity_not_recurring`',
          schema: errorSchema,
        },
      ],
    },
  },
}
