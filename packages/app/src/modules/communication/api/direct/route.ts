// `GET /api/communication/direct` — the household members the caller may write about (themself, their wards), the
// groups each takes part in today and the staff they may address there (foundation III REQ-M12, DD-M18; #138).
// `POST /api/communication/direct` — `communication.threads.start_direct`: a member's direct thread about a household
// member to the coaches of that member's group or to the coordinators of its section; 201
// `{ threadId, messageId, dispatchId }`; the staff get an in-app notification and an e-mail after the commit.
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { errorResponse } from '@/modules/foundation'
import type { ThreadCommandResult } from '../../commands/threads'
import { directThreadSchema } from '../../data/validators'
import { directThreadOptions } from '../../services/direct'
import { commandResponseSchema, errorSchema, jsonBody, requestReader, runCommand } from '../shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['communication.view'] },
  POST: { requireAuth: true, requireFeatures: ['communication.view'] },
}

export async function GET(request: Request): Promise<Response> {
  try {
    const reader = await requestReader(request)
    if (reader instanceof Response) return reader
    return Response.json(await directThreadOptions(reader.viewer))
  } catch (error: unknown) {
    return errorResponse(error, 'communication.direct.options')
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const reader = await requestReader(request)
    if (reader instanceof Response) return reader
    const result = await runCommand<ThreadCommandResult>(
      reader.ctx,
      'communication.threads.start_direct',
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
    return errorResponse(error, 'communication.threads.start_direct')
  }
}

const directOptionSchema = z.object({
  personId: z.uuid().describe('The household member the thread is about: the caller or a ward'),
  personName: z.string(),
  groupId: z.uuid().describe('A group the member takes part in today'),
  groupName: z.string(),
  sectionId: z.uuid(),
  sectionName: z.string(),
  coachNames: z.array(z.string()).describe('The group’s coaches and assistants today (`to = coaches`)'),
  coordinatorNames: z.array(z.string()).describe('The section’s coordinators today (`to = coordinator`)'),
})

export const openApi: OpenApiRouteDoc = {
  tag: 'Communication',
  summary: 'Direct threads by members',
  methods: {
    GET: {
      summary: 'List whom the caller may write to',
      description:
        'For the caller and each of their wards, the groups they take part in today with the names of the group’s coaches and of the section’s coordinators (staff names only; the caller is left out). Empty for a user linked to no person or a household without a group.',
      responses: [
        {
          status: 200,
          description: 'The options of the member page',
          schema: z.object({ items: z.array(directOptionSchema) }),
        },
      ],
      errors: [{ status: 401, description: 'Not signed in', schema: errorSchema }],
    },
    POST: {
      summary: 'Write to the coaches or the coordinator',
      description:
        'Starts a direct thread about a household member (`personId`: the caller or a ward) with the coaches of a group that member takes part in today (`to = coaches`) or the coordinators of its section (`to = coordinator`). The audience is that member (with an account), the active guardians of a minor and the addressed staff — never another family. The staff get an in-app notification and an e-mail after the commit. At most 20 direct threads per member in 24 hours; no attachments. Not undoable.',
      requestBody: { contentType: 'application/json', schema: directThreadSchema },
      responses: [
        { status: 201, description: 'The thread, its message and the dispatch', schema: commandResponseSchema },
      ],
      errors: [
        { status: 400, description: 'Validation failed', schema: errorSchema },
        { status: 401, description: 'Not signed in', schema: errorSchema },
        {
          status: 403,
          description:
            '`scope_denied` — the person is outside the caller’s household, or does not take part in the group today',
          schema: errorSchema,
        },
        {
          status: 422,
          description:
            '`direct_no_recipients` — the group has no coach or the section no coordinator today; `audience_too_large`, `dispatch_params_invalid`',
          schema: errorSchema,
        },
        {
          status: 429,
          description: '`direct_thread_limit` — the caller started 20 direct threads in the last 24 hours',
          schema: errorSchema,
        },
      ],
    },
  },
}
