// `GET /api/communication/threads/unread-count` — the number of the caller's own threads with a message they have not
// read (foundation III DD-M13, REQ-M10): the badge of the "Messages" tile on `/club`.
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { errorResponse } from '@/modules/foundation'
import { unreadCount } from '../../../services/threads'
import { errorSchema, requestReader } from '../../shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['communication.view'] },
}

export async function GET(request: Request): Promise<Response> {
  try {
    const reader = await requestReader(request)
    if (reader instanceof Response) return reader
    return Response.json({ count: await unreadCount(reader.viewer) })
  } catch (error: unknown) {
    return errorResponse(error, 'communication.threads.unread_count')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Communication',
  summary: 'Unread threads',
  methods: {
    GET: {
      summary: 'Count the threads of the caller with unread messages',
      responses: [{ status: 200, description: 'The count', schema: z.object({ count: z.number() }) }],
      errors: [{ status: 401, description: 'Not signed in', schema: errorSchema }],
    },
  },
}
