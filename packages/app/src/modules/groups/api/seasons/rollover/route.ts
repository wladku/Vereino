// `POST /api/groups/seasons/rollover` — `groups.seasons.rollover` (people life-cycle spec *API* row, REQ-L08, J-L06;
// phase L9, #311): applies a previewed season rollover in one transaction. 409 `rollover_plan_stale` when the plan or
// anything it showed changed since the preview (also for the same plan applied a second time), 409
// `rollover_conflicts` with `details.conflicts` when a copied activity collides; nothing is applied in part. With
// `announce`, each continued group gets one announcement. Not undoable.
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import type { RolloverCommandResult } from '../../../commands/season-rollover'
import { rolloverApplySchema } from '../../../data/validators'
import { errorSchema } from '../../shared'
import { rolloverSummarySchema } from './shared'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['groups.manage'] },
}

export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await commandContextForRequest(request)
    if (!ctx?.auth) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const body: unknown = await request.json().catch(() => ({}))
    const commandBus = ctx.container.resolve<CommandBus>('commandBus')
    const { result } = await commandBus.execute<unknown, RolloverCommandResult>('groups.seasons.rollover', {
      input: body,
      ctx,
    })
    return Response.json(result.summary)
  } catch (error: unknown) {
    return errorResponse(error, 'groups.seasons.rollover')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Groups',
  summary: 'Start a new season',
  methods: {
    POST: {
      summary: 'Apply a season rollover',
      description:
        "Applies the previewed plan in one transaction: continued and renamed groups move to the new season (created by the plan when it names no existing one), closed groups are deactivated and their memberships, recurring activities and fees end on the old season's last day, copied groups start with an empty roster, and each recurring activity and fee of a continued group ends, ends and is copied with the new values, or is kept. Send the `previewToken` of the preview: a change since answers 409 `rollover_plan_stale`, a collision of a copied activity 409 `rollover_conflicts`. Not undoable.",
      requestBody: { contentType: 'application/json', schema: rolloverApplySchema },
      responses: [{ status: 200, description: 'The rollover was applied', schema: rolloverSummarySchema }],
      errors: [
        { status: 403, description: 'scope_denied (a group of another section)', schema: errorSchema },
        { status: 404, description: 'The old season is not a season of the club', schema: errorSchema },
        {
          status: 409,
          description: 'rollover_plan_stale, rollover_conflicts, season_name_taken',
          schema: errorSchema,
        },
        {
          status: 422,
          description:
            'rollover_plan_empty and the plan errors of the preview (groups_reference_invalid, season_dates_inverted, rollover_*)',
          schema: errorSchema,
        },
      ],
    },
  },
}
