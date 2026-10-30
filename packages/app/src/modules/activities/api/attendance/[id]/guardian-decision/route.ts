// `POST /api/activities/attendance/{id}/guardian-decision` — `activities.attendance.guardian_decide` (club spec API
// table, glossary *Declaration policy*; REQ-007; TEST-009; #32): a guardian of the ward approves or rejects a
// declaration waiting for them (`pending_guardian`). The feature gate is `people.self`; the record scope (the
// `guardian` grant on the ward) decides, so the ward, staff and another family get 403 `scope_denied`.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import type { DecideCommandResult } from '../../../../commands/attendance'
import { guardianDecisionSchema } from '../../../../data/validators'
import { attendanceView, attendanceViewSchema, errorSchema } from '../../../shared'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['people.self'] },
}

const paramsSchema = z.object({ id: z.uuid() })

export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = paramsSchema.parse(await context.params)
    const ctx = await commandContextForRequest(request)
    if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const body: unknown = await request.json().catch(() => ({}))
    const commandBus = ctx.container.resolve<CommandBus>('commandBus')
    const { result } = await commandBus.execute<unknown, DecideCommandResult>('activities.attendance.guardian_decide', {
      input: { ...(typeof body === 'object' && body !== null ? body : {}), id },
      ctx,
    })
    return Response.json({ ...attendanceView(result.entity), actingRole: result.actingRole })
  } catch (error: unknown) {
    return errorResponse(error, 'activities.attendance.guardian_decide')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Activities',
  summary: 'Decide on a pending declaration',
  methods: {
    POST: {
      summary: 'Approve or reject a ward declaration that waits for the guardian',
      description:
        '`approve: true` makes the declaration final, `false` rejects it (the ward then counts as unanswered). Errors: 403 `scope_denied` (not a guardian of the ward), 404, 409 `guardian_decision_not_pending`, 409 `declaration_closed` after the session started.',
      requestBody: { contentType: 'application/json', schema: guardianDecisionSchema.omit({ id: true }) },
      responses: [{ status: 200, description: 'The decided declaration', schema: attendanceViewSchema }],
      errors: [
        { status: 403, description: 'scope_denied', schema: errorSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
        { status: 409, description: 'guardian_decision_not_pending, declaration_closed', schema: errorSchema },
      ],
    },
  },
}
