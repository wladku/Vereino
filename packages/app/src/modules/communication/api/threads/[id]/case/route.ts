// `POST /api/communication/threads/{id}/case` — `communication.threads.mark_case` (foundation III REQ-M09, DD-M11;
// club spec REQ-010): the coordinator of the thread's section or the administrator marks the thread as a case. Send
// the thread's `updatedAt` in the platform optimistic-lock header (400 `lock_token_required` without it, 409 when it
// is stale). From then on its messages can no longer be edited or deleted (409 `case_immutable`); the marking cannot
// be undone and a second one answers 409 `case_already_open`. Emits `communication.case.opened` (ids only).
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { errorResponse } from '@/modules/foundation'
import type { MarkCaseResult } from '../../../../commands/threads'
import { errorSchema, requestReader, runCommand } from '../../../shared'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['communication.cases.manage'] },
}

const paramsSchema = z.object({ id: z.uuid() })

const responseSchema = z.object({
  ok: z.literal(true),
  threadId: z.uuid(),
  isCase: z.literal(true),
  caseOpenedAt: z.string(),
  actingRole: z.string().describe('The role the case was marked in (R01): `coordinator` or `club_admin`'),
  updatedAt: z.string().describe('The thread’s new version'),
})

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = paramsSchema.parse(await context.params)
    const reader = await requestReader(request)
    if (reader instanceof Response) return reader
    const result = await runCommand<MarkCaseResult>(reader.ctx, 'communication.threads.mark_case', { threadId: id })
    return Response.json({
      ok: true,
      threadId: result.threadId,
      isCase: true,
      caseOpenedAt: result.caseOpenedAt,
      actingRole: result.actingRole,
      updatedAt: result.threadUpdatedAt,
    })
  } catch (error: unknown) {
    return errorResponse(error, 'communication.threads.mark_case')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Communication',
  summary: 'Mark a thread as a case',
  methods: {
    POST: {
      summary: 'Mark a thread as a case',
      description:
        'The coordinator of the thread section or the club administrator marks the thread as a case: its messages can no longer be edited or deleted, its history stays, and it stays visible to its participants, the section coordinator and the administrator. Requires the thread version in the optimistic-lock header. Not undoable; there is no unmark.',
      responses: [{ status: 200, description: 'The thread is a case', schema: responseSchema }],
      errors: [
        { status: 400, description: 'Validation failed, `lock_token_required`', schema: errorSchema },
        {
          status: 403,
          description:
            'Without `communication.cases.manage`; `scope_denied` — not the coordinator of the thread section or the administrator',
          schema: errorSchema,
        },
        { status: 404, description: 'Not found', schema: errorSchema },
        { status: 409, description: '`case_already_open`, `optimistic_lock_conflict`', schema: errorSchema },
      ],
    },
  },
}
