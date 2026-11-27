// `GET /api/enrolment/trials?occurrenceId=` (sign-up form spec M-J4, DD-J12, REQ-J16; phase 4, #801): the trial
// participants of one session for the "Trial participants" card of the attendance page — name, age on the session day,
// the guardian's phone and the mark — for a coach of the session's group, its assigned coach or a club administrator.
// A read that returns participants is recorded first (`auditedRead`, `enrolment_trial_read_logs`). A session of
// another club, an unknown one or one the caller does not coach answers 404 (D-034).
import { z } from 'zod'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { errorResponse } from '@/modules/foundation'
import { readTrialCard } from '../../services/trials'
import { enrolmentErrors } from '../errors'
import { errorSchema, memberContext } from '../shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['enrolment.trials.mark'] },
}

const querySchema = z.object({ occurrenceId: z.uuid() })

export async function GET(request: Request): Promise<Response> {
  try {
    const query = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
    if (!query.success) return await enrolmentErrors.throw('trial_session_not_found')
    const member = await memberContext(request)
    if (!member.ok) return member.error
    const card = await readTrialCard(member.ctx, member.scope, query.data.occurrenceId)
    if (!card) return await enrolmentErrors.throw('trial_session_not_found')
    return Response.json(card, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error: unknown) {
    return errorResponse(error, 'enrolment.trials.list')
  }
}

const participantSchema = z.object({
  applicationId: z.uuid(),
  kind: z.enum(['child', 'adult']),
  firstName: z.string(),
  lastName: z.string(),
  age: z.number().int().nullable().describe("Full years on the session's day"),
  guardianName: z.string().nullable(),
  phone: z.string().nullable(),
  outcome: z.enum(['present', 'absent']).nullable(),
  updatedAt: z.string(),
})

const responseSchema = z.object({
  occurrenceId: z.uuid(),
  markable: z.boolean(),
  items: z.array(participantSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
  totalPages: z.number().int(),
})

export const openApi: OpenApiRouteDoc = {
  tag: 'Enrolment',
  summary: 'Trial participants of a session',
  methods: {
    GET: {
      summary: 'The trial participants of a session the caller coaches (read recorded)',
      query: querySchema,
      responses: [{ status: 200, description: 'The trial participants', schema: responseSchema }],
      errors: [
        { status: 401, description: 'Unauthorized', schema: errorSchema },
        { status: 404, description: '`trial_session_not_found`', schema: errorSchema },
      ],
    },
  },
}
