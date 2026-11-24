// The club of a request, from its `Host` header (many clubs spec phase 3, DD-M02, DD-M03, REQ-M02; E22-S05 #631). With
// `VEREINO_CLUB_DOMAIN` set, `<public slug>.<club domain>` is a club's address; the bare domain, `www.` and the host of
// `APP_URL` are the instance's own address (neutral landing page, maintainers' sign-in); every other host is unknown.
// Without the variable the instance has one club and keeps its behaviour (`VEREINO_HOME_CLUB_SLUG`, deprecated). Only
// the `Host` header counts, never a client-sent club header (spec *Users, Permissions, and Scope*); the host only selects
// the club a guest sees and the tenant the sign-in form targets, it never widens a signed-in user's scope. Pure: the
// header and the environment are passed in.
import { clubDomain, clubOrigin } from '@vereino/core'
import { isReservedClubSlug } from './club-onboarding'
import { isPublicSlug } from './publication'

type Env = Readonly<Record<string, string | undefined>>

export type RequestHost =
  /** No club domain is configured: a one-club instance (and the tests), behaving as before phase 3. */
  | { kind: 'single' }
  /** `<slug>.<club domain>`: a club's address (the slug is well formed and not reserved; it may name no club). */
  | { kind: 'club'; slug: string }
  /** The bare club domain, `www.<club domain>` or the host of `APP_URL`. */
  | { kind: 'instance' }
  /** Any other host, a reserved label or a malformed one. */
  | { kind: 'unknown' }

/** `host` without its `:port`. */
const withoutPort = (host: string): string => host.replace(/:\d+$/, '')

/** The host (`host[:port]`, lower-case) of `APP_URL`, or null when it is unset or not a URL. */
function appHost(env: Env): string | null {
  try {
    return new URL(env.APP_URL?.trim() ?? '').host.toLowerCase()
  } catch {
    return null
  }
}

/** What the `Host` header of a request names (see `RequestHost`). */
export function requestHost(hostHeader: string | null | undefined, env: Env): RequestHost {
  const domain = clubDomain(env)
  if (!domain) return { kind: 'single' }
  const raw = (hostHeader ?? '').trim().toLowerCase()
  if (raw === '') return { kind: 'unknown' }
  if (raw === appHost(env)) return { kind: 'instance' }
  // A domain written with a port is matched with the port; one without matches on any port.
  const host = domain.includes(':') ? raw : withoutPort(raw)
  if (host === domain || host === `www.${domain}`) return { kind: 'instance' }
  if (!host.endsWith(`.${domain}`)) return { kind: 'unknown' }
  const label = host.slice(0, -(domain.length + 1))
  return isPublicSlug(label) && !isReservedClubSlug(label) ? { kind: 'club', slug: label } : { kind: 'unknown' }
}

/**
 * Where a public club page under `/p/<clubSlug>` sends a request that is not on that club's own address (DD-M03): the
 * same path and query at the club's address, so printed links and QR codes keep working. Null when no club domain is
 * configured or the request is already on the club's address.
 */
export function publicPageRedirect(input: {
  host: RequestHost
  clubSlug: string
  pathAndQuery: string
  env: Env
}): string | null {
  if (input.host.kind === 'single') return null
  if (input.host.kind === 'club' && input.host.slug === input.clubSlug) return null
  const origin = clubOrigin(input.clubSlug, input.env)
  return origin ? `${origin}${input.pathAndQuery}` : null
}

/**
 * The platform pages that stay on `APP_URL` in this phase (owner's decision of 2026-11-23 on #631, option (c)): the
 * password reset (`/reset`, `/reset/<token>`), whose request and confirmation the platform checks against the exact
 * origin of `APP_URL`.
 */
const INSTANCE_ONLY_PREFIXES = ['/reset'] as const

/**
 * Where a request on a club's address for a page that stays on `APP_URL` goes: the same path and query on `APP_URL`.
 * Null on any other host, for any other page, or when `APP_URL` is unset.
 */
export function instancePageRedirect(input: { host: RequestHost; pathAndQuery: string; env: Env }): string | null {
  if (input.host.kind !== 'club') return null
  const path = input.pathAndQuery.split(/[?#]/, 1)[0]
  if (!INSTANCE_ONLY_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) return null
  const appUrl = input.env.APP_URL?.trim().replace(/\/+$/, '')
  return appUrl ? `${appUrl}${input.pathAndQuery}` : null
}

/**
 * Where a signed-in request on a club's address goes when its session belongs to another club (spec *Users*: a session
 * whose tenant differs from the host's club is sent to its own club's address, fail closed): `path` at the user's own
 * club address, or on `APP_URL` when that club has none. Null when the host is not a club's address or the session is
 * the club's own. `hostClub` null (the label names no club) counts as another club.
 */
export function sessionHostRedirect(input: {
  host: RequestHost
  sessionTenantId: string | null | undefined
  hostClub: { tenantId: string } | null
  ownClubOrigin: string | null
  path: string
  env: Env
}): string | null {
  if (input.host.kind !== 'club') return null
  if (input.hostClub && input.sessionTenantId && input.hostClub.tenantId === input.sessionTenantId) return null
  const base = input.ownClubOrigin ?? input.env.APP_URL?.trim().replace(/\/+$/, '') ?? ''
  return `${base}${input.path}`
}

/** What `/` answers. */
export type HomeOutcome = { kind: 'redirect'; to: string } | { kind: 'landing' } | { kind: 'not_found' }

/**
 * The answer of `/` on an instance with a club domain (the one-club case keeps `homeRedirect`): on a club's address a
 * guest goes to its public page while it is published, else to the sign-in page, and a signed-in member of the club into
 * the app; a label that names no club is not found. On the instance's own address a guest sees the neutral landing page
 * and a signed-in visitor goes into the app. An unknown host is not found. A session of another club is handled by
 * `sessionHostRedirect` before this.
 */
export function clubHostHome(input: {
  host: Exclude<RequestHost, { kind: 'single' }>
  authenticated: boolean
  hostClub: { published: boolean } | null
}): HomeOutcome {
  if (input.host.kind === 'unknown') return { kind: 'not_found' }
  if (input.host.kind === 'instance')
    return input.authenticated ? { kind: 'redirect', to: '/backend' } : { kind: 'landing' }
  if (!input.hostClub) return { kind: 'not_found' }
  if (input.authenticated) return { kind: 'redirect', to: '/backend' }
  return {
    kind: 'redirect',
    to: input.hostClub.published ? `/p/${encodeURIComponent(input.host.slug)}` : '/login',
  }
}

/**
 * The sign-in page on a club's address targets that club's tenant (spec *Users*: the same e-mail may have an account in
 * two clubs): the platform page reads `?tenant=`, so a request without it — or with another tenant — is sent to the same
 * page with the club's tenant. Null when nothing has to change.
 */
export function signInTenantRedirect(input: {
  host: RequestHost
  hostClub: { tenantId: string } | null
  query: Readonly<Record<string, string | string[] | undefined>>
}): string | null {
  if (input.host.kind !== 'club' || !input.hostClub) return null
  if (input.query.tenant === input.hostClub.tenantId) return null
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(input.query)) {
    if (key === 'tenant' || value === undefined) continue
    for (const entry of Array.isArray(value) ? value : [value]) params.append(key, entry)
  }
  params.set('tenant', input.hostClub.tenantId)
  return `/login?${params.toString()}`
}
