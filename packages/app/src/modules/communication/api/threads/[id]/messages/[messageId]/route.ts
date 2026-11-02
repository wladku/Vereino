// `PATCH`, `DELETE /api/communication/threads/{id}/messages/{messageId}` — `communication.messages.revise` and
// `communication.messages.delete` (foundation III DD-M10): the message's author, the coordinator of the thread's
// section or the administrator appends a revision or a tombstone; the history stays. Send the thread's `updatedAt`
// in the platform optimistic-lock header (400 `lock_token_required` without it, 409 when it is stale). A case's
// messages can no longer change: 409 `case_immutable` for everyone (REQ-M09, #36). Not undoable.
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { errorResponse } from '@/modules/foundation'
import type { ThreadCommandResult } from '../../../../../commands/threads'
import { commandResponseSchema, errorSchema, jsonBody, requestReader, runCommand } from '../../../../shared'

export const metadata = {
  PATCH: { requireAuth: true, requireFeatures: ['communication.view'] },
  DELETE: { requireAuth: true, requireFeatures: ['communication.view'] },
}

const paramsSchema = z.object({ id: z.uuid(), messageId: z.uuid() })
const bodySchema = z.object({ body: z.string().min(1).max(10_000) })

function respond(result: ThreadCommandResult): Response {
  return Response.json({
    ok: true,
    threadId: result.threadId,
    messageId: result.messageId,
    dispatchId: result.dispatchId,
    actingRole: result.actingRole,
    updatedAt: result.threadUpdatedAt,
  })
}

type RouteContext = { params: Promise<{ id: string; messageId: string }> }

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  try {
    const { id, messageId } = paramsSchema.parse(await context.params)
    const reader = await requestReader(request)
    if (reader instanceof Response) return reader
    const result = await runCommand<ThreadCommandResult>(reader.ctx, 'communication.messages.revise', {
      ...(await jsonBody(request)),
      threadId: id,
      messageId,
    })
    return respond(result)
  } catch (error: unknown) {
    return errorResponse(error, 'communication.messages.revise')
  }
}

export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  try {
    const { id, messageId } = paramsSchema.parse(await context.params)
    const reader = await requestReader(request)
    if (reader instanceof Response) return reader
    const result = await runCommand<ThreadCommandResult>(reader.ctx, 'communication.messages.delete', {
      threadId: id,
      messageId,
    })
    return respond(result)
  } catch (error: unknown) {
    return errorResponse(error, 'communication.messages.delete')
  }
}

const errors = [
  { status: 400, description: 'Validation failed, `lock_token_required`', schema: errorSchema },
  {
    status: 403,
    description: '`scope_denied` — not the author, the section coordinator or the administrator',
    schema: errorSchema,
  },
  { status: 404, description: 'Not found', schema: errorSchema },
  {
    status: 409,
    description:
      '`case_immutable` (the thread is a case), `optimistic_lock_conflict`, `message_deleted`, `message_not_editable` (a system message)',
    schema: errorSchema,
  },
]

export const openApi: OpenApiRouteDoc = {
  tag: 'Communication',
  summary: 'Edit or delete a message',
  methods: {
    PATCH: {
      summary: 'Edit a message (appends a revision)',
      requestBody: { contentType: 'application/json', schema: bodySchema },
      responses: [{ status: 200, description: 'The revision was appended', schema: commandResponseSchema }],
      errors,
    },
    DELETE: {
      summary: 'Delete a message (appends a tombstone)',
      responses: [{ status: 200, description: 'The tombstone was appended', schema: commandResponseSchema }],
      errors,
    },
  },
}
