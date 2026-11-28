// The installable web app of the request's address (D-045, E31-S01 #873), for the sessionless `manifest.webmanifest` and
// `app-icon/[size]` routes of the app. The club comes only from the `Host` header (`lib/club-host.ts`; on a one-club
// instance from `VEREINO_HOME_CLUB_SLUG`), read through the approved public slug lookup of `clubCorePublicSite`
// (D-024/D-026): a club shows its name, colour and logo only while it publishes its page, like every other sessionless
// read; any other address answers with Vereino's identity. The logo bytes are read through the platform's
// `attachmentService` with the exact owner, assignment and partition of the club logo, in the found club's scope. Not
// registered in DI and never loaded by the CLI or the workers: it reads `next/headers`. Route handlers only (API bootstrap).
import { headers } from 'next/headers'
import type { AwilixContainer } from 'awilix'
import type { AttachmentService } from '@open-mercato/core/modules/attachments'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { requestHost } from '../lib/club-host'
import { clubIdentity, publicLogoVersion, vereinoIdentity, webAppClubSlug, type WebAppIdentity } from '../lib/web-app'
import type { ClubCorePublicSite } from './public-site'

const logger = createLogger('club_core.web-app')

const CLUB_CORE_PARTITION = 'privateAttachments'

export type WebAppLogo = { bytes: Uint8Array; mimeType: string }

/**
 * The identity of the address, the key under which a drawn icon may be kept (one per club, not per `Host` spelling),
 * and the reader of the logo file, called only when an icon is drawn; it answers null when the file cannot be read.
 */
export type RequestWebApp = { identity: WebAppIdentity; cacheKey: string; readLogo: () => Promise<WebAppLogo | null> }

const NO_LOGO = (): Promise<WebAppLogo | null> => Promise.resolve(null)

/** The public slug the request's address names: the host's club label, or the one-club instance's configured club. */
async function requestSlug(): Promise<string | null> {
  return webAppClubSlug(requestHost((await headers()).get('host'), process.env), process.env)
}

/** The club logo's bytes through the platform attachment service, in the found club's scope; null on any failure. */
async function readClubLogo(
  container: AwilixContainer,
  site: ClubCorePublicSite,
  slug: string,
): Promise<WebAppLogo | null> {
  try {
    const ref = await site.clubLogo(slug)
    if (ref.status !== 'ok' || !container.hasRegistration('attachmentService')) return null
    const file = await container.resolve<AttachmentService>('attachmentService').readScoped({
      attachmentId: ref.value.attachmentId,
      auth: { sub: 'club_core:web-app', tenantId: ref.value.tenantId, orgId: ref.value.organizationId, roles: [] },
      expectedOwner: ref.value.owner,
      expectedAssignment: ref.value.assignment,
      expectedPartitionCode: CLUB_CORE_PARTITION,
      requirePrivatePartition: true,
    })
    return { bytes: new Uint8Array(file.buffer), mimeType: file.contentType }
  } catch (error: unknown) {
    logger.warn('The club logo of the web app could not be read; the icon shows the initial', { err: error })
    return null
  }
}

/**
 * The web app identity of the request's address. A failure to read the club answers with Vereino's identity, which
 * names no club; a failure to read only the logo keeps the club's name and colour (the icon then shows the initial).
 */
export async function requestWebApp(productName: string): Promise<RequestWebApp> {
  const fallback: RequestWebApp = { identity: vereinoIdentity(productName), cacheKey: 'vereino', readLogo: NO_LOGO }
  const slug = await requestSlug()
  if (!slug) return fallback
  try {
    // Route handlers, not pages, call this: the API bootstrap (as `src/app/api/healthz`). A page bootstrap here would
    // register the command loaders a second time when the API dispatcher bootstraps, and every API call would fail.
    const { bootstrap } = await import('@/bootstrap-api')
    bootstrap()
    const container = await createRequestContainer()
    if (!container.hasRegistration('clubCorePublicSite')) return fallback
    const site = container.resolve<ClubCorePublicSite>('clubCorePublicSite')
    const frame = await site.clubFrame(slug)
    if (frame.status !== 'ok') return fallback
    const { club } = frame.value
    const logoId = club.logo.source === 'club' ? publicLogoVersion(club.logo.url) : null
    return {
      identity: clubIdentity({ name: club.name, accentColor: club.accent?.color ?? null, logoId }),
      cacheKey: `club:${slug}`,
      readLogo: logoId ? () => readClubLogo(container, site, slug) : NO_LOGO,
    }
  } catch (error: unknown) {
    logger.warn('The web app identity of the request host could not be read; Vereino is shown', { err: error })
    return fallback
  }
}
