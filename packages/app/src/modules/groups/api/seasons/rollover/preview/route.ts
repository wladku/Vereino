// `POST /api/groups/seasons/rollover/preview` (people life-cycle spec *API* row, REQ-L08, B-11 Seasons tab; phase L9,
// #311): the old season's groups in the caller's scope, the recurring activities and fees a plan may end or copy, what
// the plan creates, changes and ends per module, the conflicts of the copies, and the preview token the rollover is
// confirmed with (15 minutes). Read only. 403 for a group outside the caller's scope; 422 plan errors.
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import { previewRollover } from '../../../../commands/season-rollover'
import { rolloverPreviewSchema } from '../../../../data/validators'
import { errorSchema } from '../../../shared'
import { rolloverPreviewResponseSchema } from '../shared'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['groups.manage'] },
}

export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await commandContextForRequest(request)
    if (!ctx?.auth) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const body: unknown = await request.json().catch(() => ({}))
    const { preview, previewToken } = await previewRollover(ctx, body)
    return Response.json({ ...preview, previewToken }, { headers: { 'cache-control': 'private, no-store' } })
  } catch (error: unknown) {
    return errorResponse(error, 'groups.seasons.rollover.preview')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Groups',
  summary: 'Preview a season rollover',
  methods: {
    POST: {
      summary: 'Preview a new season',
      description:
        "Lists the old season's active groups in the caller's scope (a coordinator: the groups of their sections), the recurring activities and fees of those groups, and what the plan creates, changes and ends per module on the old season's last day, with the conflicts of the copied activities. Send an empty `groups` list to read the groups only. The `previewToken` confirms exactly this plan for 15 minutes.",
      requestBody: { contentType: 'application/json', schema: rolloverPreviewSchema },
      responses: [{ status: 200, description: 'The preview', schema: rolloverPreviewResponseSchema }],
      errors: [
        { status: 403, description: 'scope_denied (a group of another section)', schema: errorSchema },
        { status: 404, description: 'The old season is not a season of the club', schema: errorSchema },
        {
          status: 409,
          description: 'season_name_taken (the plan creates a season with a name in use)',
          schema: errorSchema,
        },
        {
          status: 422,
          description:
            'groups_reference_invalid, season_dates_inverted, rollover_same_season, rollover_season_overlap, rollover_group_unknown, rollover_group_action_duplicate, rollover_name_required, rollover_record_unknown, rollover_record_action_duplicate, rollover_copy_invalid',
          schema: errorSchema,
        },
      ],
    },
  },
}
