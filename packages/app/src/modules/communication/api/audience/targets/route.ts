// `GET /api/communication/audience/targets` — what the composer may offer the author (foundation III REQ-M05, P-32
// `AudiencePicker`): the audience kinds their grants allow (a coach: group, activity, session) and, with `kind`, the
// targets of that kind inside their grants (a coach: the groups they coach and their activities and sessions),
// filtered by `q`.
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { errorResponse } from '@/modules/foundation'
import { targetsQuerySchema } from '../../../data/validators'
import { composerTargets } from '../../../services/composer'
import { errorSchema, queryOf, requestReader } from '../../shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['communication.post'] },
}

export async function GET(request: Request): Promise<Response> {
  try {
    const reader = await requestReader(request)
    if (reader instanceof Response) return reader
    const query = targetsQuerySchema.parse(queryOf(request))
    return Response.json(await composerTargets(reader.viewer, query.kind, query.q))
  } catch (error: unknown) {
    return errorResponse(error, 'communication.audience.targets')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Communication',
  summary: 'Audience targets',
  methods: {
    GET: {
      summary: 'List the audience kinds and targets the caller may address',
      query: targetsQuerySchema,
      responses: [
        {
          status: 200,
          description: 'The kinds and, with `kind`, its targets',
          schema: z.object({
            kinds: z.array(z.enum(['club', 'section', 'group', 'activity', 'occurrence'])),
            items: z.array(z.object({ id: z.uuid(), label: z.string(), hint: z.string().nullable() })),
          }),
        },
      ],
      errors: [{ status: 400, description: 'Validation failed', schema: errorSchema }],
    },
  },
}
