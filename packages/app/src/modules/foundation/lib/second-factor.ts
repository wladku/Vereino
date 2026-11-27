// Staff second factor rules (`.ai/specs/implemented/2026-11-26-vereino-staff-second-factor.md`, DD-2F03…DD-2F05, DD-2F08; #736).
// Pure: the challenge id and the code, the code hash and its constant-time check, the challenge marker's shape and
// key, the attempt and resend rules, the provisional token's claims and the masked e-mail hint. The services in
// `second-factor/` bind them to the platform cache, the advisory lock, the session and the e-mail sender.
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'
import { hashKeyPart, type SessionlessLimit } from './sessionless-limits'

/** The code: six digits (DD-2F05, Q-2F03). */
export const CODE_DIGITS = 6
/** A challenge, its code and its provisional token live ten minutes. */
export const CHALLENGE_TTL_MS = 10 * 60 * 1000
/** Wrong codes allowed per challenge; the fifth ends it. */
export const MAX_ATTEMPTS = 5
/** New codes per challenge, each at least `RESEND_SPACING_MS` after the previous send. */
export const MAX_RESENDS = 3
export const RESEND_SPACING_MS = 60 * 1000
/** Challenges per user per hour (DD-2F05), counted through the platform rate limiter (atomic). */
export const CHALLENGE_HOURLY_LIMIT = {
  points: 5,
  duration: 3600,
  keyPrefix: 'vereino_second_factor_challenge',
} as const
/** The method a challenge asks for; a later spec may add another (Non-goals). */
export const SECOND_FACTOR_METHOD = 'email_code'
/** The page that asks for the code. */
export const SECOND_FACTOR_PAGE = '/login/second-factor'
/** The completion routes the platform's MFA-pending gate lets a provisional token reach (V-2F02). */
export const SECOND_FACTOR_COMPLETION_ROUTES = [
  { path: '/api/foundation/second-factor/verify', methods: ['POST'] },
  { path: '/api/foundation/second-factor/resend', methods: ['POST'] },
] as const
/** The only social provider that counts as the second factor (DD-2F06, Q-2F04). */
export function providerCountsAsSecondFactor(provider: string): boolean {
  return provider === 'google'
}

/** `/login` with a sentence of the second factor: the challenge expired, or the account signs in with Google. */
export function secondFactorLoginPath(reason: 'expired' | 'use_google'): string {
  return `/login?second_factor=${reason}`
}
export const SECOND_FACTOR_USE_GOOGLE_PATH = secondFactorLoginPath('use_google')

/** The claim of the provisional token that names its challenge. */
export const CHALLENGE_CLAIM = 'vereino_2f'

/** A new challenge id: 32 random bytes, base64url. It lives only in the provisional token. */
export function newChallengeId(): string {
  return randomBytes(32).toString('base64url')
}

/** A new code from the CSPRNG, zero-padded to six digits. */
export function newCode(): string {
  return String(randomInt(0, 10 ** CODE_DIGITS)).padStart(CODE_DIGITS, '0')
}

/** The stored form of a code: HMAC-SHA256 keyed with the challenge id, hex. */
export function hashCode(challengeId: string, code: string): string {
  return createHmac('sha256', challengeId).update(code).digest('hex')
}

/** True when `code` is the one hashed into `codeHash` (constant-time). */
export function codeMatches(challengeId: string, code: string, codeHash: string): boolean {
  const actual = Buffer.from(hashCode(challengeId, code), 'hex')
  const expected = Buffer.from(codeHash, 'hex')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

/** The typed code without spaces, or null when it is not six digits. */
export function normalizeCode(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const code = input.replace(/\s+/g, '')
  return /^\d{6}$/.test(code) ? code : null
}

/** The cache key of a challenge: the id never appears in clear. */
export function challengeKey(challengeId: string): string {
  return `foundation:second-factor:${createHash('sha256').update(challengeId).digest('hex')}`
}

/** The advisory lock key of a challenge (DD-2F08). */
export function challengeLockKey(challengeId: string): string {
  return `foundation.second_factor:${createHash('sha256').update(challengeId).digest('hex')}`
}

/** The per-user layer of the hourly challenge cap. */
export function challengeLimit(userId: string): SessionlessLimit {
  return { config: { ...CHALLENGE_HOURLY_LIMIT }, key: hashKeyPart(userId) }
}

/** The challenge marker in the cache (DD-2F04). */
export type ChallengeMarker = {
  userId: string
  sessionId: string
  tenantId: string
  organizationId: string
  codeHash: string
  attempts: number
  resends: number
  lastSentAt: number
  expiresAt: number
  remember: boolean
  redirect: string
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

/** The marker of a cache value, or null when it is not one. */
export function parseChallengeMarker(value: unknown): ChallengeMarker | null {
  let raw: unknown = value
  if (typeof value === 'string') {
    try {
      raw = JSON.parse(value)
    } catch {
      return null
    }
  }
  if (typeof raw !== 'object' || raw === null) return null
  const m = raw as Record<string, unknown>
  const texts = [m.userId, m.sessionId, m.tenantId, m.organizationId, m.codeHash, m.redirect]
  if (!texts.every(isText)) return null
  if (![m.attempts, m.resends, m.lastSentAt, m.expiresAt].every(isCount)) return null
  if (typeof m.remember !== 'boolean') return null
  return {
    userId: m.userId as string,
    sessionId: m.sessionId as string,
    tenantId: m.tenantId as string,
    organizationId: m.organizationId as string,
    codeHash: m.codeHash as string,
    attempts: m.attempts as number,
    resends: m.resends as number,
    lastSentAt: m.lastSentAt as number,
    expiresAt: m.expiresAt as number,
    remember: m.remember,
    redirect: m.redirect as string,
  }
}

/** The claims of a provisional token that the completion routes read. */
export type ProvisionalClaims = {
  sub: string
  sid: string
  tenantId: string
  orgId: string
  challengeId: string
}

/**
 * The provisional token's claims (DD-2F03): the platform's own claims of the session it just issued, with
 * `mfa_pending: true` and the challenge id.
 */
export function provisionalTokenClaims(
  issued: { sub: string; sid: string; tenantId: string; orgId: string; email?: unknown; roles?: unknown },
  challengeId: string,
): Record<string, unknown> {
  return {
    sub: issued.sub,
    sid: issued.sid,
    tenantId: issued.tenantId,
    orgId: issued.orgId,
    email: issued.email,
    roles: issued.roles,
    mfa_pending: true,
    [CHALLENGE_CLAIM]: challengeId,
  }
}

/** The claims of a verified JWT payload when it is a Vereino provisional token, else null. */
export function readProvisionalClaims(payload: unknown): ProvisionalClaims | null {
  if (typeof payload !== 'object' || payload === null) return null
  const p = payload as Record<string, unknown>
  if (p.mfa_pending !== true || p.mfa_verified === true) return null
  const values = [p.sub, p.sid, p.tenantId, p.orgId, p[CHALLENGE_CLAIM]]
  if (!values.every(isText)) return null
  return {
    sub: p.sub as string,
    sid: p.sid as string,
    tenantId: p.tenantId as string,
    orgId: p.orgId as string,
    challengeId: p[CHALLENGE_CLAIM] as string,
  }
}

/** The claims of a platform token the gate reads after a sign-in: user, session and scope, or null. */
export function readIssuedClaims(
  payload: unknown,
): { sub: string; sid: string; tenantId: string; orgId: string; email?: unknown; roles?: unknown } | null {
  if (typeof payload !== 'object' || payload === null) return null
  const p = payload as Record<string, unknown>
  if (![p.sub, p.sid, p.tenantId, p.orgId].every(isText)) return null
  return {
    sub: p.sub as string,
    sid: p.sid as string,
    tenantId: p.tenantId as string,
    orgId: p.orgId as string,
    email: p.email,
    roles: p.roles,
  }
}

/** True when the marker belongs to the token's user, session and scope and has not expired. */
export function markerMatches(marker: ChallengeMarker, claims: ProvisionalClaims, now: number): boolean {
  return (
    marker.expiresAt > now &&
    marker.userId === claims.sub &&
    marker.sessionId === claims.sid &&
    marker.tenantId === claims.tenantId &&
    marker.organizationId === claims.orgId
  )
}

/** A wrong code: the marker with one more attempt, the attempts left, and whether the challenge ends. */
export function afterWrongCode(marker: ChallengeMarker): {
  marker: ChallengeMarker
  attemptsLeft: number
  locked: boolean
} {
  const attempts = marker.attempts + 1
  const attemptsLeft = Math.max(0, MAX_ATTEMPTS - attempts)
  return { marker: { ...marker, attempts }, attemptsLeft, locked: attemptsLeft === 0 }
}

/** When the next resend is allowed. */
export function nextResendAt(marker: ChallengeMarker): number {
  return marker.lastSentAt + RESEND_SPACING_MS
}

/**
 * A resend request: refused while spaced too close or after the third resend; otherwise the marker with the new code,
 * one more resend and the send time. The expiry stays: the provisional token lives ten minutes from the sign-in, and
 * attempts carry over, so a new code buys neither time nor guesses.
 */
export function resendDecision(
  marker: ChallengeMarker,
  challengeId: string,
  code: string,
  now: number,
): { allowed: true; marker: ChallengeMarker } | { allowed: false; nextResendAt: number | null } {
  if (marker.resends >= MAX_RESENDS) return { allowed: false, nextResendAt: null }
  if (now < nextResendAt(marker)) return { allowed: false, nextResendAt: nextResendAt(marker) }
  return {
    allowed: true,
    marker: {
      ...marker,
      codeHash: hashCode(challengeId, code),
      resends: marker.resends + 1,
      lastSentAt: now,
    },
  }
}

/** The masked address the page shows: the first character of the local part, then `•••@domain`. */
export function emailHint(email: string): string {
  const at = email.lastIndexOf('@')
  if (at <= 0) return '•••'
  return `${email[0]}•••${email.slice(at)}`
}

/** The code formatted for the e-mail: `482 913`. */
export function displayCode(code: string): string {
  return `${code.slice(0, 3)} ${code.slice(3)}`
}
