// The sign-in landing of `people` (club spec *UI architecture* → redirect after sign-in; #27), used by the
// `people.member-landing` API interceptor on `POST /api/auth/login`: the person link of the signed-in user and the
// `people.self` feature decide between `/club` and `/backend` (DD-06: never a role name).
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import type { RbacService } from '@open-mercato/core/modules/auth/services/rbacService'
import { verifyJwt } from '@open-mercato/shared/lib/auth/jwt'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { Person } from '../data/entities'
import { memberLanding, withNotice } from '../lib/member-rules'

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

/**
 * The redirect a successful sign-in answer should carry instead of its own, or null to keep it: `/club` for a user
 * linked to a person of their organization who holds `people.self`; `/backend` with the "not linked" notice for a
 * user linked to no person. Only the platform default (`/backend`) is replaced.
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
  const selfFeature = person
    ? await container.resolve<RbacService>('rbacService').userHasAllFeatures(claims.userId, ['people.self'], scope)
    : false
  const landing = memberLanding({ redirect: body.redirect, linked: person !== null, selfFeature })
  if (!landing) return null
  if (!landing.notice) return landing.redirect
  const { translate } = await resolveTranslations()
  const notice = translate(
    'people.club.notLinked.notice',
    'Your account is not linked to a person of the club, so the member area is not available. Contact the club if you need it.',
  )
  return withNotice(landing.redirect, notice)
}
