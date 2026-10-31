// `GET, PUT /api/activities/occurrences/{id}/attendance` — `activities.attendance.mark` (club spec API table, glossary
// *Actual attendance*, UI row `/club/occurrences/[id]/attendance`; REQ-007, REQ-008; TEST-009, TEST-011; #33): the
// coach's list — expected and reported absences (or confirmed, declined and unanswered) before the session, the actual
// attendance after it — read and saved by a coach of the group, the session's assigned coach, the coordinator of the
// section or the club administrator. A save sends the session version in the platform optimistic-lock header and
// answers with the refreshed list; `complete` closes the session.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse, trustedScopeOf } from '@/modules/foundation'
import type { CheckOffCommandResult } from '../../../../commands/check-off'
import { attendanceMarkBodySchema } from '../../../../data/validators'
import { readAttendanceList } from '../../../../services/attendance-list'
import { attendanceListSchema, errorSchema } from '../../../shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['activities.coach'] },
  PUT: { requireAuth: true, requireFeatures: ['activities.coach'] },
}

const paramsSchema = z.object({ id: z.uuid() })
const noStore = { 'cache-control': 'private, no-store' }

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = paramsSchema.parse(await context.params)
    const ctx = await commandContextForRequest(request)
    const scope = ctx ? trustedScopeOf(ctx) : null
    if (!ctx || !scope) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const list = await readAttendanceList(ctx, scope, id)
    if (!list) return Response.json({ error: 'Not found' }, { status: 404 })
    return Response.json(list, { headers: noStore })
  } catch (error: unknown) {
    return errorResponse(error, 'activities.attendance.list')
  }
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = paramsSchema.parse(await context.params)
    const ctx = await commandContextForRequest(request)
    const scope = ctx ? trustedScopeOf(ctx) : null
    if (!ctx || !scope) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const body: unknown = await request.json().catch(() => ({}))
    const commandBus = ctx.container.resolve<CommandBus>('commandBus')
    await commandBus.execute<unknown, CheckOffCommandResult>('activities.attendance.mark', {
      input: { ...(typeof body === 'object' && body !== null ? body : {}), id },
      ctx,
    })
    const list = await readAttendanceList(ctx, scope, id)
    if (!list) return Response.json({ error: 'Not found' }, { status: 404 })
    return Response.json(list, { headers: noStore })
  } catch (error: unknown) {
    return errorResponse(error, 'activities.attendance.mark')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'Activities',
  summary: 'The coach attendance list of a session',
  methods: {
    GET: {
      summary: 'Read the attendance list',
      description:
        'The group’s participants on the session date and anyone with an attendance row, each with the declaration, what it means for the list under the club’s declaration kind, the actual attendance and who marked it in which role; the summary line and whether the check-off is open.',
      responses: [{ status: 200, description: 'The attendance list', schema: attendanceListSchema }],
      errors: [
        { status: 403, description: 'scope_denied (a coach of another group)', schema: errorSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
      ],
    },
    PUT: {
      summary: 'Check off actual attendance and optionally close the session',
      description:
        'Saves `present`, `absent` or `late` (or `null` to clear) for persons on the list, from the session’s start until it is closed; `complete: true` also closes the session (`done`). Send the session version (`updatedAt`) in the platform optimistic-lock header (required). Answers with the refreshed list.',
      requestBody: { contentType: 'application/json', schema: attendanceMarkBodySchema },
      responses: [{ status: 200, description: 'The refreshed attendance list', schema: attendanceListSchema }],
      errors: [
        {
          status: 400,
          description: 'Invalid input, or `attendance_version_required` (no session version sent)',
          schema: errorSchema,
        },
        { status: 403, description: 'scope_denied (a coach of another group)', schema: errorSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
        {
          status: 409,
          description:
            '`occurrence_not_planned` (cancelled or done), `attendance_not_started`, `optimistic_lock_conflict` (a stale session version)',
          schema: errorSchema,
        },
        { status: 422, description: '`attendance_person_not_listed`', schema: errorSchema },
      ],
    },
  },
}
