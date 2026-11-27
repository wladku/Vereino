// The club of the current request (many clubs spec phase 3, DD-M02, REQ-M02; E22-S05 #631), for the app's server pages
// (`/`, `/login`, the frontend catch-all, the backend layout) and the root layout's theme colour (#906). The club comes only from the request's `Host` header
// (`lib/club-host.ts`), read through the approved public slug lookup of `clubCorePublicSite` (D-024/D-026); a client-sent
// club header is never read. Not registered in DI and never loaded by the CLI or the workers: it reads `next/headers`.
import { headers } from 'next/headers'
import type { AwilixContainer } from 'awilix'
import { clubOrigin } from '@vereino/core'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { requestHost, sessionHostRedirect, type RequestHost } from '../lib/club-host'
import { VEREINO_THEME_COLOR, webAppClubSlug, webAppThemeColor } from '../lib/web-app'
import type { ClubCorePublicSite } from './public-site'
import type { ClubCoreSettingsService } from './settings'

const logger = createLogger('club_core.request-club')

export type HostClub = { tenantId: string; organizationId: string; published: boolean }

export type RequestClub = { host: RequestHost; hostClub: HostClub | null }

async function requestContainer(): Promise<AwilixContainer> {
  const { bootstrap } = await import('@/bootstrap')
  bootstrap()
  return createRequestContainer()
}

/**
 * What the request's host names and, on a club's address, that club (null when the label names no club or the lookup
 * fails — the caller then treats the host as naming no club, which never grants anything).
 */
export async function requestClub(): Promise<RequestClub> {
  const host = requestHost((await headers()).get('host'), process.env)
  if (host.kind !== 'club') return { host, hostClub: null }
  try {
    const container = await requestContainer()
    if (!container.hasRegistration('clubCorePublicSite')) return { host, hostClub: null }
    const hostClub = await container.resolve<ClubCorePublicSite>('clubCorePublicSite').clubForHost(host.slug)
    return { host, hostClub }
  } catch (error: unknown) {
    logger.warn('The club of the request host could not be read', {
      errorName: error instanceof Error ? error.name : typeof error,
    })
    return { host, hostClub: null }
  }
}

/**
 * The browser's theme colour on the request's address (`<meta name="theme-color">`, #906): the club's colour while the
 * club publishes its page, the same rule and colour as the address's web app manifest (`services/web-app.ts`), else
 * Vereino's. Any failure answers with Vereino's colour, which names no club.
 */
export async function requestThemeColor(): Promise<string> {
  const slug = webAppClubSlug(requestHost((await headers()).get('host'), process.env), process.env)
  if (!slug) return VEREINO_THEME_COLOR
  try {
    const container = await requestContainer()
    if (!container.hasRegistration('clubCorePublicSite')) return VEREINO_THEME_COLOR
    const frame = await container.resolve<ClubCorePublicSite>('clubCorePublicSite').clubFrame(slug)
    if (frame.status !== 'ok') return VEREINO_THEME_COLOR
    return webAppThemeColor({ accentColor: frame.value.club.accent?.color ?? null })
  } catch (error: unknown) {
    logger.warn('The theme colour of the request host could not be read', {
      errorName: error instanceof Error ? error.name : typeof error,
    })
    return VEREINO_THEME_COLOR
  }
}

/** The address of the signed-in user's own club (its public slug at the club domain), or null. */
async function ownClubOrigin(scope: { tenantId: string; organizationId: string }): Promise<string | null> {
  try {
    const container = await requestContainer()
    if (!container.hasRegistration('clubCoreSettings')) return null
    const settings = await container.resolve<ClubCoreSettingsService>('clubCoreSettings').get(scope)
    return clubOrigin(settings.publicSettings.publicSlug, process.env)
  } catch {
    return null
  }
}

/**
 * Where a signed-in request on a club's address goes when its session belongs to another club (fail closed; spec
 * *Users*), or null when it may stay. `path` is kept at the user's own club address.
 */
export async function sessionRedirectForHost(
  request: RequestClub,
  auth: { tenantId?: string | null; orgId?: string | null } | null,
  path: string,
): Promise<string | null> {
  if (!auth || request.host.kind !== 'club') return null
  if (request.hostClub && auth.tenantId === request.hostClub.tenantId) return null
  const own =
    auth.tenantId && auth.orgId ? await ownClubOrigin({ tenantId: auth.tenantId, organizationId: auth.orgId }) : null
  return sessionHostRedirect({
    host: request.host,
    sessionTenantId: auth.tenantId,
    hostClub: request.hostClub,
    ownClubOrigin: own,
    path,
    env: process.env,
  })
}
