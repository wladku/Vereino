import { redirect } from 'next/navigation'
import { getAuthFromCookies } from '@open-mercato/shared/lib/auth/server'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { homeClubSlug, homeRedirect } from '@/modules/club_core/lib/home-route'
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

// The home route is a pure router: it never renders (#485; owner decision 4 of epic #479). The platform start page is
// no landing any more: a guest goes to the club's public page while it is published, otherwise to the sign-in page; a
// signed-in visitor goes into the app.
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

  redirect(homeRedirect({ authenticated: Boolean(auth), publishedClubSlug: auth ? null : await publishedHomeClubSlug() }))
}
