'use client'
// The frame of the `/club` member pages (club spec DD-05, *UI architecture*; #27): the club's short name (club content
// in the club's language), the member navigation, and the loading, error and "not linked" states. A signed-in user
// linked to no person sees only the notice and the way to the admin panel — never anyone's data. Once the profile is
// loaded, the interface locale follows the member's (DD-34: preferred → club default → request → en) through the
// platform's own locale route.
import * as React from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { RecordConflictBanner } from '@open-mercato/ui/backend/conflicts'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { Alert } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import { useLocale, useLocaleLocked, useT } from '@open-mercato/shared/lib/i18n/context'
import {
  BACKEND_HREF,
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

function NavLink({ href, label, current }: { href: string; label: string; current: boolean }) {
  return (
    <Link
      href={href}
      aria-current={current ? 'page' : undefined}
      className={
        current
          ? 'text-foreground inline-flex min-h-11 items-center rounded-md px-3 text-sm font-semibold underline underline-offset-4'
          : 'text-muted-foreground hover:text-foreground inline-flex min-h-11 items-center rounded-md px-3 text-sm'
      }
    >
      {label}
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

  return (
    <div className="bg-background text-foreground min-h-svh">
      <header className="bg-card border-b">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-2 px-4 py-2">
          <p className="flex items-center gap-2 text-sm font-semibold" data-testid="club-name">
            {profile?.club.logoUrl ? (
              <Image
                src={profile.club.logoUrl}
                alt=""
                width={32}
                height={32}
                unoptimized
                className="bg-muted size-8 rounded object-contain"
                data-testid="club-logo"
              />
            ) : null}
            <span>{profile?.club.shortName ?? t('people.club.title')}</span>
          </p>
          {profile ? (
            <nav aria-label={t('people.club.nav.label')} className="flex flex-wrap items-center gap-1">
              <NavLink href={CLUB_HOME_HREF} label={t('people.club.nav.today')} current={pathname === CLUB_HOME_HREF} />
              <NavLink
                href={CLUB_PROFILE_HREF}
                label={t('people.club.nav.profile')}
                current={pathname === CLUB_PROFILE_HREF}
              />
              {hasStaffContext(profile) ? (
                <NavLink href={BACKEND_HREF} label={t('people.club.nav.backend')} current={false} />
              ) : null}
            </nav>
          ) : null}
        </div>
      </header>
      <RecordConflictBanner />
      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">{body}</main>
    </div>
  )
}
