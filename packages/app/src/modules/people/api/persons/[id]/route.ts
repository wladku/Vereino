// `GET /api/people/persons/{id}` — one person, guarded by `assertInScope` with the list's grant kinds and options. A
// coordinator reading through the club-wide grant gets the basic data only (`access: 'basic'`); the person, a guardian
// and the club administrator get the full record with the account's login e-mail (#84) and its state (#303); the PESEL is returned only to a user with `people.pesel.view` (club
// spec *Data Models*, TEST-004; foundation TEST-F06). An adult participant's own consents (`ownConsents`, people
// life-cycle spec REQ-L10, #309) are returned only to a caller with `people.manage`; a coordinator's basic read and a
// guardian's read carry none.
//
// `DELETE` — `people.persons.delete` (REQ-L05; phase L6, #308): a person created by mistake, without any history, is
// soft-deleted (204, `people.person.deleted`); 409 `person_in_use` with `reasons` otherwise. Undoable through the
// audit log.
import { z } from 'zod'
import type { CommandBus } from '@open-mercato/shared/lib/commands'
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
import { visibleName } from '../../../lib/erasure-rules'
import { formerMemberLabel } from '../../../services/former-member'
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
  DELETE: { requireAuth: true, requireFeatures: ['people.manage'] },
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
    const formerMember = await formerMemberLabel()
    // An anonymised person reads "Former member"; a name kept under the hold only with `people.manage` (#308).
    if (isBasicRead(actingRole)) return Response.json(personBasicView(person, visibleName(person, formerMember, false)))
    const rbac = ctx.container.resolve<RbacService>('rbacService')
    const [withPesel, canManage, account] = await Promise.all([
      rbac.userHasAllFeatures(ctx.auth.sub, ['people.pesel.view'], scope),
      rbac.userHasAllFeatures(ctx.auth.sub, ['people.manage'], scope),
      accountView(ctx.container, scope, person.userId),
    ])
    const own = canManage ? await ownConsentsForStaff(ctx.container, scope, person) : null
    const name = visibleName(person, formerMember, canManage)
    return Response.json({
      ...personView(person, { withPesel, account, name, withHold: canManage }),
      ...(own ? { holdsOwnConsents: own.holdsOwnConsents, ownConsents: own.consents } : {}),
    })
  } catch (error: unknown) {
    return errorResponse(error, 'people.persons.detail')
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = paramsSchema.parse(await context.params)
    const ctx = await commandContextForRequest(request)
    if (!ctx?.auth) return Response.json({ error: 'Unauthorized' }, { status: 401 })
    const commandBus = ctx.container.resolve<CommandBus>('commandBus')
    await commandBus.execute('people.persons.delete', { input: { id }, ctx })
    return new Response(null, { status: 204 })
  } catch (error: unknown) {
    return errorResponse(error, 'people.persons.delete')
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
    DELETE: {
      summary: 'Delete a person created by mistake',
      description:
        'Soft-deletes a person without any history: no membership, guardianship, role assignment, account, departure request, attendance, session, contract, charge, payment, rental or booking, ever. Emits `people.person.deleted`. A person with history answers 409 `person_in_use` with `reasons` (each `{ code, module?, params? }`); such a person leaves the club instead. Send the person record `updatedAt` in the platform optimistic-lock header (400 `lock_token_required` without it, 409 when stale). Undoable through the audit log.',
      responses: [{ status: 204, description: 'Deleted' }],
      errors: [
        { status: 403, description: 'scope_denied', schema: errorSchema },
        { status: 404, description: 'Not found', schema: errorSchema },
        { status: 409, description: 'person_in_use', schema: errorSchema },
      ],
    },
  },
}
