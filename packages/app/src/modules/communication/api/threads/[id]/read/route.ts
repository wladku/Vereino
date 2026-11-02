// `POST /api/communication/threads/{id}/read` — `communication.threads.mark_read` (foundation III DD-M13): moves the
// reader's read marker of the thread to now; not logged, not undoable.
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { errorResponse } from '@/modules/foundation'
import type { MarkReadResult } from '../../../../commands/threads'
import { errorSchema, requestReader, runCommand } from '../../../shared'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['communication.view'] },
}

const paramsSchema = z.object({ id: z.uuid() })

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = paramsSchema.parse(await context.params)
    const reader = await requestReader(request)
    if (reader instanceof Response) return reader
    const result = await runCommand<MarkReadResult>(reader.ctx, 'communication.threads.mark_read', { threadId: id })
    return Response.json({ ok: true, ...result })
  } catch (error: unknown) {
    return errorResponse(error, 'communication.threads.mark_read')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Communication',
  summary: 'Mark a thread read',
  methods: {
    POST: {
      summary: 'Mark a thread read',
      responses: [
        {
          status: 200,
          description: 'The read marker',
          schema: z.object({ ok: z.literal(true), threadId: z.uuid(), lastReadAt: z.string() }),
        },
      ],
      errors: [
        { status: 403, description: '`scope_denied`', schema: errorSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
      ],
    },
  },
}
