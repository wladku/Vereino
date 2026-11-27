// Social sign-in rules (`.ai/specs/2026-10-27-vereino-social-sign-in.md`; #566, Facebook #567). Pure: the provider
// configuration read from the environment, the id-token claim checks (Google), the Graph `/me` answer (Facebook), the single-use state marker's shape, the outcome redirects and the
// last-method rule. The services bind them to `arctic`, the platform cache, the session and the ORM.
//
// V-S04 (decided on #566, option 1): `arctic` decodes the id token but does not verify it. The token comes straight
// from the provider's token endpoint over TLS in the back channel (it never passes through the browser), so — as OIDC
// Core §3.1.3.7 allows — the TLS server validation stands in for the signature check, and `idTokenIdentity` checks
// the issuer, the audience, the authorized party, the expiry and the subject itself.
//
// DD-S07 (one central callback host; #700): the provider always returns to `APP_URL`. A round trip started on a club's
// address (`<slug>.<VEREINO_CLUB_DOMAIN>`) records that address and the club's tenant in the state marker; the callback
// exchanges the code and hands the identity to the club's address through a short-lived single-use hand-off marker
// (the DD-S04 cache pattern), where the session is set — the session cookie is host-only. The hand-off is refused on
// any host other than the recorded one and in any browser other than the one that started the round trip.
import { clubDomain } from '@vereino/core'

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

/**
 * Facebook's endpoints (phase 2, #567): OAuth 2.0 without an id token, so the identity comes from the Graph API's
 * `/me?fields=id,email` called with the access token of the back-channel exchange (spec *Architecture and Data Flow*).
 * The Graph version is pinned here; a newer one is a one-line change.
 * v26.0: released 2026-07-29; Meta keeps a version for at least two years, so it stays available until at least
 * 2028-07-29 (the exact expiry is "TBD" in Meta's versions table until v27.0 is listed there:
 * https://developers.facebook.com/docs/graph-api/changelog/versions/). After its expiry Meta silently serves the oldest
 * supported version, so pin a newer one before then and recheck the token exchange and `/me` with a test user (#832).
 */
export const FACEBOOK_GRAPH_VERSION = 'v26.0'
export const FACEBOOK_AUTHORIZATION_URL = `https://www.facebook.com/${FACEBOOK_GRAPH_VERSION}/dialog/oauth`
export const FACEBOOK_TOKEN_URL = `https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/oauth/access_token`
export const FACEBOOK_ME_URL = `https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/me`
export const FACEBOOK_SCOPES = ['email', 'public_profile'] as const

/** The callback route of a provider, relative to the redirect base. */
export function callbackPath(provider: IdentityProvider): string {
  return `/api/foundation/identity/${provider}/callback`
}

/**
 * How a provider names the user: `oidc` — an id token from the token endpoint (Google); `graph` — the user-info
 * endpoint called with the access token (Facebook).
 */
export type IdentityProtocol = 'oidc' | 'graph'

export type IdentityProviderConfig = {
  id: IdentityProvider
  protocol: IdentityProtocol
  clientId: string
  clientSecret: string
  authorizationUrl: string
  tokenUrl: string
  /** The user-info endpoint of a `graph` provider; null for `oidc`. */
  userInfoUrl: string | null
  redirectUri: string
  issuers: readonly string[]
  scopes: readonly string[]
}

type ProviderDefaults = {
  protocol: IdentityProtocol
  authorizationUrl: string
  tokenUrl: string
  userInfoUrl: string | null
  issuers: readonly string[]
  scopes: readonly string[]
}

const PROVIDER_DEFAULTS: Record<IdentityProvider, ProviderDefaults> = {
  google: {
    protocol: 'oidc',
    authorizationUrl: GOOGLE_AUTHORIZATION_URL,
    tokenUrl: GOOGLE_TOKEN_URL,
    userInfoUrl: null,
    issuers: GOOGLE_ISSUERS,
    scopes: GOOGLE_SCOPES,
  },
  facebook: {
    protocol: 'graph',
    authorizationUrl: FACEBOOK_AUTHORIZATION_URL,
    tokenUrl: FACEBOOK_TOKEN_URL,
    userInfoUrl: FACEBOOK_ME_URL,
    issuers: [],
    scopes: FACEBOOK_SCOPES,
  },
}

type Env = Readonly<Record<string, string | undefined>>

function envValue(env: Env, name: string): string | null {
  const value = env[name]?.trim()
  return value ? value : null
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]'])

function absoluteUrl(value: string | null, httpOnLoopbackOnly: boolean): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    const allowed =
      url.protocol === 'https:' ||
      (url.protocol === 'http:' && (!httpOnLoopbackOnly || LOOPBACK_HOSTS.has(url.hostname)))
    return allowed ? url.toString().replace(/\/$/, '') : null
  } catch {
    return null
  }
}

/** The app's own base: `https:`, or `http:` for a local instance. */
function absoluteHttpUrl(value: string | null): string | null {
  return absoluteUrl(value, false)
}

/**
 * A provider endpoint: `https:` only, except `http:` on a loopback host (the integration runner's fake). The identity
 * is trusted because it comes from the provider over TLS in the back channel (V-S04), so a plain-HTTP endpoint
 * elsewhere is refused.
 */
function providerEndpoint(value: string | null): string | null {
  return absoluteUrl(value, true)
}

/**
 * The configuration of an enabled provider, or null when it is disabled — no client id or secret (the feature flag
 * of the spec's *Rollout*) or no usable redirect base. `VEREINO_OAUTH_<PROVIDER>_CLIENT_ID` and `…_CLIENT_SECRET`
 * enable a provider; the test-only `…_AUTHORIZATION_URL`, `…_TOKEN_URL` and (Facebook) `…_USERINFO_URL` point the
 * client at the integration runner's fake (V-S04); unset, they are the provider's own. The redirect base is
 * `VEREINO_OAUTH_REDIRECT_BASE_URL`, else the app URL.
 */
export function identityProviderConfig(
  provider: IdentityProvider,
  env: Env,
  appUrl: string | null,
): IdentityProviderConfig | null {
  const defaults = PROVIDER_DEFAULTS[provider]
  const prefix = `VEREINO_OAUTH_${provider.toUpperCase()}`
  const clientId = envValue(env, `${prefix}_CLIENT_ID`)
  const clientSecret = envValue(env, `${prefix}_CLIENT_SECRET`)
  const base = absoluteHttpUrl(envValue(env, 'VEREINO_OAUTH_REDIRECT_BASE_URL') ?? appUrl)
  const authorizationUrl = providerEndpoint(envValue(env, `${prefix}_AUTHORIZATION_URL`) ?? defaults.authorizationUrl)
  const tokenUrl = providerEndpoint(envValue(env, `${prefix}_TOKEN_URL`) ?? defaults.tokenUrl)
  const userInfoUrl =
    defaults.userInfoUrl === null
      ? null
      : providerEndpoint(envValue(env, `${prefix}_USERINFO_URL`) ?? defaults.userInfoUrl)
  if (!clientId || !clientSecret || !base || !authorizationUrl || !tokenUrl) return null
  if (defaults.protocol === 'graph' && !userInfoUrl) return null
  return {
    id: provider,
    protocol: defaults.protocol,
    clientId,
    clientSecret,
    authorizationUrl,
    tokenUrl,
    userInfoUrl,
    redirectUri: `${base}${callbackPath(provider)}`,
    issuers: defaults.issuers,
    scopes: defaults.scopes,
  }
}

/** The subject and the e-mail an id token names; the e-mail only when the provider marks it verified. */
export type ProviderIdentity = { subject: string; email: string | null }

/** The longest provider subject a link stores. */
export const MAX_SUBJECT_LENGTH = 255

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

/** The access token of a token-endpoint answer (RFC 6749 §5.1), or null when it carries none. */
export function accessTokenOf(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null
  const token = (body as Record<string, unknown>).access_token
  return typeof token === 'string' && token.length > 0 ? token : null
}

/**
 * The identity of a Graph `/me` answer, or null without a usable id. Facebook shares an e-mail only when the person
 * granted the `email` permission and has a confirmed address; without one the link stores none (J-S03).
 */
export function graphIdentity(body: unknown): ProviderIdentity | null {
  if (typeof body !== 'object' || body === null) return null
  const me = body as Record<string, unknown>
  const subject = me.id
  if (typeof subject !== 'string' || subject.length === 0 || subject.length > MAX_SUBJECT_LENGTH) return null
  const email = typeof me.email === 'string' && me.email.length > 0 ? me.email : null
  return { subject, email }
}

/** The public page where a person checks a Facebook data-deletion request by its confirmation code. */
export const DELETION_STATUS_PATH = '/identity/deletion'

const CONFIRMATION_CODE_PATTERN = /^[a-f0-9]{16}$/

/** True for a confirmation code as the deletion callback makes it: 8 random bytes, hex. */
export function isConfirmationCode(value: unknown): value is string {
  return typeof value === 'string' && CONFIRMATION_CODE_PATTERN.test(value)
}

/** The absolute status URL of a deletion request, on the app's redirect base. */
export function deletionStatusUrl(redirectUri: string, code: string): string {
  const url = new URL(DELETION_STATUS_PATH, redirectUri)
  url.searchParams.set('code', code)
  return url.toString()
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

/** The club's address a round trip started on (DD-S07): its origin and its tenant. */
export type StateClub = { origin: string; tenantId: string }

export type StateMarker = {
  provider: IdentityProvider
  purpose: StatePurpose
  /** The PKCE code verifier (S256). */
  verifier: string
  /** The sanitized same-origin path to land on after a sign-in. */
  redirect: string
  /** Set when `start` ran on a club's address: the callback hands the round trip back there (DD-S07). */
  club?: StateClub
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

/** A cached value as an object: parsed from JSON text, or taken as it is; null for anything else. */
function cachedObject(value: unknown): Record<string, unknown> | null {
  let data: unknown = value
  if (typeof value === 'string') {
    try {
      data = JSON.parse(value)
    } catch {
      return null
    }
  }
  return typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : null
}

/** The recorded club of a marker: absent (`undefined`), well formed, or malformed (`null`). */
function parseClub(value: unknown): StateClub | null | undefined {
  if (value === undefined) return undefined
  if (typeof value !== 'object' || value === null) return null
  const club = value as Record<string, unknown>
  if (!isNonEmptyString(club.origin) || !isNonEmptyString(club.tenantId)) return null
  return { origin: club.origin, tenantId: club.tenantId }
}

/** The marker read back from the cache, or null for anything `start` did not write. */
export function parseStateMarker(value: unknown): StateMarker | null {
  const marker = cachedObject(value)
  if (!marker) return null
  const purpose = parsePurpose(marker.purpose)
  const club = parseClub(marker.club)
  if (
    !isIdentityProvider(marker.provider) ||
    !purpose ||
    club === null ||
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
    ...(club ? { club } : {}),
    expiresAt: marker.expiresAt,
  }
}

/** True when the consumed marker belongs to this provider's callback and has not expired. */
export function markerAccepted(
  marker: { provider: IdentityProvider; expiresAt: number },
  provider: IdentityProvider,
  nowMs: number,
): boolean {
  return marker.provider === provider && marker.expiresAt > nowMs
}

/**
 * The browser check of the callback: the state cookie matches, or — for a round trip started on a club's address, whose
 * state cookie lives on that host and never reaches `APP_URL` — the check is left to the hand-off, which compares the
 * club host's cookie with the state (DD-S07).
 */
export function callbackBrowserAccepted(cookieMatches: boolean, marker: StateMarker): boolean {
  return cookieMatches || marker.club !== undefined
}

type HostEnv = Readonly<Record<string, string | undefined>>

/** `host` without its `:port`. */
const withoutPort = (host: string): string => host.replace(/:\d+$/, '')

/**
 * The label of a club's address in a `Host` header (`<label>.<VEREINO_CLUB_DOMAIN>`, one DNS label), or null: no club
 * domain configured, the host of `APP_URL`, the bare domain, `www.` or any other host. Only the shape is checked here;
 * the club itself comes from the approved public slug lookup (`clubCorePublicSite.clubForHost`), which answers null for a
 * reserved or unknown label. A domain written with a port is matched with the port; one without matches on any port —
 * the same reading as `club_core`'s `requestHost`.
 */
export function clubLabelOfHost(hostHeader: string | null | undefined, env: HostEnv): string | null {
  const domain = clubDomain(env)
  const raw = (hostHeader ?? '').trim().toLowerCase()
  if (!domain || raw === '') return null
  let appHost: string | null = null
  try {
    appHost = new URL(env.APP_URL?.trim() ?? '').host.toLowerCase()
  } catch {
    appHost = null
  }
  if (raw === appHost) return null
  const host = domain.includes(':') ? raw : withoutPort(raw)
  if (!host.endsWith(`.${domain}`)) return null
  const label = host.slice(0, -(domain.length + 1))
  return label === '' || label === 'www' || label.includes('.') ? null : label
}

/**
 * True when the `Host` header names the recorded club origin: the exact host and port when the origin has a port, the
 * host on any port when it has none (a proxy may append the port it listens on).
 */
export function hostMatchesOrigin(hostHeader: string | null | undefined, origin: string): boolean {
  const raw = (hostHeader ?? '').trim().toLowerCase()
  if (raw === '') return false
  let url: URL
  try {
    url = new URL(origin)
  } catch {
    return false
  }
  return url.port === '' ? withoutPort(raw) === url.hostname : raw === url.host
}

/** How long a hand-off marker lives (DD-S07): one redirect, so one minute is plenty. */
export const HANDOFF_TTL_MS = 60 * 1000

/** The key of a hand-off marker in the platform cache. */
export function handoffMarkerKey(token: string): string {
  return `foundation:identity:handoff:${token}`
}

/** The hand-off route on a club's address. */
export function handoffPath(provider: IdentityProvider, token: string): string {
  return `/api/foundation/identity/${provider}/handoff?token=${encodeURIComponent(token)}`
}

/**
 * What the callback hands to the club's address (DD-S07): the round trip's purpose and landing path, the identity the
 * provider confirmed, the club it started on and its state, which the hand-off compares with the club host's cookie.
 */
export type HandoffMarker = {
  provider: IdentityProvider
  purpose: StatePurpose
  redirect: string
  club: StateClub
  state: string
  identity: ProviderIdentity
  expiresAt: number
}

/** The hand-off marker read back from the cache, or null for anything the callback did not write. */
export function parseHandoffMarker(value: unknown): HandoffMarker | null {
  const marker = cachedObject(value)
  if (!marker) return null
  const purpose = parsePurpose(marker.purpose)
  const club = parseClub(marker.club)
  const identity = marker.identity as Record<string, unknown> | null | undefined
  if (
    !isIdentityProvider(marker.provider) ||
    !purpose ||
    !club ||
    !isWellFormedState(marker.state) ||
    !isNonEmptyString(marker.redirect) ||
    typeof identity !== 'object' ||
    identity === null ||
    !isNonEmptyString(identity.subject) ||
    !(identity.email === null || typeof identity.email === 'string') ||
    typeof marker.expiresAt !== 'number'
  ) {
    return null
  }
  return {
    provider: marker.provider,
    purpose,
    redirect: marker.redirect,
    club,
    state: marker.state,
    identity: { subject: identity.subject, email: identity.email },
    expiresAt: marker.expiresAt,
  }
}

/** The location of an outcome: the path on the club's address when the round trip started there, else the path. */
export function outcomeLocation(club: StateClub | undefined, path: string): string {
  return club ? `${club.origin}${path}` : path
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

/** A provider answer the exchange cannot use (an error status, or no access token); its message is a short reason. */
export class IdentityProviderError extends Error {
  override name = 'IdentityProviderError'
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
