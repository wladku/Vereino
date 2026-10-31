// `POST /api/activities/attendance/declare` — `activities.attendance.declare` (club spec API table, glossary
// *Declaration*, *Declaration policy*; REQ-007; TEST-009, TEST-011; #32): the participant, a guardian of the
// participant, a coach of the group, the coordinator of the section or the club administrator declares `yes`, `no` or
// `unknown` for one session. The feature gate is `activities.attendance.declare` (every member holds it); the record
// scope decides whose declaration it is (403 `scope_denied` for another family's child).
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse } from '@/modules/foundation'
import type { DeclareCommandResult } from '../../../commands/attendance'
import { attendanceDeclareSchema } from '../../../data/validators'
import { attendanceView, attendanceViewSchema, errorSchema } from '../../shared'

export const metadata = {
  POST: { requireAuth: true, requireFeatures: ['activities.attendance.declare'] },
}

export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await commandContextForRequest(request)
    if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const body: unknown = await request.json().catch(() => ({}))
    const commandBus = ctx.container.resolve<CommandBus>('commandBus')
    const { result } = await commandBus.execute<unknown, DeclareCommandResult>('activities.attendance.declare', {
      input: body,
      ctx,
    })
    return Response.json(
      { ...attendanceView(result.entity), actingRole: result.actingRole, created: result.created },
      { status: result.created ? 201 : 200 },
    )
  } catch (error: unknown) {
    return errorResponse(error, 'activities.attendance.declare')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Activities',
  summary: 'Declare attendance for a session',
  methods: {
    POST: {
      summary: 'Declare yes, no or unknown for one person and session',
      description:
        'The participant, a guardian of the participant, a coach of the group, the coordinator of the section or the club administrator. An `absence_only` session (the club setting per activity type) refuses `yes` with 422 `declaration_kind_absence_only`. A minor declaring for themself follows the policy: `immediate` is final, `guardian_confirm` answers `declarationStatus: pending_guardian` until the guardian decides or the limit passes, `guardian_only` answers 403 `declaration_guardian_only`. After the session starts 409 `declaration_closed`; a cancelled or done session 409 `occurrence_not_planned`; a person who is not a participant of the session 422 `declaration_not_participant`.',
      requestBody: { contentType: 'application/json', schema: attendanceDeclareSchema },
      responses: [
        {
          status: 201,
          description: 'The first declaration of the person for the session',
          schema: attendanceViewSchema,
        },
        { status: 200, description: 'A changed declaration', schema: attendanceViewSchema },
      ],
      errors: [
        { status: 400, description: 'Validation failed', schema: errorSchema },
        { status: 403, description: 'scope_denied, declaration_guardian_only', schema: errorSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
        { status: 409, description: 'declaration_closed, occurrence_not_planned', schema: errorSchema },
        { status: 422, description: 'declaration_kind_absence_only, declaration_not_participant', schema: errorSchema },
      ],
    },
  },
}
