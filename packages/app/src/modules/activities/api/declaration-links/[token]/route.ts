// `GET`, `POST /api/activities/declaration-links/{token}` — the declaration from a personal link (club spec REQ-017,
// AC-017, TEST-017; foundation P-10, DD-35; UX concept M-14). Sessionless and rate-limited per client IP; the token in
// the path is the only credential. `GET` peeks (spends nothing): the session, what may be declared and the persons the
// link's holder may declare for — first names only. `POST` declares for one of them through
// `activities.attendance.declare_by_link` (`source = link`). An unknown, malformed or foreign token answers 404
// `declaration_link_not_found`; an expired one 410 `token_link_expired`; a person outside the link 403 `scope_denied`.
import { z } from 'zod'
import type { CommandBus, CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { errorResponse } from '@/modules/foundation'
import type { DeclareCommandResult } from '../../../commands/attendance'
import { declarationLinkDeclareSchema } from '../../../data/validators'
import { OCCURRENCE_STATUSES } from '../../../lib/activities-rules'
import { DECLARATION_STATUSES, DECLARED_VALUES } from '../../../lib/policy'
import { readDeclarationLink } from '../../../services/declaration-links'
import { activitiesErrors } from '../../errors'
import { attendanceView, attendanceViewSchema, errorSchema } from '../../shared'

/** Per client IP (S8.6, V-10); disabled under integration tests. */
export const metadata = {
  GET: { requireAuth: false, rateLimit: { points: 60, duration: 60, keyPrefix: 'activities_declaration_link_read' } },
  POST: { requireAuth: false, rateLimit: { points: 30, duration: 60, keyPrefix: 'activities_declaration_link_write' } },
}

type RouteContext = { params: Promise<{ token?: string }> }

/** A personal page: never kept by a shared cache. */
const NO_STORE = 'no-store'

function noStore(response: Response): Response {
  response.headers.set('Cache-Control', NO_STORE)
  return response
}

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  try {
    const { token } = await context.params
    const container = await createRequestContainer()
    const page = await readDeclarationLink(container, token ?? '')
    if (!page) {
      const error = await activitiesErrors.create('declaration_link_not_found')
      return noStore(Response.json(error.body, { status: error.status }))
    }
    return noStore(Response.json(page))
  } catch (error: unknown) {
    return noStore(errorResponse(error, 'activities.declaration_link.read'))
  }
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    const { token } = await context.params
    const body: unknown = await request.json().catch(() => ({}))
    const parsed = declarationLinkDeclareSchema.safeParse(body)
    if (!parsed.success) {
      return noStore(Response.json({ error: 'Validation failed', details: parsed.error.issues }, { status: 400 }))
    }
    const container = await createRequestContainer()
    // No session: the link alone names the tenant and organization, inside the command (`{ token }` scope source).
    const ctx: CommandRuntimeContext = {
      container,
      auth: null,
      organizationScope: null,
      selectedOrganizationId: null,
      organizationIds: null,
      request,
    }
    const commandBus = container.resolve<CommandBus>('commandBus')
    const { result } = await commandBus.execute<unknown, DeclareCommandResult>(
      'activities.attendance.declare_by_link',
      { input: { ...parsed.data, token: token ?? '' }, ctx },
    )
    return noStore(
      Response.json(
        { ...attendanceView(result.entity), actingRole: result.actingRole, created: result.created },
        { status: result.created ? 201 : 200 },
      ),
    )
  } catch (error: unknown) {
    return noStore(errorResponse(error, 'activities.declaration_link.declare'))
  }
}

const pageSchema = z.object({
  club: z.object({ name: z.string() }),
  session: z.object({
    activityName: z.string(),
    occurrenceDate: z.string(),
    startAt: z.string(),
    endAt: z.string(),
    timeZone: z.string(),
    status: z.enum(OCCURRENCE_STATUSES),
    kind: z.enum(['absence_only', 'confirm']),
    window: z.enum(['open', 'closed', 'not_planned']),
  }),
  persons: z.array(
    z.object({
      id: z.uuid(),
      firstName: z.string(),
      declared: z.enum(DECLARED_VALUES),
      declarationStatus: z.enum(DECLARATION_STATUSES).nullable(),
    }),
  ),
  expiresAt: z.string(),
})

const linkErrors = [
  {
    status: 404,
    description: '`declaration_link_not_found` — an unknown, malformed or foreign token',
    schema: errorSchema,
  },
  { status: 410, description: '`token_link_expired` — the link has expired; request a new one', schema: errorSchema },
  { status: 429, description: 'Too many requests', schema: z.object({ error: z.string() }) },
]

export const openApi: OpenApiRouteDoc = {
  tag: 'Activities',
  summary: 'Declaration from a personal link',
  methods: {
    GET: {
      summary: 'Read the session and the persons of a personal link',
      description:
        'Sessionless (REQ-017). Spends nothing. The session (activity name, date, time, status, what may be declared and whether declarations are still open) and the persons the link holder may declare for — themself when a participant, and their wards among the participants — with first names and current declarations.',
      responses: [{ status: 200, description: 'The link page', schema: pageSchema }],
      errors: linkErrors,
    },
    POST: {
      summary: 'Declare for one person from a personal link',
      description:
        'Sessionless (REQ-017). Declares `yes`, `no` or `unknown` for one person of the link for the link session, recorded with `source = link` and the link holder as the declaring person. The holder current grants decide: another family person answers 403 `scope_denied`. The declaration rules of `POST /api/activities/attendance/declare` apply: 409 `declaration_closed` after the start, 409 `occurrence_not_planned`, 422 `declaration_kind_absence_only`, 422 `declaration_not_participant`.',
      requestBody: { contentType: 'application/json', schema: declarationLinkDeclareSchema },
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
        { status: 409, description: 'declaration_closed, occurrence_not_planned', schema: errorSchema },
        { status: 422, description: 'declaration_kind_absence_only, declaration_not_participant', schema: errorSchema },
        ...linkErrors,
      ],
    },
  },
}
