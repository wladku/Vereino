// Rate limits of the sessionless routes beyond the per-client limit each route declares in `metadata` (engineering
// standards S8.6; #738). The API dispatcher counts that per-client limit; these layers count per subject — a link
// token, or an e-mail address within one club — so a guessed token or a flooded address hits a limit however many
// clients take part. Pure: `services/sessionless-limits.ts` resolves the limiter and consumes.
//
// Keys never carry personal data in clear: e-mail addresses and tokens are SHA-256 hashed, club slugs are public.
import { createHash } from 'node:crypto'

export type SessionlessLimitConfig = {
  /** Requests allowed in the window. */
  points: number
  /** Window in seconds. */
  duration: number
  /** Limiter key prefix; one per route family and layer. */
  keyPrefix: string
}

/** One counted layer: the limit and the key it is counted under. */
export type SessionlessLimit = { config: SessionlessLimitConfig; key: string }

/** A personal-link page read: 60 per minute per token (S8.6 "token page"). */
export const TOKEN_READ_LIMIT = { points: 60, duration: 60 } as const
/** A state change through a personal link: 30 per minute per token. */
export const TOKEN_WRITE_LIMIT = { points: 30, duration: 60 } as const
/** A personal-link request: 3 per hour per e-mail address within one club (S8.6). */
export const LINK_REQUEST_EMAIL_LIMIT = { points: 3, duration: 3600 } as const
/**
 * Sign-in attempts for one account from any number of clients: 10 per 15 minutes. The platform counts 20 per minute
 * per client and 5 per minute per client and address, which a guesser spreading attempts over many clients never
 * reaches.
 */
export const SIGN_IN_EMAIL_LIMIT = { points: 10, duration: 900, keyPrefix: 'vereino_sign_in_email' } as const
/** Password-reset requests for one address from any number of clients: 3 per hour (S8.6 personal-link request). */
export const PASSWORD_RESET_EMAIL_LIMIT = {
  points: 3,
  duration: 3600,
  keyPrefix: 'vereino_password_reset_email',
} as const

/** SHA-256 hex of a value, so a key never holds the value itself. */
export function hashKeyPart(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

/** The comparable form of an e-mail address: trimmed, lower case. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/** The per-token layer of a personal-link route. */
export function tokenLimit(keyPrefix: string, token: string, kind: 'read' | 'write'): SessionlessLimit {
  const window = kind === 'read' ? TOKEN_READ_LIMIT : TOKEN_WRITE_LIMIT
  return { config: { ...window, keyPrefix }, key: hashKeyPart(token) }
}

/** The per-address layer of a personal-link request, counted per club ("per client and per club", #738). */
export function linkRequestEmailLimit(keyPrefix: string, clubSlug: string, email: string): SessionlessLimit {
  return {
    config: { ...LINK_REQUEST_EMAIL_LIMIT, keyPrefix },
    key: `${clubSlug.trim().toLowerCase()}:${hashKeyPart(normalizeEmail(email))}`,
  }
}

/** The per-account layer of a sign-in or a password-reset request. */
export function accountEmailLimit(
  config: typeof SIGN_IN_EMAIL_LIMIT | typeof PASSWORD_RESET_EMAIL_LIMIT,
  email: string,
): SessionlessLimit {
  return { config: { ...config }, key: hashKeyPart(normalizeEmail(email)) }
}

/** The e-mail field of a sign-in or reset body (JSON or form), or null when there is none. */
export function emailFromBody(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null
  const email = (body as Record<string, unknown>).email
  return typeof email === 'string' && email.trim() !== '' ? email : null
}

/**
 * The e-mail of a url-encoded sign-in or reset body: the *first* `email` field, as the platform handlers read it
 * (`URLSearchParams.get`), so a repeated field cannot point the limit at another account than the one checked.
 */
export function emailFromUrlEncoded(body: string): string | null {
  return emailFromBody({ email: new URLSearchParams(body).get('email') })
}

/**
 * True when an integration run asks for real limits on this request: the platform's opt-in for auth limits
 * (`OM_TEST_MODE=1`, `OM_TEST_AUTH_RATE_LIMIT_MODE=opt-in`, header `x-om-test-rate-limit: on`). Integration runs
 * otherwise switch the platform limiter off (`OM_INTEGRATION_TEST`), so no route could answer 429 in a test.
 */
export function testLimiterRequested(
  env: Readonly<Record<string, string | undefined>>,
  header: string | null | undefined,
): boolean {
  return env.OM_TEST_MODE === '1' && env.OM_TEST_AUTH_RATE_LIMIT_MODE === 'opt-in' && header === 'on'
}

/** Whole seconds for `Retry-After`, at least 1. */
export function retryAfterSeconds(msBeforeNext: number): number {
  if (!Number.isFinite(msBeforeNext) || msBeforeNext <= 0) return 1
  return Math.max(1, Math.ceil(msBeforeNext / 1000))
}

/** The number of entries in an `X-Forwarded-For` header (0 when absent), for measuring the proxy depth. */
export function forwardedEntryCount(header: string | null | undefined): number {
  if (!header) return 0
  return header.split(',').filter((entry) => entry.trim() !== '').length
}

/**
 * True when the process should watch the limiter's Redis store: limits on, `redis` strategy and a `REDIS_URL` (the
 * only variable the platform limiter reads). With an unreachable store the platform limiter counts per process in
 * memory without a word, so the watch is what puts the outage in the logs.
 */
export function rateLimitStoreWatched(env: Readonly<Record<string, string | undefined>>): boolean {
  const disabled = ['false', '0', 'no', 'off'].includes((env.RATE_LIMIT_ENABLED ?? '').trim().toLowerCase())
  return !disabled && env.RATE_LIMIT_STRATEGY === 'redis' && (env.REDIS_URL ?? '').trim() !== ''
}
