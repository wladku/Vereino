// The installable web app of the request's address (D-045, E31-S01 #873), for the sessionless `manifest.webmanifest` and
// `app-icon/[size]` routes of the app. The club comes only from the `Host` header (`lib/club-host.ts`; on a one-club
// instance from `VEREINO_HOME_CLUB_SLUG`), read through the approved public slug lookup of `clubCorePublicSite`
// (D-024/D-026): a club shows its name, colour and logo only while it publishes its page, like every other sessionless
// read; any other address answers with Vereino's identity. The logo bytes are read through the platform's
// `attachmentService` with the exact owner, assignment and partition of the club logo, in the found club's scope. Not
// registered in DI and never loaded by the CLI or the workers: it reads `next/headers`. Route handlers only (API bootstrap).
import { headers } from 'next/headers'
import type { AttachmentService } from '@open-mercato/core/modules/attachments'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { requestHost } from '../lib/club-host'
import { homeClubSlug } from '../lib/home-route'
import { clubIdentity, vereinoIdentity, type WebAppIdentity } from '../lib/web-app'
import type { ClubCorePublicSite } from './public-site'

const logger = createLogger('club_core.web-app')

const CLUB_CORE_PARTITION = 'privateAttachments'

/** The identity of the address and, when its icon draws the logo, the logo's bytes and type. */
export type RequestWebApp = { identity: WebAppIdentity; logo: { bytes: Uint8Array; mimeType: string } | null }

/** The public slug the request's address names: the host's club label, or the one-club instance's configured club. */
async function requestSlug(): Promise<string | null> {
  const host = requestHost((await headers()).get('host'), process.env)
  if (host.kind === 'club') return host.slug
  if (host.kind === 'single') return homeClubSlug(process.env)
  return null
}

/**
 * The web app identity of the request's address. With `withLogo` the logo file is read too (the icon route); the
 * manifest needs only its id and type. Any failure answers with Vereino's identity, which names no club.
 */
export async function requestWebApp(productName: string, withLogo: boolean): Promise<RequestWebApp> {
  const fallback: RequestWebApp = { identity: vereinoIdentity(productName), logo: null }
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
    const ref = club.logo.source === 'club' ? await site.clubLogo(slug) : null
    let logo: { attachmentId: string; mimeType: string | null; bytes: Uint8Array | null } | null = null
    if (ref?.status === 'ok' && container.hasRegistration('attachmentService')) {
      const file = await container.resolve<AttachmentService>('attachmentService').readScoped({
        attachmentId: ref.value.attachmentId,
        auth: { sub: 'club_core:web-app', tenantId: ref.value.tenantId, orgId: ref.value.organizationId, roles: [] },
        expectedOwner: ref.value.owner,
        expectedAssignment: ref.value.assignment,
        expectedPartitionCode: CLUB_CORE_PARTITION,
        requirePrivatePartition: true,
      })
      logo = {
        attachmentId: ref.value.attachmentId,
        mimeType: file.contentType,
        bytes: withLogo ? new Uint8Array(file.buffer) : null,
      }
    }
    const identity = clubIdentity({ name: club.name, accentColor: club.accent?.color ?? null, logo })
    return {
      identity,
      logo: identity.icon === 'logo' && logo?.bytes ? { bytes: logo.bytes, mimeType: logo.mimeType ?? 'image/png' } : null,
    }
  } catch (error: unknown) {
    logger.warn('The web app identity of the request host could not be read; Vereino is shown', { err: error })
    return fallback
  }
}
