// `GET /api/communication/share-text?occurrenceId=` or `?threadId=` — the one-line text with a link the author pastes
// into the group chat (foundation III REQ-M08, DD-M14; club spec D09, J-003 step 2). A session's text comes from
// `activities.shareText` with the public session page `/p/[clubSlug]/s/[occurrenceId]`; a thread's text is its
// subject with the member thread link, which requires a sign-in. No names, no roster, no token. 404
// `share_text_unavailable` when `activities` is not enabled or the target is unknown.
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { errorResponse } from '@/modules/foundation'
import { shareTextQuerySchema } from '../../data/validators'
import { shareText } from '../../services/composer'
import { errorSchema, queryOf, requestReader } from '../shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['communication.post'] },
}

export async function GET(request: Request): Promise<Response> {
  try {
    const reader = await requestReader(request)
    if (reader instanceof Response) return reader
    const query = shareTextQuerySchema.parse(queryOf(request))
    return Response.json(await shareText(reader.viewer, query))
  } catch (error: unknown) {
    return errorResponse(error, 'communication.share_text')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Communication',
  summary: 'Share text',
  methods: {
    GET: {
      summary: 'The text with a link to paste into the group chat',
      query: z.object({ occurrenceId: z.uuid().optional(), threadId: z.uuid().optional() }),
      responses: [
        { status: 200, description: 'The text and its link', schema: z.object({ text: z.string(), url: z.string() }) },
      ],
      errors: [
        { status: 400, description: 'Name either a session or a thread', schema: errorSchema },
        {
          status: 403,
          description: '`scope_denied`; `scope_unlinked` — the account is not linked to a person of this club',
          schema: errorSchema,
        },
        { status: 404, description: '`share_text_unavailable`', schema: errorSchema },
      ],
    },
  },
}
