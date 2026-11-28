// `GET /api/enrolment/applications/{id}/trial-sessions` (sign-up form spec M-J3 Trial sheet, DD-J12; phase 4, #801):
// the next 10 planned sessions (date, time, place) of the application's group — or of `groupId`, another live group of
// its section, e.g. for "choose a group for us" — read through `activities.occurrenceFacts.upcomingSessionsOfGroup`.
// An application of a section the caller does not decide, or of another club, answers 404 (D-034).
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { errorResponse } from '@/modules/foundation'
import { trialSessionOptions } from '../../../../services/views'
import { enrolmentErrors } from '../../../errors'
import { errorSchema, memberContext } from '../../../shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['enrolment.applications.decide'] },
}

const paramsSchema = z.object({ id: z.uuid() })
const querySchema = z.object({ groupId: z.uuid().optional() })

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const params = paramsSchema.safeParse(await context.params)
    if (!params.success) return await enrolmentErrors.throw('application_not_found')
    const query = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
    if (!query.success) return await enrolmentErrors.throw('application_group_invalid')
    const member = await memberContext(request)
    if (!member.ok) return member.error
    const options = await trialSessionOptions(
      { container: member.ctx.container, scope: member.scope, grants: member.grants },
      params.data.id,
      query.data.groupId,
    )
    if (options === null) return await enrolmentErrors.throw('application_not_found')
    if (options === 'group_invalid') return await enrolmentErrors.throw('application_group_invalid')
    return Response.json(options, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error: unknown) {
    return errorResponse(error, 'enrolment.applications.trial_sessions')
  }
}

const trialSessionSchema = z.object({
  occurrenceId: z.uuid(),
  activityName: z.string().nullable(),
  startAt: z.string(),
  endAt: z.string(),
  placeLabel: z.string().nullable(),
  status: z.string(),
  outcome: z.enum(['present', 'absent']).nullable(),
  over: z.boolean(),
})

const responseSchema = z.object({
  groupId: z.uuid().nullable(),
  items: z.array(trialSessionSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
  totalPages: z.number().int(),
})

export const openApi: OpenApiRouteDoc = {
  tag: 'Enrolment',
  summary: 'Trial sessions to propose',
  methods: {
    GET: {
      summary: "The next 10 planned sessions of the application's group (or of `groupId`)",
      query: querySchema,
      responses: [{ status: 200, description: 'The sessions', schema: responseSchema }],
      errors: [
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 404, description: '`application_not_found`', schema: errorSchema },
        { status: 422, description: '`application_group_invalid`', schema: errorSchema },
      ],
    },
  },
}
