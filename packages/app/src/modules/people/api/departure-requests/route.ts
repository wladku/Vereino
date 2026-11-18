// `/api/people/departure-requests` (people life-cycle spec *API* row, B-10 `?tab=leaving`, the dashboard widget
// "Departure requests"; phase L4, #306) — the club administrator's view of the requests to leave: `GET` lists them
// (`{ items, total, page, pageSize, totalPages }`, oldest first, filtered by status and subject), `POST` records a
// request from a letter or the club's own decision (`people.departure_requests.record`), `PUT` declines an open
// request with a reason (`people.departure_requests.decline`, with the request's version; the member is told).
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { hasKind } from '@vereino/core'
import { commandContextForRequest, errorResponse, scopeContract, trustedScopeOf } from '@/modules/foundation'
import type { DepartureRequestCommandResult } from '../../commands/departure-requests'
import {
  declineDepartureRequestSchema,
  departureRequestListQuerySchema,
  recordDepartureRequestSchema,
} from '../../data/validators'
import { clubToday } from '../../services/club-clock'
import { listDepartureRequests } from '../../services/departure-requests-read'
import { errorSchema } from '../shared'
import { departureRequestSchema } from './shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['people.manage'] },
  POST: { requireAuth: true, requireFeatures: ['people.manage'] },
  PUT: { requireAuth: true, requireFeatures: ['people.manage'] },
}

export async function GET(request: Request): Promise<Response> {
  try {
    const ctx = await commandContextForRequest(request)
    const scope = ctx ? trustedScopeOf(ctx) : null
    if (!ctx?.auth || !scope) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    // The requests carry notes and reasons: the club administrator's grant only (fail closed).
    if (!hasKind(await scopeContract.resolve(ctx), 'club_admin')) {
      return Response.json({ error: 'Forbidden', code: 'scope_denied' }, { status: 403 })
    }
    const query = departureRequestListQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams))
    const today = await clubToday(ctx.container, scope)
    const page = await listDepartureRequests(ctx.container, scope, query, today)
    return Response.json(page, { headers: { 'cache-control': 'private, no-store' } })
  } catch (error: unknown) {
    return errorResponse(error, 'people.departure_requests.list')
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const ctx = await commandContextForRequest(request)
    if (!ctx?.auth) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const body: unknown = await request.json().catch(() => ({}))
    const commandBus = ctx.container.resolve<CommandBus>('commandBus')
    const { result } = await commandBus.execute<unknown, DepartureRequestCommandResult>(
      'people.departure_requests.record',
      { input: body, ctx },
    )
    return Response.json({ id: result.requestIds[0], batchId: result.batchId }, { status: 201 })
  } catch (error: unknown) {
    return errorResponse(error, 'people.departure_requests.record')
  }
}

export async function PUT(request: Request): Promise<Response> {
  try {
    const ctx = await commandContextForRequest(request)
    if (!ctx?.auth) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const body: unknown = await request.json().catch(() => ({}))
    const commandBus = ctx.container.resolve<CommandBus>('commandBus')
    const { result } = await commandBus.execute<unknown, DepartureRequestCommandResult & { updatedAt: string }>(
      'people.departure_requests.decline',
      { input: body, ctx },
    )
    return Response.json({ ok: true, id: result.requestIds[0], updatedAt: result.updatedAt })
  } catch (error: unknown) {
    return errorResponse(error, 'people.departure_requests.decline')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'People',
  summary: 'Requests to leave the club',
  methods: {
    GET: {
      summary: 'List the requests to leave',
      description: 'Oldest first; filter by `status` and `subjectPersonId`. Club administrator only.',
      query: departureRequestListQuerySchema,
      responses: [
        {
          status: 200,
          description: 'Requests',
          schema: z.object({
            items: z.array(departureRequestSchema),
            total: z.number().int(),
            page: z.number().int(),
            pageSize: z.number().int(),
            totalPages: z.number().int(),
          }),
        },
      ],
      errors: [{ status: 403, description: 'scope_denied', schema: errorSchema }],
    },
    POST: {
      summary: 'Record a request to leave',
      description: "Records a request from a letter, a talk or the club's own decision (`requesterKind: club`).",
      requestBody: { contentType: 'application/json', schema: recordDepartureRequestSchema },
      responses: [{ status: 201, description: 'Recorded', schema: z.object({ id: z.uuid(), batchId: z.uuid() }) }],
      errors: [
        { status: 403, description: 'scope_denied', schema: errorSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
        { status: 409, description: 'departure_request_exists', schema: errorSchema },
        { status: 422, description: 'departure_date_in_past', schema: errorSchema },
      ],
    },
    PUT: {
      summary: 'Decline a request to leave',
      description:
        "Send the request's `updatedAt` as the optimistic-lock header. The reason is shown to the member in the app; the notice does not carry it.",
      requestBody: { contentType: 'application/json', schema: declineDepartureRequestSchema },
      responses: [
        {
          status: 200,
          description: 'Declined',
          schema: z.object({ ok: z.literal(true), id: z.uuid(), updatedAt: z.string() }),
        },
      ],
      errors: [
        { status: 400, description: 'lock_token_required', schema: errorSchema },
        { status: 403, description: 'scope_denied', schema: errorSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
        { status: 409, description: 'departure_request_not_open, optimistic_lock_conflict', schema: errorSchema },
      ],
    },
  },
}
