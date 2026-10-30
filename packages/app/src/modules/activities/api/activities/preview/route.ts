// `POST /api/activities/activities/preview` (club spec J-002 step 1, UI row `/backend/activities/activities`; foundation
// II J-G01): the sessions a new series — or an edit of `activityId` — would have in the 16-week horizon and the place
// and coach conflicts of each, before anything is saved (D02). The same checks as the save (scope, references, rule,
// times) answer the same errors; a failing occupancy provider only warns here (`providerFailed`), while the save fails
// closed.
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse, trustedScopeOf } from '@/modules/foundation'
import { activityPreviewSchema } from '../../../data/validators'
import { previewSeries } from '../../../services/preview'
import { conflictSchema, errorSchema } from '../../shared'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['activities.manage'] },
}

const previewItemSchema = z.object({
  date: z.string(),
  startAt: z.string(),
  endAt: z.string(),
  existingId: z.string().nullable().describe('The stored session an edit would move, if any.'),
  conflicts: z.array(conflictSchema),
})

const responseSchema = z.object({
  items: z.array(previewItemSchema),
  total: z.number(),
  conflictCount: z.number(),
  generatedUntil: z.string().nullable(),
  horizonEnd: z.string(),
  providerFailed: z.boolean(),
})

export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await commandContextForRequest(request)
    const scope = ctx ? trustedScopeOf(ctx) : null
    if (!ctx || !scope) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const input = activityPreviewSchema.parse(await request.json().catch(() => ({})))
    const preview = await previewSeries(ctx, scope, input)
    if (!preview) return Response.json({ error: 'Not found' }, { status: 404 })
    return Response.json(preview)
  } catch (error: unknown) {
    return errorResponse(error, 'activities.activities.preview')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Activities',
  summary: 'Preview the sessions of an activity',
  methods: {
    POST: {
      summary: 'Preview sessions and conflicts',
      description:
        'Expands the rule for the 16-week horizon and lists each session with its place and coach conflicts, without saving. With `activityId` it previews an edit: only the sessions the edit would create or move are listed. Errors as on create; conflicts never answer 409 here, they are listed per session.',
      requestBody: { contentType: 'application/json', schema: activityPreviewSchema },
      responses: [{ status: 200, description: 'The sessions with their conflicts', schema: responseSchema }],
      errors: [
        { status: 400, description: 'Invalid input', schema: errorSchema },
        { status: 403, description: 'scope_denied', schema: errorSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
        {
          status: 422,
          description:
            '`recurrence_unsupported`, `recurrence_invalid`, `activity_no_sessions`, `activity_type_requires_team`, `activity_times_inverted`, `activity_dates_inverted`, `activities_reference_invalid`, `place_not_bookable`',
          schema: errorSchema,
        },
      ],
    },
  },
}
