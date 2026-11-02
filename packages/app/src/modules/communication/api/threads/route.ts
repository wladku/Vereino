// `GET /api/communication/threads` — the threads the reader sees (foundation III DD-M12; `as=member` the inbox of
// their own threads), with unread state, newest activity first, in the S6.4 envelope; filters `scopeType`, `scopeId`,
// `unread=1`, `isCase=1`. `POST /api/communication/threads` — `communication.threads.create`: an announcement to the
// club, a section, a group, an activity or a session the author's grants cover (REQ-M06); 201
// `{ threadId, messageId, dispatchId }`; recipients get an in-app notification and an e-mail after the commit.
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { errorResponse } from '@/modules/foundation'
import type { ThreadCommandResult } from '../../commands/threads'
import { threadCreateSchema, threadListQuerySchema } from '../../data/validators'
import { listThreads } from '../../services/threads'
import { errorSchema, jsonBody, queryOf, requestReader, runCommand, threadListSchema } from '../shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['communication.view'] },
  POST: { requireAuth: true, requireFeatures: ['communication.post'] },
}

export async function GET(request: Request): Promise<Response> {
  try {
    const reader = await requestReader(request)
    if (reader instanceof Response) return reader
    const query = threadListQuerySchema.parse(queryOf(request))
    const body = await listThreads(reader.viewer, {
      page: query.page,
      pageSize: query.pageSize,
      filters: {
        scopeType: query.scopeType,
        scopeId: query.scopeId,
        ...(query.isCase === '1' ? { isCase: true } : {}),
      },
      unreadOnly: query.unread === '1',
      participantOnly: query.as === 'member',
    })
    return Response.json(body)
  } catch (error: unknown) {
    return errorResponse(error, 'communication.threads.list')
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const reader = await requestReader(request)
    if (reader instanceof Response) return reader
    const result = await runCommand<ThreadCommandResult>(
      reader.ctx,
      'communication.threads.create',
      await jsonBody(request),
    )
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
    return errorResponse(error, 'communication.threads.create')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Communication',
  summary: 'Threads and announcements',
  methods: {
    GET: {
      summary: 'List the threads the caller sees',
      description:
        'Participants, the coordinators of the thread section and the club administrator see a thread (DD-M12). `as=member` lists the caller’s own threads only (the member inbox). Each item carries the caller’s unread state.',
      query: threadListQuerySchema,
      responses: [{ status: 200, description: 'A page of threads', schema: threadListSchema }],
      errors: [{ status: 401, description: 'Not signed in', schema: errorSchema }],
    },
    POST: {
      summary: 'Post an announcement',
      description:
        'Creates a thread with its first message for an audience the author’s grants cover (club: the administrator; section: its coordinator; group, activity, session: its coach too). Recipients follow the club spec *Thread* rule and get an in-app notification and an e-mail in their language after the commit. Not undoable.',
      requestBody: { contentType: 'application/json', schema: threadCreateSchema },
      responses: [
        {
          status: 201,
          description: 'The thread, its message and the dispatch',
          schema: z.object({
            ok: z.literal(true),
            threadId: z.uuid(),
            messageId: z.uuid(),
            dispatchId: z.string().nullable(),
            actingRole: z.string(),
            updatedAt: z.string(),
          }),
        },
      ],
      errors: [
        { status: 400, description: 'Validation failed', schema: errorSchema },
        {
          status: 403,
          description: '`scope_denied` — the audience is outside the author’s grants',
          schema: errorSchema,
        },
        {
          status: 422,
          description: '`audience_kind_unavailable`, `audience_too_large`, `dispatch_params_invalid`',
          schema: errorSchema,
        },
      ],
    },
  },
}
