// `GET /api/communication/threads/{id}` — a thread with its messages as the reader may see them (foundation III
// DD-M10, DD-M12; R15): the latest revision of each message with "edited" / "deleted"; a member sees the messages for
// everyone and their household's replies only. 404 for an unknown thread, 403 `scope_denied` for one not theirs
// (`scope_unlinked` when the account is not linked to a person of this club, #155).
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { errorResponse } from '@/modules/foundation'
import { threadDetail } from '../../../services/threads'
import { errorSchema, notFoundResponse, requestReader, threadDetailSchema } from '../../shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['communication.view'] },
}

const paramsSchema = z.object({ id: z.uuid() })

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = paramsSchema.parse(await context.params)
    const reader = await requestReader(request)
    if (reader instanceof Response) return reader
    const detail = await threadDetail(reader.viewer, id)
    if (!detail) return await notFoundResponse()
    return Response.json(detail)
  } catch (error: unknown) {
    return errorResponse(error, 'communication.threads.detail')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Communication',
  summary: 'A thread',
  methods: {
    GET: {
      summary: 'Read a thread with its messages',
      responses: [{ status: 200, description: 'The thread', schema: threadDetailSchema }],
      errors: [
        {
          status: 403,
          description: '`scope_denied`; `scope_unlinked` — the account is not linked to a person of this club',
          schema: errorSchema,
        },
        { status: 404, description: 'Not found', schema: errorSchema },
      ],
    },
  },
}
