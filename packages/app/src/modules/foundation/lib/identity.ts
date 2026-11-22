// Social sign-in rules (`.ai/specs/2026-10-27-vereino-social-sign-in.md`; #566). Pure: the provider configuration read
// from the environment, the id-token claim checks, the single-use state marker's shape, the outcome redirects and the
// last-method rule. The services bind them to `arctic`, the platform cache, the session and the ORM.
//
// V-S04 (decided on #566, option 1): `arctic` decodes the id token but does not verify it. The token comes straight
// from the provider's token endpoint over TLS in the back channel (it never passes through the browser), so — as OIDC
// Core §3.1.3.7 allows — the TLS server validation stands in for the signature check, and `idTokenIdentity` checks
// the issuer, the audience, the authorized party, the expiry and the subject itself.

/** Providers of the identity-link table (`IdentityLink.provider`). */
export const IDENTITY_PROVIDERS = ['google', 'facebook'] as const
export type IdentityProvider = (typeof IDENTITY_PROVIDERS)[number]

export function isIdentityProvider(value: unknown): value is IdentityProvider {
  return typeof value === 'string' && (IDENTITY_PROVIDERS as readonly string[]).includes(value)
}

/** Google's endpoints and the two issuer spellings its id tokens carry. */
export const GOOGLE_AUTHORIZATION_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
export const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'] as const
export const GOOGLE_SCOPES = ['openid', 'email'] as const

/** The callback route of a provider, relative to the redirect base. */
export function callbackPath(provider: IdentityProvider): string {
  return `/api/foundation/identity/${provider}/callback`
}

export type IdentityProviderConfig = {
  id: IdentityProvider
  clientId: string
  clientSecret: string
  authorizationUrl: string
  tokenUrl: string
  redirectUri: string
  issuers: readonly string[]
  scopes: readonly string[]
}

type Env = Readonly<Record<string, string | undefined>>

function envValue(env: Env, name: string): string | null {
  const value = env[name]?.trim()
  return value ? value : null
}

function absoluteHttpUrl(value: string | null): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString().replace(/\/$/, '') : null
  } catch {
    return null
  }
}

/**
 * The configuration of an enabled provider, or null when it is disabled — no client id or secret (the feature flag
 * of the spec's *Rollout*), no usable redirect base, or a provider this phase does not ship (Facebook is phase 2).
 * `VEREINO_OAUTH_GOOGLE_AUTHORIZATION_URL` and `…_TOKEN_URL` point the client at the test fake (V-S04); unset, they
 * are Google's own. The redirect base is `VEREINO_OAUTH_REDIRECT_BASE_URL`, else the app URL.
 */
export function identityProviderConfig(
  provider: IdentityProvider,
  env: Env,
  appUrl: string | null,
): IdentityProviderConfig | null {
  if (provider !== 'google') return null
  const clientId = envValue(env, 'VEREINO_OAUTH_GOOGLE_CLIENT_ID')
  const clientSecret = envValue(env, 'VEREINO_OAUTH_GOOGLE_CLIENT_SECRET')
  const base = absoluteHttpUrl(envValue(env, 'VEREINO_OAUTH_REDIRECT_BASE_URL') ?? appUrl)
  const authorizationUrl = absoluteHttpUrl(
    envValue(env, 'VEREINO_OAUTH_GOOGLE_AUTHORIZATION_URL') ?? GOOGLE_AUTHORIZATION_URL,
  )
  const tokenUrl = absoluteHttpUrl(envValue(env, 'VEREINO_OAUTH_GOOGLE_TOKEN_URL') ?? GOOGLE_TOKEN_URL)
  if (!clientId || !clientSecret || !base || !authorizationUrl || !tokenUrl) return null
  return {
    id: provider,
    clientId,
    clientSecret,
    authorizationUrl,
    tokenUrl,
    redirectUri: `${base}${callbackPath(provider)}`,
    issuers: GOOGLE_ISSUERS,
    scopes: GOOGLE_SCOPES,
  }
}

/** The subject and the e-mail an id token names; the e-mail only when the provider marks it verified. */
export type ProviderIdentity = { subject: string; email: string | null }

const MAX_SUBJECT_LENGTH = 255

/**
 * The identity of a decoded id-token payload, or null when a claim fails: the issuer is not the provider's, the
 * audience does not name our client (a token for several audiences must name us as `azp`), the token has expired or
 * carries no expiry, or the subject is missing or too long.
 */
export function idTokenIdentity(
  payload: unknown,
  expected: { issuers: readonly string[]; clientId: string },
  nowMs: number,
): ProviderIdentity | null {
  if (typeof payload !== 'object' || payload === null) return null
  const claims = payload as Record<string, unknown>
  if (typeof claims.iss !== 'string' || !expected.issuers.includes(claims.iss)) return null
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud]
  if (!audiences.includes(expected.clientId)) return null
  if (audiences.length > 1 && claims.azp !== expected.clientId) return null
  if (typeof claims.exp !== 'number' || claims.exp * 1000 <= nowMs) return null
  const subject = claims.sub
  if (typeof subject !== 'string' || subject.length === 0 || subject.length > MAX_SUBJECT_LENGTH) return null
  const email = claims.email_verified === true && typeof claims.email === 'string' ? claims.email : null
  return { subject, email }
}

/** How long a state marker lives (DD-S04). */
export const STATE_TTL_MS = 10 * 60 * 1000
/** The `HttpOnly` cookie that binds the marker to the browser that started the round trip. */
export const STATE_COOKIE = 'vereino_identity_state'
/** The cookie's path: only the identity routes ever receive it. */
export const STATE_COOKIE_PATH = '/api/foundation/identity'

const STATE_PATTERN = /^[A-Za-z0-9_-]{43}$/

/** True for a state as `start` makes it: 32 random bytes, base64url. */
export function isWellFormedState(value: unknown): value is string {
  return typeof value === 'string' && STATE_PATTERN.test(value)
}

/** What a round trip is for: a sign-in, or linking the signed-in user who started it (DD-S02). */
export type StatePurpose =
  { kind: 'sign_in' } | { kind: 'link'; userId: string; tenantId: string; organizationId: string }

export type StateMarker = {
  provider: IdentityProvider
  purpose: StatePurpose
  /** The PKCE code verifier (S256). */
  verifier: string
  /** The sanitized same-origin path to land on after a sign-in. */
  redirect: string
  expiresAt: number
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function parsePurpose(value: unknown): StatePurpose | null {
  if (typeof value !== 'object' || value === null) return null
  const purpose = value as Record<string, unknown>
  if (purpose.kind === 'sign_in') return { kind: 'sign_in' }
  if (
    purpose.kind === 'link' &&
    isNonEmptyString(purpose.userId) &&
    isNonEmptyString(purpose.tenantId) &&
    isNonEmptyString(purpose.organizationId)
  ) {
    return { kind: 'link', userId: purpose.userId, tenantId: purpose.tenantId, organizationId: purpose.organizationId }
  }
  return null
}

/** The marker read back from the cache, or null for anything `start` did not write. */
export function parseStateMarker(value: unknown): StateMarker | null {
  let data: unknown = value
  if (typeof value === 'string') {
    try {
      data = JSON.parse(value)
    } catch {
      return null
    }
  }
  if (typeof data !== 'object' || data === null) return null
  const marker = data as Record<string, unknown>
  const purpose = parsePurpose(marker.purpose)
  if (
    !isIdentityProvider(marker.provider) ||
    !purpose ||
    !isNonEmptyString(marker.verifier) ||
    !isNonEmptyString(marker.redirect) ||
    typeof marker.expiresAt !== 'number'
  ) {
    return null
  }
  return {
    provider: marker.provider,
    purpose,
    verifier: marker.verifier,
    redirect: marker.redirect,
    expiresAt: marker.expiresAt,
  }
}

/** True when the consumed marker belongs to this provider's callback and has not expired. */
export function markerAccepted(marker: StateMarker, provider: IdentityProvider, nowMs: number): boolean {
  return marker.provider === provider && marker.expiresAt > nowMs
}

/** The `/login` outcomes: one sentence for all three (no enumeration, REQ-S04). */
export type SignInOutcome = 'unlinked' | 'invalid' | 'failed'

export function loginOutcomePath(outcome: SignInOutcome): string {
  return `/login?identity=${outcome}`
}

export const PROFILE_PATH = '/club/profile'

/** The profile after a link round trip: `linked` on success, the generic `failed` otherwise. */
export function profileOutcomePath(outcome: 'linked' | 'failed', provider: IdentityProvider): string {
  return `${PROFILE_PATH}?identity=${outcome}&provider=${provider}`
}

/** A sign-in method may be removed while the user keeps another one: a password or a second link. */
export function canRemoveMethod(hasPassword: boolean, linkCount: number): boolean {
  return hasPassword || linkCount > 1
}

/** The key of a state marker in the platform cache. */
export function stateMarkerKey(state: string): string {
  return `foundation:identity:state:${state}`
}

/** The token-endpoint timeout (spec *Failure modes*): a slower answer ends as `identity=failed`. */
export const TOKEN_TIMEOUT_MS = 5000

export class IdentityTimeoutError extends Error {
  override name = 'IdentityTimeoutError'
}

/**
 * The promise's result, or an `IdentityTimeoutError` after `ms`. `arctic` takes no abort signal, so the request is
 * abandoned rather than cancelled; its late answer is ignored.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new IdentityTimeoutError(`timed out after ${String(ms)} ms`))
    }, ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error instanceof Error ? error : new Error(String(error)))
      },
    )
  })
}

/**
 * The payload of the `foundation.identity.*` events: ids and the provider only (S4.6) — never the provider subject,
 * the e-mail or a token, whatever else the source object carries.
 */
export function identityEventPayload(link: {
  id: string
  userId: string
  provider: IdentityProvider
  tenantId: string
  organizationId: string
}): { id: string; userId: string; provider: IdentityProvider; tenantId: string; organizationId: string } {
  return {
    id: link.id,
    userId: link.userId,
    provider: link.provider,
    tenantId: link.tenantId,
    organizationId: link.organizationId,
  }
}
