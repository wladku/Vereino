// The session after a user changed their own password (#876). The platform's `auth.users.update` deletes every
// session of a user whose password changes, and its `PUT /api/auth/profile` then signs a JWT that still names the
// deleted session, so the device that made the change was signed out at its next request. The app's profile route
// (`src/app/api/auth/profile/route.ts`) calls this after a successful change: a fresh session for this device only,
// through the link-free issuer (`session-issuer.ts`, no "remember me"; a staff session gets the staff idle timeout).
// Every other session of the user stays ended.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { User } from '@open-mercato/core/modules/auth/data/entities'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { issueUserSession, type IssuedSession } from './session-issuer'

/**
 * A new session for the signed-in user after their own password change, in the session's own tenant and organization;
 * null when the session has no tenant or organization or the user is gone (the device then signs in again).
 */
export async function renewOwnSession(
  container: AwilixContainer,
  auth: { sub: string; tenantId?: string | null; orgId?: string | null },
): Promise<IssuedSession | null> {
  const tenantId = auth.tenantId ?? null
  const organizationId = auth.orgId ?? null
  if (!tenantId || !organizationId) return null
  const scope = { tenantId, organizationId }
  const em = container.resolve<EntityManager>('em').fork()
  const user = await findOneWithDecryption(em, User, { id: auth.sub, ...scope, deletedAt: null }, {}, scope)
  if (!user) return null
  return issueUserSession(container, user, scope, { remember: false })
}
