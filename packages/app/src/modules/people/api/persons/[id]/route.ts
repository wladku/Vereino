// `GET /api/people/persons/{id}` — one person, guarded by `assertInScope` with the list's grant kinds and options. A
// coordinator reading through the club-wide grant gets the basic data only (`access: 'basic'`); the person, a guardian
// and the club administrator get the full record with the account's login e-mail (#84) and its state (#303); the PESEL is returned only to a user with `people.pesel.view` (club
// spec *Data Models*, TEST-004; foundation TEST-F06). An adult participant's own consents (`ownConsents`, people
// life-cycle spec REQ-L10, #309) are returned only to a caller with `people.manage`; a coordinator's basic read and a
// guardian's read carry none.
import { z } from 'zod'
import type { RbacService } from '@open-mercato/core/modules/auth/services/rbacService'
import type { OpenApiRouteDoc } from '@open-mercato/shared/lib/openapi'
import {
  accountView,
  assertInScope,
  commandContextForRequest,
  errorResponse,
  scopeContract,
  trustedScopeOf,
} from '@/modules/foundation'
import { findPerson, ownConsentsForStaff } from '../../../services/people-read'
import {
  PEOPLE_READ_OPTIONS,
  PERSON_READ_KINDS,
  errorSchema,
  isBasicRead,
  personBasicView,
  personView,
  personViewSchema,
} from '../../shared'

export const metadata = {
  GET: { requireAuth: true, requireFeatures: ['people.view'] },
}

const paramsSchema = z.object({ id: z.uuid() })

export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = paramsSchema.parse(await context.params)
    const ctx = await commandContextForRequest(request)
    const scope = ctx ? trustedScopeOf(ctx) : null
    if (!ctx?.auth || !scope) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const person = await findPerson(ctx.container, scope, id)
    if (!person) return Response.json({ error: 'Not found' }, { status: 404 })
    const actingRole = await assertInScope(
      await scopeContract.resolve(ctx),
      PERSON_READ_KINDS,
      { id: person.id, tenantId: person.tenantId, organizationId: person.organizationId, personId: person.id },
      PEOPLE_READ_OPTIONS,
    )
    if (isBasicRead(actingRole)) return Response.json(personBasicView(person))
    const rbac = ctx.container.resolve<RbacService>('rbacService')
    const [withPesel, canManage, account] = await Promise.all([
      rbac.userHasAllFeatures(ctx.auth.sub, ['people.pesel.view'], scope),
      rbac.userHasAllFeatures(ctx.auth.sub, ['people.manage'], scope),
      accountView(ctx.container, scope, person.userId),
    ])
    const own = canManage ? await ownConsentsForStaff(ctx.container, scope, person) : null
    return Response.json({
      ...personView(person, { withPesel, account }),
      ...(own ? { holdsOwnConsents: own.holdsOwnConsents, ownConsents: own.consents } : {}),
    })
  } catch (error: unknown) {
    return errorResponse(error, 'people.persons.detail')
  }
}

export const openApi: OpenApiRouteDoc = {
  tag: 'People',
  summary: 'Person detail',
  methods: {
    GET: {
      summary: 'Read one person',
      description:
        "Returns the person when it is in the caller's record scope: a coordinator gets the basic data only (`access: 'basic'`, no e-mail, phone, notes or PESEL); `pesel` only with `people.pesel.view`. The full view carries `accountEmail`, the login e-mail of the person's account, and `account { state, email, invitedAt, lastSignInAt }` (state `none`, `invited`, `active` or `blocked`, read from the platform user). With `people.manage` it also carries `holdsOwnConsents` (18 or more with a known birth date) and `ownConsents` (an adult participant's own consents with the date and the author's name, #309).",
      responses: [{ status: 200, description: 'The person', schema: personViewSchema }],
      errors: [
        { status: 403, description: 'scope_denied', schema: errorSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
      ],
    },
  },
}
