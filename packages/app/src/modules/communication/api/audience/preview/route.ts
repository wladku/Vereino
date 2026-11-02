// `POST /api/communication/audience/preview` — the live recipient counts of the composer (foundation III REQ-M05,
// P-32 `AudiencePicker`): how many people an announcement to the audience reaches, how many of them have no e-mail
// address and how many are unreachable. Counts only, never a name; the author's grants are checked as for posting.
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { errorResponse } from '@/modules/foundation'
import { audiencePreviewSchema } from '../../../data/validators'
import { previewAudience } from '../../../services/composer'
import { errorSchema, jsonBody, requestReader } from '../../shared'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['communication.post'] },
}

export async function POST(request: Request): Promise<Response> {
  try {
    const reader = await requestReader(request)
    if (reader instanceof Response) return reader
    const { audience } = audiencePreviewSchema.parse(await jsonBody(request))
    return Response.json(await previewAudience(reader.viewer, audience))
  } catch (error: unknown) {
    return errorResponse(error, 'communication.audience.preview')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Communication',
  summary: 'Audience preview',
  methods: {
    POST: {
      summary: 'Count the recipients of an audience',
      requestBody: { contentType: 'application/json', schema: audiencePreviewSchema },
      responses: [
        {
          status: 200,
          description: 'The counts',
          schema: z.object({ recipients: z.number(), withoutEmail: z.number(), unreachable: z.number() }),
        },
      ],
      errors: [
        { status: 400, description: 'Validation failed', schema: errorSchema },
        { status: 403, description: '`scope_denied`', schema: errorSchema },
        { status: 422, description: '`audience_kind_unavailable`, `audience_too_large`', schema: errorSchema },
      ],
    },
  },
}
