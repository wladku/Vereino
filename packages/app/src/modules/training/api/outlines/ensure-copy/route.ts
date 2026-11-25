// `POST /api/training/outlines/ensure-copy` → `training.outlines.ensure_copy` (training outlines spec *API*, DD-O07;
// M-O6; #683): the session's own copy of its activity's series outline, made now when the session has none — the
// session widget calls it explicitly, so no GET writes. Idempotent: 200 with the session's existing outline, 201 with
// a new copy, 200 `{ id: null }` when the activity has no series outline. For a coach of the session's group, a
// coordinator of its section and the club administrator; another club's session answers 404.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import type { OutlineCommandResult } from '../../../commands/outlines'
import { errorSchema } from '../../shared'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['training.outlines.write'] },
}

const bodySchema = z.object({ occurrenceId: z.uuid() })

const responseSchema = z.object({ id: z.uuid().nullable(), created: z.boolean() })

export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await commandContextForRequest(request)
    if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const input: unknown = await request.json().catch(() => ({}))
    const { result } = await ctx.container
      .resolve<CommandBus>('commandBus')
      .execute<unknown, OutlineCommandResult | { entity: null }>('training.outlines.ensure_copy', { input, ctx })
    if (!result.entity) return Response.json({ id: null, created: false })
    const created = 'created' in result && result.created === true
    return Response.json({ id: result.entity.id, created }, { status: created ? 201 : 200 })
  } catch (error: unknown) {
    return errorResponse(error, 'training.outlines.ensure_copy')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Training',
  summary: 'Ensure a session’s outline copy',
  methods: {
    POST: {
      summary: 'Make the session’s copy of its series outline when it has none',
      description:
        'Idempotent: answers the session’s outline when it has one (200), a new copy of the activity’s series outline (201), or `{ id: null }` (200) when the activity has no series outline.',
      requestBody: { contentType: 'application/json', schema: bodySchema },
      responses: [
        { status: 200, description: 'The existing outline, or none', schema: responseSchema },
        { status: 201, description: 'The new copy', schema: responseSchema },
      ],
      errors: [
        { status: 400, description: 'Invalid input', schema: errorSchema },
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 403, description: '`scope_denied`', schema: errorSchema },
        { status: 404, description: 'Unknown session', schema: errorSchema },
      ],
    },
  },
}
