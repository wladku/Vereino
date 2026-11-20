'use client'
// The frame of the `payments` member pages (`/club/payments`, `/club/payments/return`; M-08, M-09; #110; `/club/cash`,
// M-15, #114): the shared `MemberShell` of `@vereino/ui` with the member navigation of every member page (#258), and the
// loading, error and "not linked" states of the member profile. The profile is read over HTTP (`GET /api/people/me`,
// the query key `people`'s pages use), so `payments` imports nothing of `people`'s components. On a payer page
// (`payerOnly`, the default) a profile without `paymentsVisible` (a minor, R10, or no payer feature) gets no payments
// content: the API refuses it too (403 `payments_minor`). "Accept cash" is a staff page, so it passes `payerOnly={false}`.
import * as React from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { RecordConflictBanner } from '@open-mercato/ui/backend/conflicts'
import { ErrorMessage } from '@open-mercato/ui/backend/detail'
import { Alert } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useLocale, useLocaleLocked, useT } from '@open-mercato/shared/lib/i18n/context'
import {
  BACKEND_HREF,
  CLUB_HOME_HREF,
  ClubTimeZoneProvider,
  MemberShell,
  memberContextStore,
  memberNav,
  memberShellLabels,
  memberSwitchers,
  useMemberContext,
  useMemberNavFeatures,
  MemberSkeleton,
  type MemberLinkProps,
  type MemberSkeletonShape,
} from '@vereino/ui'

export const CLUB_PAYMENTS_HREF = '/club/payments'

export type PaymentsProfile = {
  person: { id: string; firstName: string; lastName: string }
  wards: { personId: string; firstName: string; lastName: string }[]
  contexts: string[]
  locale: string
  paymentsVisible: boolean
  /** An active participant membership today: with the wards, the member side of the acting context (spec N). */
  isParticipant?: boolean
  club: {
    shortName: string | null
    timezone: string
    logoUrl: string | null
    accent?: { color: string; foreground: '#000000' | '#ffffff' } | null
  }
}

type ProfileLoad = { status: 'ok'; profile: PaymentsProfile } | { status: 'not_linked' }

class ProfileLoadError extends Error {}

/** The query key of `people`'s member pages: the same cache entry, the same `{ status, profile }` shape. */
const MEMBER_PROFILE_QUERY_KEY = ['people-me'] as const

function useMemberProfile() {
  return useQuery({
    queryKey: MEMBER_PROFILE_QUERY_KEY,
    queryFn: async (): Promise<ProfileLoad> => {
      const call = await apiCall<PaymentsProfile>('/api/people/me')
      if (call.status === 404) return { status: 'not_linked' }
      if (!call.ok || !call.result) throw new ProfileLoadError(String(call.status))
      return { status: 'ok', profile: call.result }
    },
  })
}

/** The member's locale (DD-34) through the platform's locale route, as `people`'s member frame does. */
function useMemberLocale(profile: PaymentsProfile | null) {
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

export function PaymentsClubFrame({
  children,
  payerOnly = true,
  skeleton = 'rows',
}: {
  children: (profile: PaymentsProfile) => React.ReactNode
  payerOnly?: boolean
  /** The shape of the page's content while the profile loads (REQ-N15): `fields` on a form, `tiles` on cards. */
  skeleton?: MemberSkeletonShape
}) {
  const t = useT()
  const pathname = usePathname()
  const query = useMemberProfile()
  const profile = query.data?.status === 'ok' ? query.data.profile : null
  useMemberLocale(profile)

  let body: React.ReactNode
  if (!query.data && query.isFetching) {
    body = <MemberSkeleton shape={skeleton} label={t('payments.club.loading')} />
  } else if (!query.data) {
    body = (
      <ErrorMessage
        label={t('payments.club.errors.load')}
        action={
          <Button type="button" variant="outline" className="min-h-11" onClick={() => void query.refetch()}>
            {t('payments.club.retry')}
          </Button>
        }
      />
    )
  } else if (query.data.status === 'not_linked') {
    body = (
      <Alert status="warning" data-testid="club-not-linked">
        <div className="flex flex-col gap-3">
          <p className="max-w-prose">{t('payments.club.notLinked')}</p>
          <div>
            <Button asChild variant="outline" className="min-h-11">
              <Link href={BACKEND_HREF}>{t('payments.club.nav.backend')}</Link>
            </Button>
          </div>
        </div>
      </Alert>
    )
  } else if (payerOnly && !query.data.profile.paymentsVisible) {
    body = (
      <Alert status="information" data-testid="club-payments-unavailable">
        <div className="flex flex-col gap-3">
          <p className="max-w-prose">{t('payments.club.unavailable')}</p>
          <div>
            <Button asChild variant="outline" className="min-h-11">
              <Link href={CLUB_HOME_HREF}>{t('payments.club.nav.today')}</Link>
            </Button>
          </div>
        </div>
      </Alert>
    )
  } else {
    // The club zone of the profile decides "today" on the page (#231), e.g. the date a cash payment proposes.
    body = (
      <ClubTimeZoneProvider timeZone={query.data.profile.club.timezone}>
        {children(query.data.profile)}
      </ClubTimeZoneProvider>
    )
  }

  // The navigation and the switchers appear once the profile is loaded; a user linked to no person sees none of it.
  const labels = memberShellLabels(t, 'payments.club.nav')
  const [context, setContext] = useMemberContext(profile)
  // The same bar on every member page: one feature check per session, shared by the five frames (#258).
  const features = useMemberNavFeatures(apiCall)
  const nav = profile
    ? memberNav({ pathname, contexts: profile.contexts, labels, paymentsVisible: profile.paymentsVisible, features })
    : null
  const switchers = profile ? memberSwitchers(profile, context, setContext, labels) : []

  return (
    <MemberShell
      brand={{
        name: profile?.club.shortName ?? t('payments.club.title'),
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
