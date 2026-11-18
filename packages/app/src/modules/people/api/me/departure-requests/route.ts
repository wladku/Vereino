// `GET` and `POST /api/people/me/departure-requests` (people life-cycle spec *API* row, `/club/profile/leave`, REQ-L03;
// phase L4, #306): the member's own requests to leave (open, done, declined with the reason) and a new request for
// themself and/or their own active wards — `people.departure_requests.file`. 403 for anyone else; 409
// `departure_request_exists`; 422 `departure_request_minor`, `departure_date_in_past`; 429 with `Retry-After` after 5
// requests in 24 hours. The scope comes only from the session.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse, trustedScopeOf } from '@/modules/foundation'
import { peopleErrors } from '../../errors'
import type { DepartureRequestCommandResult } from '../../../commands/departure-requests'
import { memberDepartureRequestSchema } from '../../../data/validators'
import { limitDepartureRequest } from '../../../services/account-limits'
import { clubToday } from '../../../services/club-clock'
import { memberDepartureRequests, memberPerson } from '../../../services/departure-requests-read'
import { errorSchema } from '../../shared'
import { departureRequestSchema } from '../../departure-requests/shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['people.self'] },
  POST: { requireAuth: true, requireFeatures: ['people.self'] },
}

async function memberSession(request: Request) {
  const ctx = await commandContextForRequest(request)
  const scope = ctx ? trustedScopeOf(ctx) : null
  if (!ctx?.auth || !scope) return null
  const person = await memberPerson(ctx.container, scope, ctx.auth.sub)
  return { ctx, scope, person }
}

export async function GET(request: Request): Promise<Response> {
  try {
    const session = await memberSession(request)
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    if (!session.person) return await peopleErrors.throw('person_not_linked')
    const today = await clubToday(session.ctx.container, session.scope)
    const items = await memberDepartureRequests(session.ctx.container, session.scope, session.person.id, today)
    return Response.json({ items }, { headers: { 'cache-control': 'private, no-store' } })
  } catch (error: unknown) {
    return errorResponse(error, 'people.me.departure_requests.read')
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const session = await memberSession(request)
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    if (!session.person) return await peopleErrors.throw('person_not_linked')
    const limited = await limitDepartureRequest(session.ctx.container, request, {
      tenantId: session.scope.tenantId,
      callerPersonId: session.person.id,
    })
    if (limited) return limited
    const body: unknown = await request.json().catch(() => ({}))
    const commandBus = session.ctx.container.resolve<CommandBus>('commandBus')
    const { result } = await commandBus.execute<unknown, DepartureRequestCommandResult>(
      'people.departure_requests.file',
      { input: body, ctx: session.ctx },
    )
    return Response.json(
      { batchId: result.batchId, requestIds: result.requestIds, subjectPersonIds: result.subjectPersonIds },
      { status: 201 },
    )
  } catch (error: unknown) {
    return errorResponse(error, 'people.departure_requests.file')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'People',
  summary: "The member's requests to leave the club",
  methods: {
    GET: {
      summary: 'List my requests to leave',
      description: 'The requests the signed-in member filed, newest first; a declined one carries the reason.',
      responses: [
        { status: 200, description: 'Requests', schema: z.object({ items: z.array(departureRequestSchema) }) },
      ],
      errors: [{ status: 404, description: 'person_not_linked', schema: errorSchema }],
    },
    POST: {
      summary: 'Ask to leave the club',
      description:
        'Files a request for the member and/or their own active wards (one row per person, sharing `batchId`). The club decides; the administrators are told. A minor cannot file one. At most 5 requests in 24 hours.',
      requestBody: { contentType: 'application/json', schema: memberDepartureRequestSchema },
      responses: [
        {
          status: 201,
          description: 'Request filed',
          schema: z.object({
            batchId: z.uuid(),
            requestIds: z.array(z.uuid()),
            subjectPersonIds: z.array(z.uuid()),
          }),
        },
      ],
      errors: [
        { status: 403, description: 'scope_denied', schema: errorSchema },
        { status: 404, description: 'person_not_linked', schema: errorSchema },
        { status: 409, description: 'departure_request_exists', schema: errorSchema },
        { status: 422, description: 'departure_request_minor, departure_date_in_past', schema: errorSchema },
        {
          status: 429,
          description: 'Too many requests',
          schema: z.object({ error: z.string(), code: z.literal('rate_limited'), retryAfterSeconds: z.number() }),
        },
      ],
    },
  },
}
