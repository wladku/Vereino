// The own login e-mail change of `PUT /api/foundation/profile/email` (S8.5, ENG-Q-12 answered 2026-11-26; #737): the
// current password is checked, then `auth.users.update` runs with the auth context marked as confirmed for the new
// e-mail (`markEmailChangeConfirmed`), the only way past the command interceptor `foundation.email-change-confirmation`.
// Returns the JWT signed again with the new e-mail for the same session, as the platform's profile route does.
import type { EntityManager } from '@mikro-orm/postgresql'
import { User } from '@open-mercato/core/modules/auth/data/entities'
import type { AuthService } from '@open-mercato/core/modules/auth/services/authService'
import { signJwt } from '@open-mercato/shared/lib/auth/jwt'
import type { AuthContext } from '@open-mercato/shared/lib/auth/server'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { normalizeLoginEmail } from '@vereino/core'
import { foundationErrors } from '../api/errors'
import { markEmailChangeConfirmed } from '../lib/email-change'
import { updateAccount } from './accounts'

export type OwnEmailChange = { email: string; currentPassword: string }

/** The outcome: the e-mail now stored and, when it changed, the new session JWT. Null when the user is gone. */
export type OwnEmailChangeResult = { email: string; token: string | null } | null

export async function changeOwnEmail(
  request: Request,
  auth: NonNullable<AuthContext>,
  input: OwnEmailChange,
): Promise<OwnEmailChangeResult> {
  const container = await createRequestContainer()
  const em = container.resolve<EntityManager>('em').fork()
  const scope = { tenantId: auth.tenantId ?? null, organizationId: auth.orgId ?? null }
  const user = await findOneWithDecryption(em, User, { id: auth.sub, deletedAt: null }, undefined, scope)
  if (!user) return null
  const authService = container.resolve<AuthService>('authService')
  if (!(await authService.verifyPassword(user, input.currentPassword))) {
    return await foundationErrors.throw('current_password_invalid')
  }
  if (normalizeLoginEmail(input.email) === normalizeLoginEmail(user.email)) return { email: user.email, token: null }
  const ctx: CommandRuntimeContext = {
    container,
    auth: markEmailChangeConfirmed(auth, input.email),
    organizationScope: null,
    selectedOrganizationId: auth.orgId ?? null,
    organizationIds: auth.orgId ? [auth.orgId] : null,
    request,
  }
  await updateAccount(ctx, auth.sub, { email: input.email })
  const roles = await authService.getUserRoles(user, scope.tenantId)
  const token = signJwt({
    sub: auth.sub,
    sid: typeof auth.sid === 'string' ? auth.sid : undefined,
    tenantId: scope.tenantId,
    orgId: scope.organizationId,
    email: input.email,
    roles,
  })
  return { email: input.email, token }
}
