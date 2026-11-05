// `POST /api/communication/threads/{id}/replies` — `communication.threads.reply` (foundation III REQ-M06, DD-M12, R15):
// a participant, the coordinator of the thread's section or the administrator replies. A staff reply reaches every
// participant; a member's reply reaches the thread's staff only and is shown to the staff and the replier's household
// only. Recipients get an in-app notification and an e-mail after the commit. Not undoable.
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { errorResponse } from '@/modules/foundation'
import type { ThreadCommandResult } from '../../../../commands/threads'
import { commandResponseSchema, errorSchema, jsonBody, requestReader, runCommand } from '../../../shared'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['communication.view'] },
}

const paramsSchema = z.object({ id: z.uuid() })
const bodySchema = z.object({ body: z.string().min(1).max(10_000) })

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = paramsSchema.parse(await context.params)
    const reader = await requestReader(request)
    if (reader instanceof Response) return reader
    const result = await runCommand<ThreadCommandResult>(reader.ctx, 'communication.threads.reply', {
      ...(await jsonBody(request)),
      threadId: id,
    })
    return Response.json(
      {
        ok: true,
        threadId: result.threadId,
        messageId: result.messageId,
        dispatchId: result.dispatchId,
        actingRole: result.actingRole,
        updatedAt: result.threadUpdatedAt,
      },
      { status: 201 },
    )
  } catch (error: unknown) {
    return errorResponse(error, 'communication.threads.reply')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Communication',
  summary: 'Reply in a thread',
  methods: {
    POST: {
      summary: 'Reply in a thread',
      description:
        'A staff reply goes to every participant; a member reply goes to the thread staff only (DD-M12) and other families never see it (R15). Not undoable.',
      requestBody: { contentType: 'application/json', schema: bodySchema },
      responses: [{ status: 201, description: 'The reply', schema: commandResponseSchema }],
      errors: [
        { status: 400, description: 'Validation failed', schema: errorSchema },
        {
          status: 403,
          description:
            '`scope_denied` — not a participant of the thread; `scope_unlinked` — the account is not linked to a person of this club',
          schema: errorSchema,
        },
        { status: 404, description: 'Not found', schema: errorSchema },
      ],
    },
  },
}
