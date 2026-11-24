import { Suspense } from 'react'
import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import LoginPage from '@open-mercato/core/modules/auth/frontend/login'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { SignInClubHeader } from '@/modules/club_core/components/SignInClubHeader'
import { signInTenantRedirect } from '@/modules/club_core/lib/club-host'
import { SIGN_IN_CLUB_COOKIE, signInClub, type SignInClub } from '@/modules/club_core/lib/sign-in-club'
import { requestClub } from '@/modules/club_core/services/request-club'

type LoginRouteProps = { searchParams: Promise<Record<string, string | string[] | undefined>> }

// The sign-in page (M-01; navigation spec REQ-N10, #261) never names the platform: the app catalog overrides its brand
// keys and `public/vereino-mark.svg` (copied into `public/open-mercato.svg`) carries the Vereino mark.
export async function generateMetadata(): Promise<Metadata> {
  const { translate } = await resolveTranslations()
  return { title: { absolute: translate('auth.login.brandName', 'Vereino') } }
}

export default async function LoginRoutePage({ searchParams }: LoginRouteProps) {
  const query = await searchParams
  // On a club's address (many clubs spec phase 3, #631) the form signs in to that club's tenant, and the club above the
  // form is the host's; elsewhere it comes from `?club=` (the public header's "Sign in" link) or the remembered-club
  // cookie, as on a one-club instance.
  const request = await requestClub()
  const tenantRedirect = signInTenantRedirect({ host: request.host, hostClub: request.hostClub, query })
  if (tenantRedirect) redirect(tenantRedirect)
  const club: SignInClub | null =
    request.host.kind === 'club'
      ? { slug: request.host.slug, source: 'host' }
      : signInClub(query.club, (await cookies()).get(SIGN_IN_CLUB_COOKIE)?.value)
  return (
    <div className="flex min-h-svh flex-col">
      <SignInClubHeader club={club} />
      {/* The platform page fills the rest of the screen instead of a whole screen of its own. */}
      <div className="vereino-login-body flex flex-1 flex-col">
        {/* LoginPage reads query params with useSearchParams; keep this boundary so the client-only params hydrate. */}
        <Suspense fallback={null}>
          <LoginPage />
        </Suspense>
      </div>
    </div>
  )
}
