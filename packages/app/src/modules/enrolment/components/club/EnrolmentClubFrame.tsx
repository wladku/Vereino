'use client'
// The frame of the `enrolment` member pages (`/club/applications/**`; sign-up form spec *UI architecture*, M-J2, M-J3;
// #799): the shared `MemberShell` of `@vereino/ui` with the member navigation, and the loading, error and "not linked"
// states of the member profile — the same frame as the other modules' member pages. The profile is read over HTTP
// (`GET /api/people/me`), so `enrolment` imports nothing of `people`.
import * as React from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { RecordConflictBanner } from '@open-mercato/ui/backend/conflicts'
import { ErrorMessage } from '@open-mercato/ui/backend/detail'
import { Alert } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useLocale, useLocaleLocked, useT } from '@open-mercato/shared/lib/i18n/context'
import {
  BACKEND_HREF,
  ClubTimeZoneProvider,
  MemberShell,
  MemberSkeleton,
  memberContextStore,
  memberNav,
  memberShellLabels,
  memberSwitchers,
  useMemberContext,
  useMemberNavFeatures,
  type MemberLinkProps,
  type MemberSkeletonShape,
} from '@vereino/ui'
import { useClubProfile, type ClubProfile } from './applications-client'

/** The member's locale (DD-34) through the platform's locale route, the same effect the other member frames run. */
function useMemberLocale(profile: ClubProfile | null) {
  const current = useLocale()
  const locked = useLocaleLocked()
  const router = useRouter()
  const requested = React.useRef<string | null>(null)
  React.useEffect(() => {
    if (!profile || locked || profile.locale === current || requested.current === profile.locale) return
    requested.current = profile.locale
    void apiCall('/api/auth/locale', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ locale: profile.locale }),
    }).then((call) => {
      if (call.ok) router.refresh()
    })
  }, [profile, current, locked, router])
}

function MemberLink({ href, className, children, 'aria-current': ariaCurrent }: MemberLinkProps) {
  return (
    <Link href={href} className={className} aria-current={ariaCurrent}>
      {children}
    </Link>
  )
}

export function EnrolmentClubFrame({
  children,
  skeleton = 'rows',
}: {
  children: (profile: ClubProfile) => React.ReactNode
  skeleton?: MemberSkeletonShape
}) {
  const t = useT()
  const pathname = usePathname()
  const query = useClubProfile()
  const profile = query.data?.status === 'ok' ? query.data.profile : null
  useMemberLocale(profile)

  let body: React.ReactNode
  if (!query.data && query.isFetching) {
    body = <MemberSkeleton shape={skeleton} label={t('enrolment.club.loading')} />
  } else if (!query.data) {
    body = (
      <ErrorMessage
        label={t('enrolment.club.errors.profile')}
        action={
          <Button type="button" variant="outline" className="min-h-11" onClick={() => void query.refetch()}>
            {t('enrolment.club.actions.retry')}
          </Button>
        }
      />
    )
  } else if (query.data.status === 'not_linked') {
    body = (
      <Alert style="light" status="warning" data-testid="club-not-linked">
        <div className="flex flex-col gap-3">
          <p className="max-w-prose">{t('enrolment.club.notLinked')}</p>
          <div>
            <Button asChild variant="outline" className="min-h-11">
              <Link href={BACKEND_HREF}>{t('enrolment.club.nav.backend')}</Link>
            </Button>
          </div>
        </div>
      </Alert>
    )
  } else {
    body = (
      <ClubTimeZoneProvider timeZone={query.data.profile.club.timezone}>
        {children(query.data.profile)}
      </ClubTimeZoneProvider>
    )
  }

  const labels = memberShellLabels(t, 'enrolment.club.nav')
  const [context, setContext] = useMemberContext(profile)
  // The same bar on every member page: one feature check per session, shared by the member frames (#258).
  const features = useMemberNavFeatures(apiCall)
  const nav = profile
    ? memberNav({ pathname, contexts: profile.contexts, labels, paymentsVisible: profile.paymentsVisible, features })
    : null
  const switchers = profile ? memberSwitchers(profile, context, setContext, labels) : []

  return (
    <MemberShell
      brand={{
        name: profile?.club.shortName ?? t('enrolment.club.title'),
        logoUrl: profile?.club.logoUrl ?? null,
        accent: profile?.club.accent ?? null,
      }}
      nav={nav}
      navLabel={labels.nav}
      signOutLabel={labels.signOut}
      onSignOut={memberContextStore.clear}
      switchers={switchers}
      Link={MemberLink}
      banner={<RecordConflictBanner />}
    >
      {body}
    </MemberShell>
  )
}
