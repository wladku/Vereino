import { Suspense } from 'react'
import type { Metadata } from 'next'
import { cookies } from 'next/headers'
import LoginPage from '@open-mercato/core/modules/auth/frontend/login'
import { resolveTranslations } from '@open-mercato/shared/lib/i18n/server'
import { SignInClubHeader } from '@/modules/club_core/components/SignInClubHeader'
import { SIGN_IN_CLUB_COOKIE, signInClub } from '@/modules/club_core/lib/sign-in-club'

type LoginRouteProps = { searchParams: Promise<Record<string, string | string[] | undefined>> }

// The sign-in page (M-01; navigation spec REQ-N10, #261) never names the platform: the app catalog overrides its brand
// keys and `public/vereino-mark.svg` (copied into `public/open-mercato.svg`) carries the Vereino mark.
export async function generateMetadata(): Promise<Metadata> {
  const { translate } = await resolveTranslations()
  return { title: { absolute: translate('auth.login.brandName', 'Vereino') } }
}

export default async function LoginRoutePage({ searchParams }: LoginRouteProps) {
  // The club above the form comes from `?club=` (the public header's "Sign in" link) or the remembered-club cookie.
  const club = signInClub((await searchParams).club, (await cookies()).get(SIGN_IN_CLUB_COOKIE)?.value)
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
