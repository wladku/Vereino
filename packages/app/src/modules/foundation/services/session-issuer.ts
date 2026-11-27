// The link-free session issuer (staff second factor spec *Reuse and Ownership Map*; #736), extracted from social
// sign-in's `issueSession` (V-S01): a session through the installed `AuthService.createSession`, the JWT through
// `signJwt`, `last_login_at` and the platform's `auth.login.success` event, and the `auth_token` and `session_token`
// cookies exactly as the platform's `login.ts` sets them. Google sign-in and the second-factor `verify` route issue
// sessions through it. A staff account's session is narrowed to the staff idle timeout and gets no "remember me"
// refresh lifetime (S8.5, ENG-Q-12; #737), as the `foundation.staff-session` interceptor does after a password sign-in.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import type { NextResponse } from 'next/server'
import type { User } from '@open-mercato/core/modules/auth/data/entities'
import { emitAuthEvent } from '@open-mercato/core/modules/auth/events'
import type { AuthService } from '@open-mercato/core/modules/auth/services/authService'
import { signJwt } from '@open-mercato/shared/lib/auth/jwt'
import { limitStaffSessionAtSignIn } from './staff-session'

/** The platform's access-token lifetime (`login.ts`): eight hours. */
export const ACCESS_TOKEN_MAX_AGE_SECONDS = 60 * 60 * 8

export type IssuedSession = {
  token: string
  refreshToken: string
  remember: boolean
  /** When the refresh token ends with "remember me" (`REMEMBER_ME_DAYS`), else null. */
  rememberUntil: Date | null
}

function rememberMeDays(): number {
  const days = Number(process.env.REMEMBER_ME_DAYS || '30')
  return Number.isFinite(days) && days > 0 ? days : 30
}

/** Issues a full session for `user` in `scope`, as the platform's `login.ts` does after a correct password. */
export async function issueUserSession(
  container: AwilixContainer,
  user: User,
  scope: { tenantId: string; organizationId: string },
  options: { remember: boolean },
): Promise<IssuedSession> {
  const auth = container.resolve<AuthService>('authService')
  const roles = await auth.getUserRoles(user, scope.tenantId)
  await auth.updateLastLoginAt(user)
  const rememberUntil = options.remember ? new Date(Date.now() + rememberMeDays() * 24 * 60 * 60 * 1000) : null
  const { session, token: refreshToken } = await auth.createSession(
    user,
    rememberUntil ?? new Date(Date.now() + ACCESS_TOKEN_MAX_AGE_SECONDS * 1000),
  )
  const token = signJwt({
    sub: user.id,
    sid: session.id,
    tenantId: scope.tenantId,
    orgId: scope.organizationId,
    email: user.email,
    roles,
  })
  const em = container.resolve<EntityManager>('em').fork()
  const staff = await limitStaffSessionAtSignIn(em, { sessionId: session.id, userId: user.id, roles })
  void emitAuthEvent('auth.login.success', {
    id: user.id,
    email: user.email,
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
  }).catch(() => undefined)
  if (staff) return { token, refreshToken, remember: false, rememberUntil: null }
  return { token, refreshToken, remember: options.remember, rememberUntil }
}

const secure = () => process.env.NODE_ENV === 'production'

/** Sets the session cookies of `issued` on `response`, as the platform's `login.ts` does. */
export function setSessionCookies(response: NextResponse, issued: IssuedSession): void {
  const base = { httpOnly: true, path: '/', sameSite: 'lax' as const, secure: secure() }
  response.cookies.set('auth_token', issued.token, { ...base, maxAge: ACCESS_TOKEN_MAX_AGE_SECONDS })
  if (issued.rememberUntil) {
    response.cookies.set('session_token', issued.refreshToken, { ...base, expires: issued.rememberUntil })
  } else {
    response.cookies.set('session_token', issued.refreshToken, { ...base, maxAge: ACCESS_TOKEN_MAX_AGE_SECONDS })
  }
}

/** Clears both session cookies (a refused or ended challenge). */
export function clearSessionCookies(response: NextResponse): void {
  const base = { httpOnly: true, path: '/', sameSite: 'lax' as const, secure: secure(), maxAge: 0 }
  response.cookies.set('auth_token', '', base)
  response.cookies.set('session_token', '', base)
}
