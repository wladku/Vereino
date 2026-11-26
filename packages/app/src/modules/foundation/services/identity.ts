// Social sign-in services (`.ai/specs/2026-10-27-vereino-social-sign-in.md`; #566): the single-use state marker in the
// platform cache (DD-S04), the one system-scope lookup of (`provider`, `subject`) (DD-S03, the D-027 entry of the DD-35
// list), session issuance through the installed `AuthService.createSession` + `signJwt` exactly as the platform's
// login and autologin routes do (V-S01), the identity list of a user and the fingerprints of the callback's failures.
// Nothing here logs or emits a provider subject, an e-mail, a state or a token.
import { randomBytes, timingSafeEqual } from 'node:crypto'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import type { NextResponse } from 'next/server'
import { runWithCacheTenant, type CacheStrategy } from '@open-mercato/cache'
import { User } from '@open-mercato/core/modules/auth/data/entities'
import { emitAuthEvent } from '@open-mercato/core/modules/auth/events'
import { buildSafeRedirectResponse } from '@open-mercato/core/modules/auth/lib/requestRedirect'
import type { AuthService } from '@open-mercato/core/modules/auth/services/authService'
import { signJwt } from '@open-mercato/shared/lib/auth/jwt'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { getTelemetryRuntime } from '@open-mercato/shared/lib/telemetry/runtime'
import { foundationErrors } from '../api/errors'
import { IdentityLink } from '../data/entities'
import { emitFoundationEvent } from '../events'
import { identityEventPayload } from './identity-links'
import {
  STATE_COOKIE,
  STATE_COOKIE_PATH,
  STATE_TTL_MS,
  parseStateMarker,
  stateMarkerKey,
  type IdentityProvider,
  type StateMarker,
} from '../lib/identity'

const logger = createLogger('foundation').child({ component: 'identity' })

/** The fingerprints of the spec's *Observability* and *API* rows. */
export type IdentityFingerprint =
  | 'foundation.identity.state_invalid'
  | 'foundation.identity.not_linked'
  | 'foundation.identity.callback_failed'
  | 'foundation.identity.subject_conflict'
  | 'foundation.identity.state_store_unavailable'
  | 'foundation.identity.deletion_bad_signature'

/** Logs and reports a sign-in failure by its fingerprint; `details` carries codes and ids only. */
export function reportIdentityFailure(fingerprint: IdentityFingerprint, details: Record<string, unknown> = {}): void {
  logger.warn('Social sign-in failed', { fingerprint, ...details })
  const error = Object.assign(new Error(`[internal] ${fingerprint}`), { fingerprint })
  getTelemetryRuntime()?.reportError(error, { module: 'foundation', code: fingerprint })
}

function cacheOf(container: AwilixContainer): CacheStrategy {
  return container.resolve<CacheStrategy>('cache')
}

/** A new state: 32 random bytes, base64url (DD-S04). */
export function newState(): string {
  return randomBytes(32).toString('base64url')
}

/**
 * Stores the marker of `state` for ten minutes. The cache runs in the global (tenant-less) scope, so `start` with a
 * session and `callback` without one see the same key. An unreachable store throws 503 `identity_unavailable`: the
 * round trip never starts without replay protection (fail closed).
 */
export async function storeStateMarker(
  container: AwilixContainer,
  state: string,
  marker: Omit<StateMarker, 'expiresAt'>,
): Promise<void> {
  const expiresAt = Date.now() + STATE_TTL_MS
  try {
    await runWithCacheTenant(null, () =>
      cacheOf(container).set(stateMarkerKey(state), JSON.stringify({ ...marker, expiresAt }), { ttl: STATE_TTL_MS }),
    )
  } catch (error: unknown) {
    reportIdentityFailure('foundation.identity.state_store_unavailable', { err: error })
    await foundationErrors.throw('identity_unavailable')
  }
}

/**
 * Consumes the marker of `state` once: read, then delete; a callback that finds no marker or whose delete reports
 * nothing removed stops. The platform cache offers no atomic get-and-delete (its redis `delete` is GET then DEL), so
 * two callbacks racing on the same state within milliseconds may both pass here; the second still fails, because the
 * provider exchanges an authorization code once (with its PKCE verifier) and answers the replay with an error
 * (`identity=failed`). Null for a missing, used or unreadable marker and when the store is unreachable.
 */
export async function consumeStateMarker(container: AwilixContainer, state: string): Promise<StateMarker | null> {
  try {
    return await runWithCacheTenant(null, async () => {
      const cache = cacheOf(container)
      const key = stateMarkerKey(state)
      const value = await cache.get(key)
      if (value == null) return null
      if (!(await cache.delete(key))) return null
      return parseStateMarker(value)
    })
  } catch (error: unknown) {
    reportIdentityFailure('foundation.identity.state_store_unavailable', { err: error })
    return null
  }
}

/** True when the state in the query is the one the cookie of this browser carries (constant-time). */
export function stateMatchesCookie(state: string, cookie: string | null | undefined): boolean {
  if (!cookie) return false
  const a = Buffer.from(state)
  const b = Buffer.from(cookie)
  return a.length === b.length && timingSafeEqual(a, b)
}

const secureCookies = () => process.env.NODE_ENV === 'production'

/** Sets the state cookie on the redirect to the provider. */
export function setStateCookie(response: NextResponse, state: string): void {
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: secureCookies(),
    path: STATE_COOKIE_PATH,
    maxAge: STATE_TTL_MS / 1000,
  })
}

/** Clears the state cookie on every callback answer. */
export function clearStateCookie(response: NextResponse): void {
  response.cookies.set(STATE_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: secureCookies(),
    path: STATE_COOKIE_PATH,
    maxAge: 0,
  })
}

/** The state cookie of a request. */
export function stateCookieOf(request: Request): string | null {
  const header = request.headers.get('cookie')
  if (!header) return null
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=')
    if (name !== STATE_COOKIE) continue
    try {
      return decodeURIComponent(rest.join('='))
    } catch {
      // A malformed escape (`%`) is a tampered cookie: no state, so the callback answers `identity=invalid`.
      return null
    }
  }
  return null
}

/** A link found by the sign-in lookup: its id, user and the tenant and organization every later query uses. */
export type SignInLink = {
  id: string
  userId: string
  tenantId: string
  organizationId: string
  provider: IdentityProvider
}

/**
 * The one system-scope read of social sign-in (DD-S03; the D-027 entry of the DD-35 list in `AGENTS.md`): the link of
 * (`provider`, `subject`) by its unique index, at most one row, read-only. Every further query of the request runs in
 * the returned tenant and organization.
 */
export async function findLinkForSignIn(
  container: AwilixContainer,
  provider: IdentityProvider,
  subject: string,
): Promise<SignInLink | null> {
  const em = container.resolve<EntityManager>('em').fork()
  const link = await em.findOne(
    IdentityLink,
    { provider, subject, deletedAt: null },
    { fields: ['id', 'userId', 'tenantId', 'organizationId', 'provider'] },
  )
  if (!link) return null
  return {
    id: link.id,
    userId: link.userId,
    tenantId: link.tenantId,
    organizationId: link.organizationId,
    provider: link.provider,
  }
}

/**
 * Facebook's data-deletion request (REQ-S03; #567): deletes the link of (`provider`, `subject`) found by the same
 * system-scope lookup as the sign-in (DD-S03), narrowed at once to that link's tenant and organization, and emits
 * `foundation.identity.unlinked`. Unlike the unlink command it ignores the last-method rule: the person asked the
 * provider to remove the connection, and the administrator can re-invite an account left without a method. False when
 * no link exists (a repeat, or a person who never linked) — the caller answers the same either way.
 */
export async function deleteLinkBySubject(
  container: AwilixContainer,
  provider: IdentityProvider,
  subject: string,
): Promise<boolean> {
  const link = await findLinkForSignIn(container, provider, subject)
  if (!link) return false
  const em = container.resolve<EntityManager>('em').fork()
  const removed = await em.nativeDelete(IdentityLink, {
    id: link.id,
    tenantId: link.tenantId,
    organizationId: link.organizationId,
  })
  if (removed > 0) {
    void emitFoundationEvent('foundation.identity.unlinked', identityEventPayload(link)).catch(() => undefined)
  }
  return removed > 0
}

/** The link's live, unblocked user in the link's own tenant and organization, or null. */
async function signInUser(em: EntityManager, link: SignInLink): Promise<User | null> {
  const scope = { tenantId: link.tenantId, organizationId: link.organizationId }
  const user = await findOneWithDecryption(em, User, { id: link.userId, ...scope, deletedAt: null }, {}, scope)
  if (!user?.isConfirmed) return null
  return user
}

const ACCESS_TOKEN_MAX_AGE_SECONDS = 60 * 60 * 8

/**
 * Signs the link's user in the way the platform's `login.ts` does without "remember me" (V-S01): a session through
 * `AuthService.createSession`, the JWT through `signJwt`, the `auth_token` and `session_token` cookies on the
 * redirect, `last_login_at` and the platform's `auth.login.success` event. Then `last_signed_in_at` and
 * `foundation.identity.signed_in`. Null when the user is gone or blocked — the callback answers `identity=unlinked`.
 */
export async function issueSession(
  container: AwilixContainer,
  request: Request,
  link: SignInLink,
  redirect: string,
): Promise<NextResponse | null> {
  const em = container.resolve<EntityManager>('em').fork()
  const user = await signInUser(em, link)
  if (!user) return null
  const auth = container.resolve<AuthService>('authService')
  const roles = await auth.getUserRoles(user, link.tenantId)
  await auth.updateLastLoginAt(user)
  const { session, token: refreshToken } = await auth.createSession(
    user,
    new Date(Date.now() + ACCESS_TOKEN_MAX_AGE_SECONDS * 1000),
  )
  const token = signJwt({
    sub: user.id,
    sid: session.id,
    tenantId: link.tenantId,
    orgId: link.organizationId,
    email: user.email,
    roles,
  })
  await em.nativeUpdate(
    IdentityLink,
    { id: link.id, tenantId: link.tenantId, organizationId: link.organizationId },
    { lastSignedInAt: new Date() },
  )
  void emitAuthEvent('auth.login.success', {
    id: user.id,
    email: user.email,
    tenantId: link.tenantId,
    organizationId: link.organizationId,
  }).catch(() => undefined)
  void emitFoundationEvent('foundation.identity.signed_in', identityEventPayload(link)).catch(() => undefined)

  const response = buildSafeRedirectResponse(request, redirect, 303)
  const cookie = {
    httpOnly: true,
    path: '/',
    sameSite: 'lax' as const,
    secure: secureCookies(),
    maxAge: ACCESS_TOKEN_MAX_AGE_SECONDS,
  }
  response.cookies.set('auth_token', token, cookie)
  response.cookies.set('session_token', refreshToken, cookie)
  return response
}
