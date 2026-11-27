// The sign-in landing of `people` (club spec *UI architecture* → redirect after sign-in; #27; spec N, REQ-N08), used by
// the `people.member-landing` API interceptor on `POST /api/auth/login`: the person link of the signed-in user, their
// member side (a ward or an active participant membership), their grants and the features `people.self` and
// `facilities.log.write` decide between `/club`, `/club/facility` and `/backend` (DD-06, DD-N09: never a role name).
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import type { RbacService } from '@open-mercato/core/modules/auth/services/rbacService'
import { verifyJwt } from '@open-mercato/shared/lib/auth/jwt'
import { Person } from '../data/entities'
import { memberLanding, panelPasswordRedirect, withNotice } from '../lib/member-rules'
import { clubToday } from './club-clock'
import { membershipContribution } from './membership-contribution'
import { createPeopleScopeService } from './scope-service'

type SessionClaims = { userId: string; tenantId: string; organizationId: string }

/** The user, tenant and home organization of the access token the sign-in just issued (verified). */
function claimsOf(token: unknown): SessionClaims | null {
  if (typeof token !== 'string' || token.length === 0) return null
  const payload = verifyJwt(token)
  const userId = typeof payload?.sub === 'string' ? payload.sub : null
  const tenantId = typeof payload?.tenantId === 'string' ? payload.tenantId : null
  const organizationId = typeof payload?.orgId === 'string' ? payload.orgId : null
  return userId && tenantId && organizationId ? { userId, tenantId, organizationId } : null
}

type LandingFacts = { selfFeature: boolean; facilityLogFeature: boolean; memberSide: boolean; grants: string[] }

/** The features, grants and member side (a ward, else an active participant membership) of a linked person. */
async function personFacts(
  em: EntityManager,
  container: AwilixContainer,
  userId: string,
  subject: { tenantId: string; organizationId: string; personId: string },
): Promise<LandingFacts> {
  const scope = { tenantId: subject.tenantId, organizationId: subject.organizationId }
  const rbac = container.resolve<RbacService>('rbacService')
  const selfFeature = await rbac.userHasAllFeatures(userId, ['people.self'], scope)
  const facilityLogFeature = await rbac.userHasAllFeatures(userId, ['facilities.log.write'], scope)
  const grants = await createPeopleScopeService(container).grantsForPerson(subject)
  const hasWard = grants.some((grant) => grant.kind === 'guardian' && (grant.ids?.length ?? 0) > 0)
  // Without `groups` the member side is the wards only (spec N, *Business rules* → member side).
  const contribution = hasWard ? null : membershipContribution(container)
  const isParticipant = contribution
    ? await contribution.isActiveParticipant(em.fork(), subject, await clubToday(container, scope))
    : false
  return { selfFeature, facilityLogFeature, memberSide: hasWard || isParticipant, grants: grants.map((g) => g.kind) }
}

/**
 * The redirect a successful sign-in answer should carry instead of its own, or null to keep it (`memberLanding`):
 * `/club/facility`, `/backend` or `/club` for a user linked to a person of their organization; `/backend` with the
 * "not linked" notice for a user linked to no person. Only the platform default (`/backend`) is replaced.
 */
export async function memberLandingRedirect(
  em: EntityManager,
  container: AwilixContainer,
  body: Record<string, unknown>,
): Promise<string | null> {
  if (body.ok !== true) return null
  const claims = claimsOf(body.token)
  if (!claims) return null
  const scope = { tenantId: claims.tenantId, organizationId: claims.organizationId }
  const person = await em
    .fork()
    .findOne(Person, { userId: claims.userId, ...scope, deletedAt: null }, { fields: ['id'] })
  const facts = person ? await personFacts(em, container, claims.userId, { ...scope, personId: person.id }) : null
  const landing = memberLanding({
    redirect: body.redirect,
    linked: person !== null,
    selfFeature: facts?.selfFeature ?? false,
    memberSide: facts?.memberSide ?? false,
    grants: facts?.grants ?? [],
    facilityLogFeature: facts?.facilityLogFeature ?? false,
  })
  if (!landing) return null
  return landing.notice ? withNotice(landing.redirect) : landing.redirect
}

/**
 * Where the panel's change-password page sends the signed-in user (#876, Q1; `panelPasswordRedirect`): a member to
 * `/club/profile/password`, anyone else nowhere (null). The person is looked up in the session's own tenant and
 * organization; a session without them stays on the panel page.
 */
export async function panelPasswordRedirectFor(
  container: AwilixContainer,
  auth: { sub: string; tenantId?: string | null; orgId?: string | null },
): Promise<string | null> {
  const tenantId = auth.tenantId ?? null
  const organizationId = auth.orgId ?? null
  if (!tenantId || !organizationId) return null
  const scope = { tenantId, organizationId }
  const em = container.resolve<EntityManager>('em').fork()
  const person = await em.findOne(Person, { userId: auth.sub, ...scope, deletedAt: null }, { fields: ['id'] })
  if (!person) return panelPasswordRedirect({ linked: false, selfFeature: false, grants: [] })
  const rbac = container.resolve<RbacService>('rbacService')
  const selfFeature = await rbac.userHasAllFeatures(auth.sub, ['people.self'], scope)
  const grants = await createPeopleScopeService(container).grantsForPerson({ ...scope, personId: person.id })
  return panelPasswordRedirect({ linked: true, selfFeature, grants: grants.map((grant) => grant.kind) })
}
