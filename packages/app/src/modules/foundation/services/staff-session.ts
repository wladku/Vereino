// Staff session lifetime (S8.5, ENG-Q-12 answered 2026-11-26; #737). The platform checks on every request that the
// session row named by the JWT's `sid` exists and has not expired (`auth/lib/sessionIntegrity.ts`), and its session
// lifetime is fixed (8 hours, or `REMEMBER_ME_DAYS` with "remember me"; no idle timeout). Vereino narrows that row for
// staff accounts without changing platform code (S3.1):
//
// - at sign-in (the `auth/login` interceptor, the social sign-in) a staff session's `expires_at` is set to the idle
//   timeout, so "remember me" no longer keeps a staff account signed in;
// - `POST /api/foundation/session/activity`, which the app shell sends at most once a minute while the user works,
//   moves `expires_at` to the idle timeout after now, never past 8 hours after sign-in.
//
// A staff session without activity reports therefore ends after the idle timeout on the server, whatever the browser
// does. The writes touch only the platform's `sessions` row of the caller's own session (platform gap, reported
// upstream: no session lifetime hook).
import type { EntityManager } from '@mikro-orm/postgresql'
import { Session } from '@open-mercato/core/modules/auth/data/entities'
import type { AuthContext } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { findOneWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { isStaffAccount, readStaffIdleMinutes, staffSessionExpiry } from '@vereino/core'

/** The configured staff idle timeout in minutes (`VEREINO_STAFF_IDLE_MINUTES`, default 30). */
export function staffIdleMinutes(): number {
  return readStaffIdleMinutes(process.env)
}

/**
 * Narrows a new session to the staff idle timeout when the roles make the account a staff one. Returns whether it
 * did. The session must belong to `userId`.
 */
export async function limitStaffSessionAtSignIn(
  em: EntityManager,
  input: { sessionId: string; userId: string; roles: readonly string[]; now?: Date },
): Promise<boolean> {
  if (!isStaffAccount(input.roles)) return false
  const now = input.now ?? new Date()
  const expiresAt = staffSessionExpiry({ createdAt: now, now, idleMinutes: staffIdleMinutes() })
  await em.nativeUpdate(Session, { id: input.sessionId, user: input.userId, deletedAt: null }, { expiresAt })
  return true
}

/** The new expiry of a staff session created at `createdAt`, for activity at `now`. */
export function staffSessionExpiryAt(createdAt: Date, now: Date): Date {
  return staffSessionExpiry({ createdAt, now, idleMinutes: staffIdleMinutes() })
}

export type StaffActivityResult =
  | { staff: false; expiresAt: null; idleTimeoutSeconds: null }
  | { staff: true; expiresAt: string; idleTimeoutSeconds: number }

const MEMBER_RESULT: StaffActivityResult = { staff: false, expiresAt: null, idleTimeoutSeconds: null }

/**
 * Records activity of the caller's own session: a staff session moves its expiry to the idle timeout after now (never
 * past 8 hours after sign-in); a member session, an API key or a token without a session is left alone. Null when
 * the session is gone or expired (the caller answers 401).
 */
export async function recordStaffActivity(
  em: EntityManager,
  auth: NonNullable<AuthContext>,
  now: Date = new Date(),
): Promise<StaffActivityResult | null> {
  const sessionId = typeof auth.sid === 'string' ? auth.sid : null
  if (auth.isApiKey || !sessionId || !isStaffAccount(auth.roles)) return MEMBER_RESULT
  const session = await findOneWithDecryption(em, Session, { id: sessionId, user: auth.sub, deletedAt: null })
  if (!session || session.expiresAt.getTime() <= now.getTime()) return null
  const expiresAt = staffSessionExpiryAt(session.createdAt, now)
  await em.nativeUpdate(Session, { id: sessionId, user: auth.sub, deletedAt: null }, { expiresAt, lastUsedAt: now })
  return { staff: true, expiresAt: expiresAt.toISOString(), idleTimeoutSeconds: staffIdleMinutes() * 60 }
}

/** `recordStaffActivity` in a request container of its own (the activity route). */
export async function recordStaffActivityForRequest(
  auth: NonNullable<AuthContext>,
): Promise<StaffActivityResult | null> {
  const container = await createRequestContainer()
  return recordStaffActivity(container.resolve<EntityManager>('em').fork(), auth)
}
