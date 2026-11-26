// Cross-site request check for cookie-authenticated `/api` mutations (engineering standards S8.9, ENG-Q-11 answered by
// the owner on 2026-11-26, #744). The platform has no defence beyond the session cookie's `SameSite=Lax` (spike #448
// §3), and with clubs on `{club}.<club domain>` (D-036) every sibling subdomain is same-site, so `src/proxy.ts` refuses
// a `POST`/`PUT`/`PATCH`/`DELETE` on `/api` that carries a session cookie and comes from a foreign `Origin` or with
// `Sec-Fetch-Site: cross-site`. Exempt: bearer-token and API-key requests (a cross-site page cannot send those headers
// without a CORS preflight the app never grants) and the webhook routes (S8.8: they verify a signature, and only they
// are exempt). Allowed origins: the request's own host, the host of `APP_URL`, the bare club domain and every
// `<label>.<club domain>`. Pure: the headers and the environment are passed in.
import { clubDomain } from '#src/club-url'

type Env = Readonly<Record<string, string | undefined>>

/** The machine code of the `403` the proxy answers with. */
export const CROSS_SITE_REQUEST_ERROR_CODE = 'cross_site_request_refused'

/** Methods that may change state (S8.9: `GET` never does). */
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])

/** The platform's session cookies (staff and customer, access and refresh). */
const SESSION_COOKIES = ['auth_token', 'session_token', 'customer_auth_token', 'customer_session_token'] as const

/** `/api/webhooks/…` and `/api/<module>/webhook(s)/…`, e.g. `/api/payment_gateways/webhook/stripe` (S8.8). */
const WEBHOOK_PATH = /^\/api\/(?:[^/]+\/)?webhooks?(?:\/|$)/

/** One DNS label: the club part of `<label>.<club domain>`. */
const DNS_LABEL = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/

export type CrossSiteRequest = {
  method: string
  pathname: string
  /** Reads a request header by its lower-case name; null or undefined when absent. */
  header: (name: string) => string | null | undefined
  env: Env
}

export type CrossSiteVerdict = { allowed: true } | { allowed: false; reason: 'cross_site_fetch' | 'foreign_origin' }

/** Whether the `Cookie` header carries one of the platform's session cookies. */
export function hasSessionCookie(cookieHeader: string | null | undefined): boolean {
  const value = cookieHeader ?? ''
  return SESSION_COOKIES.some((name) => new RegExp(`(?:^|;\\s*)${name}=[^;]`).test(value))
}

/** Whether the request authenticates with a bearer token or an API key rather than with the cookie. */
function hasCredentialHeader(header: CrossSiteRequest['header']): boolean {
  const authorization = (header('authorization') ?? '').trim().toLowerCase()
  if (authorization.startsWith('bearer ') || authorization.startsWith('apikey ')) return true
  return (header('x-api-key') ?? '').trim() !== ''
}

/** `host[:port]` of a URL, lower-case; null when it is not an absolute URL. */
function urlHost(value: string | undefined): string | null {
  try {
    return new URL(value?.trim() ?? '').host.toLowerCase() || null
  } catch {
    return null
  }
}

/** Whether `host` (`host[:port]`, lower-case) is the bare club domain or a club address under it. */
function isClubDomainHost(host: string, env: Env): boolean {
  const domain = clubDomain(env)
  if (!domain) return false
  // A domain written with a port is matched with the port; one without matches on any port (as `requestHost` does).
  const candidate = domain.includes(':') ? host : host.replace(/:\d+$/, '')
  if (candidate === domain) return true
  if (!candidate.endsWith(`.${domain}`)) return false
  return DNS_LABEL.test(candidate.slice(0, -(domain.length + 1)))
}

/** Whether the `Origin` header names the instance: the request's own host, `APP_URL`'s host or the club domain. */
export function isInstanceOrigin(origin: string, request: Pick<CrossSiteRequest, 'header' | 'env'>): boolean {
  const host = urlHost(origin)
  if (!host) return false
  const ownHosts = [request.header('host'), request.header('x-forwarded-host')?.split(',')[0]]
    .map((value) => value?.trim().toLowerCase())
    .filter((value): value is string => Boolean(value))
  if (ownHosts.includes(host)) return true
  if (host === urlHost(request.env.APP_URL)) return true
  return isClubDomainHost(host, request.env)
}

/** The verdict of the S8.9 check for one request; only a cookie-authenticated `/api` mutation can be refused. */
export function crossSiteApiVerdict(request: CrossSiteRequest): CrossSiteVerdict {
  if (!MUTATING_METHODS.has(request.method.toUpperCase())) return { allowed: true }
  if (request.pathname !== '/api' && !request.pathname.startsWith('/api/')) return { allowed: true }
  if (WEBHOOK_PATH.test(request.pathname)) return { allowed: true }
  if (hasCredentialHeader(request.header)) return { allowed: true }
  if (!hasSessionCookie(request.header('cookie'))) return { allowed: true }
  if ((request.header('sec-fetch-site') ?? '').trim().toLowerCase() === 'cross-site') {
    return { allowed: false, reason: 'cross_site_fetch' }
  }
  const origin = request.header('origin')
  // Browsers send `Origin` on every non-GET fetch and form post; a request without it is not a browser's cross-site
  // request (`Sec-Fetch-Site` above covers the browsers that send it), so `SameSite=Lax` stays the layer below.
  if (origin === null || origin === undefined) return { allowed: true }
  return isInstanceOrigin(origin, request) ? { allowed: true } : { allowed: false, reason: 'foreign_origin' }
}
