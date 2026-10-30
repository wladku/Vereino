'use client'
// The frame of the `/club` member pages (club spec DD-05, *UI architecture*; #27): the club's short name (club content
// in the club's language), the member navigation, and the loading, error and "not linked" states. A signed-in user
// linked to no person sees only the notice and the way to the admin panel — never anyone's data. Once the profile is
// loaded, the interface locale follows the member's (DD-34: preferred → club default → request → en) through the
// platform's own locale route. The markup is the shared `MemberShell` of `@vereino/ui` (foundation II P-23); this file
// feeds it the router's link, the translated labels and the profile.
import * as React from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { RecordConflictBanner } from '@open-mercato/ui/backend/conflicts'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { Alert } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import { useLocale, useLocaleLocked, useT } from '@open-mercato/shared/lib/i18n/context'
import { MemberShell, type MemberLinkProps, type MemberNavItem } from '@vereino/ui'
import {
  BACKEND_HREF,
  CLUB_CALENDAR_HREF,
  CLUB_HOME_HREF,
  CLUB_PROFILE_HREF,
  hasStaffContext,
  useMemberProfile,
  type MemberProfile,
} from './member-client'

/** Writes the member's locale into the platform's `locale` cookie once per change, then re-renders the page. */
function useMemberLocale(profile: MemberProfile | null) {
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

/** `next/link` under the shell's link contract (the shell knows no router). */
function MemberLink({ href, className, children, 'aria-current': ariaCurrent }: MemberLinkProps) {
  return (
    <Link href={href} className={className} aria-current={ariaCurrent}>
      {children}
    </Link>
  )
}

export function ClubFrame({ children }: { children: (profile: MemberProfile) => React.ReactNode }) {
  const t = useT()
  const pathname = usePathname()
  const query = useMemberProfile()
  const profile = query.data?.status === 'ok' ? query.data.profile : null
  useMemberLocale(profile)

  let body: React.ReactNode
  if (!query.data && query.isFetching) {
    // The first load and a retry after an error both show the loading state.
    body = <LoadingMessage label={t('people.club.loading')} />
  } else if (!query.data) {
    body = (
      <ErrorMessage
        label={t('people.club.errors.load')}
        action={
          <Button type="button" variant="outline" className="min-h-11" onClick={() => void query.refetch()}>
            {t('people.club.actions.retry')}
          </Button>
        }
      />
    )
  } else if (query.data.status === 'not_linked') {
    body = (
      <Alert status="warning" data-testid="club-not-linked">
        <div className="flex flex-col gap-3">
          <p className="max-w-prose">{t('people.club.notLinked.message')}</p>
          <div>
            <Button asChild variant="outline" className="min-h-11">
              <Link href={BACKEND_HREF}>{t('people.club.notLinked.backend')}</Link>
            </Button>
          </div>
        </div>
      </Alert>
    )
  } else {
    body = children(query.data.profile)
  }

  // The navigation appears once the profile is loaded; a user linked to no person sees none of it.
  const nav: MemberNavItem[] = profile
    ? [
        { href: CLUB_HOME_HREF, label: t('people.club.nav.today'), current: pathname === CLUB_HOME_HREF },
        { href: CLUB_CALENDAR_HREF, label: t('people.club.nav.calendar'), current: pathname === CLUB_CALENDAR_HREF },
        { href: CLUB_PROFILE_HREF, label: t('people.club.nav.profile'), current: pathname === CLUB_PROFILE_HREF },
        ...(hasStaffContext(profile)
          ? [{ href: BACKEND_HREF, label: t('people.club.nav.backend'), current: false }]
          : []),
      ]
    : []

  return (
    <MemberShell
      brand={{ name: profile?.club.shortName ?? t('people.club.title'), logoUrl: profile?.club.logoUrl }}
      nav={nav}
      navLabel={t('people.club.nav.label')}
      Link={MemberLink}
      banner={<RecordConflictBanner />}
    >
      {body}
    </MemberShell>
  )
}
