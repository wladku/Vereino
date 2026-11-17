// `/api/people/first-administrator` — the club's first administrator without the command line (people life-cycle
// spec REQ-L13, J-L08 step 1, V-L04; approved on #255; #305). `GET` tells the panel's banner and page whether the club
// has an administrator and who it is; `POST` sets up the club's roles (as `people bootstrap-admin` does) and runs the
// existing command `people.persons.bootstrap_admin` for a user of the organization: 201 `{ personId }`, 409
// `club_admin_exists` naming the administrator, 404 `user_not_in_organization`. Both need the platform feature
// `auth.users.create`, which the platform's `admin` role holds (`auth.*`); the technical administrator holds no club
// grant, so no club scope is checked.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import { commandContextForRequest, errorResponse, trustedScopeOf } from '@/modules/foundation'
import { FIRST_ADMINISTRATOR_FEATURE, type BootstrapAdminResult } from '../../commands/jobs'
import { setUpClubPeople } from '../../services/club-setup'
import { currentClubAdministrator } from '../../services/first-administrator'
import { peopleErrors } from '../errors'
import { errorSchema } from '../shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: [FIRST_ADMINISTRATOR_FEATURE] },
  POST: { requireAuth: true, requireFeatures: [FIRST_ADMINISTRATOR_FEATURE] },
}

const NO_STORE = { 'cache-control': 'no-store' }

const nameSchema = z.string().trim().min(1).max(200)

const firstAdministratorSchema = z.object({ userId: z.uuid(), firstName: nameSchema, lastName: nameSchema }).strict()

const administratorSchema = z.object({ personId: z.uuid(), name: z.string() }).nullable()

async function sessionScope(request: Request) {
  const ctx = await commandContextForRequest(request)
  const scope = ctx ? trustedScopeOf(ctx) : null
  return ctx && scope ? { ctx, scope } : null
}

export async function GET(request: Request): Promise<Response> {
  try {
    const session = await sessionScope(request)
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE })
    const administrator = await currentClubAdministrator(session.ctx.container, session.scope)
    return Response.json({ administrator }, { headers: NO_STORE })
  } catch (error: unknown) {
    return errorResponse(error, 'people.first_administrator.read')
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const session = await sessionScope(request)
    if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const { ctx, scope } = session
    const input = firstAdministratorSchema.parse(await request.json().catch(() => ({})))
    // Refused before the roles are set up, so a second call changes nothing; the command checks again in its
    // transaction.
    const existing = await currentClubAdministrator(ctx.container, scope)
    if (existing) {
      return await peopleErrors.throw('club_admin_exists', {
        administrator: existing.name,
        administratorPersonId: existing.personId,
      })
    }
    await setUpClubPeople(ctx.container, scope, { withRoleAcls: true })
    const commandBus = ctx.container.resolve<CommandBus>('commandBus')
    const { result } = await commandBus.execute<unknown, BootstrapAdminResult>('people.persons.bootstrap_admin', {
      input,
      ctx,
    })
    return Response.json({ personId: result.personId }, { status: 201 })
  } catch (error: unknown) {
    return errorResponse(error, 'people.persons.bootstrap_admin')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'People',
  summary: 'First club administrator',
  methods: {
    GET: {
      summary: 'Who administers the club',
      description:
        'The person with an active club administrator role, or null while the club has none (the panel then shows the "First administrator" banner). Needs the platform feature `auth.users.create`. Not cached.',
      responses: [
        { status: 200, description: 'The administrator', schema: z.object({ administrator: administratorSchema }) },
      ],
      errors: [{ status: 401, description: 'Unauthorized', schema: errorSchema }],
    },
    POST: {
      summary: 'Create the first club administrator',
      description:
        'Makes a user of the organization the club administrator: a person with the given name linked to the user, an active club administrator role, and the club roles set up. Only while the club has no administrator. Needs the platform feature `auth.users.create`; not undoable.',
      requestBody: { contentType: 'application/json', schema: firstAdministratorSchema },
      responses: [{ status: 201, description: 'Administrator created', schema: z.object({ personId: z.uuid() }) }],
      errors: [
        { status: 400, description: 'Invalid input', schema: errorSchema },
        { status: 403, description: 'scope_denied', schema: errorSchema },
        { status: 404, description: 'user_not_in_organization', schema: errorSchema },
        {
          status: 409,
          description: 'club_admin_exists (`administrator` names the person)',
          schema: errorSchema.extend({ administrator: z.string(), administratorPersonId: z.uuid() }),
        },
      ],
    },
  },
}
