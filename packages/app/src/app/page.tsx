import { notFound, redirect } from 'next/navigation'
import { getAuthFromCookies } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { ClubLanding } from '@/modules/club_core/components/ClubLanding'
import { clubHostHome } from '@/modules/club_core/lib/club-host'
import { homeClubSlug, homeRedirect } from '@/modules/club_core/lib/home-route'
import { requestClub, sessionRedirectForHost } from '@/modules/club_core/services/request-club'
import type { ClubCorePublicSite } from '@/modules/club_core/services/public-site'

function isAutoLoginEnabled(): boolean {
  return Boolean(process.env.OM_AUTOLOGIN_EMAIL?.trim() && process.env.OM_AUTOLOGIN_PASSWORD)
}

/**
 * The configured club (`VEREINO_HOME_CLUB_SLUG`) when its public page is published, read through the approved public
 * slug lookup of `clubCorePublicSite`; null otherwise, and on any failure, so `/` still reaches the sign-in page.
 */
async function publishedHomeClubSlug(): Promise<string | null> {
  const slug = homeClubSlug(process.env)
  if (!slug) return null
  try {
    const { bootstrap } = await import('@/bootstrap')
    bootstrap()
    const container = await createRequestContainer()
    if (!container.hasRegistration('clubCorePublicSite')) return null
    const frame = await container.resolve<ClubCorePublicSite>('clubCorePublicSite').clubFrame(slug)
    return frame.status === 'ok' ? slug : null
  } catch {
    return null
  }
}

// The home route (#485; owner decision 4 of epic #479). On a one-club instance it is a pure router: a guest goes to the
// club's public page while it is published, otherwise to the sign-in page; a signed-in visitor goes into the app. With
// `VEREINO_CLUB_DOMAIN` set (many clubs spec phase 3, DD-M02; #631) the request's host picks the club: a club's address
// routes the same way for that club, the instance's own address shows the neutral landing page to a guest, and an
// unknown host or a label that names no club is not found. A session of another club goes to its own club's address.
export default async function Home() {
  const auth = await getAuthFromCookies()

  // Demo autologin: when OM_AUTOLOGIN_* credentials are configured and there is
  // no active session, hand off to the autologin route which signs the visitor
  // in and drops them into the app. Fully gated behind env vars — with them
  // unset, behavior below is unchanged. The route falls back to /login when the
  // credentials are invalid, so a misconfigured demo can never loop.
  if (!auth && isAutoLoginEnabled()) {
    redirect('/api/auth/autologin')
  }

  const request = await requestClub()
  if (request.host.kind === 'single') {
    redirect(homeRedirect({ authenticated: Boolean(auth), publishedClubSlug: auth ? null : await publishedHomeClubSlug() }))
  }
  const elsewhere = await sessionRedirectForHost(request, auth, '/backend')
  if (elsewhere) redirect(elsewhere)
  const outcome = clubHostHome({ host: request.host, authenticated: Boolean(auth), hostClub: request.hostClub })
  if (outcome.kind === 'not_found') notFound()
  if (outcome.kind === 'redirect') redirect(outcome.to)
  return <ClubLanding />
}
