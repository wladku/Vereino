'use client'
// The frame of the `activities` member pages (`/club/calendar`, `/club/occurrences/[id]`; club spec DD-05, *UI
// architecture*; #32): the shared `MemberShell` of `@vereino/ui` with the member navigation, and the loading, error and
// "not linked" states of the member profile. The profile is read over HTTP (`GET /api/people/me`), so `activities`
// imports nothing of `people`; the navigation repeats the `/club` entries `people` shows.
import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { RecordConflictBanner } from '@open-mercato/ui/backend/conflicts'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { Alert } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { MemberShell, type MemberLinkProps } from '@vereino/ui'
import {
  BACKEND_HREF,
  CLUB_CALENDAR_HREF,
  CLUB_HOME_HREF,
  CLUB_PROFILE_HREF,
  hasStaffContext,
  useClubProfile,
  type ClubProfile,
} from './club-client'

function MemberLink({ href, className, children, 'aria-current': ariaCurrent }: MemberLinkProps) {
  return (
    <Link href={href} className={className} aria-current={ariaCurrent}>
      {children}
    </Link>
  )
}

export function ActivitiesClubFrame({ children }: { children: (profile: ClubProfile) => React.ReactNode }) {
  const t = useT()
  const pathname = usePathname()
  const query = useClubProfile()
  const profile = query.data?.status === 'ok' ? query.data.profile : null

  let body: React.ReactNode
  if (!query.data && query.isFetching) {
    body = <LoadingMessage label={t('activities.club.loading')} />
  } else if (!query.data) {
    body = (
      <ErrorMessage
        label={t('activities.club.errors.profile')}
        action={
          <Button type="button" variant="outline" className="min-h-11" onClick={() => void query.refetch()}>
            {t('activities.club.actions.retry')}
          </Button>
        }
      />
    )
  } else if (query.data.status === 'not_linked') {
    body = (
      <Alert status="warning" data-testid="club-not-linked">
        <div className="flex flex-col gap-3">
          <p className="max-w-prose">{t('activities.club.notLinked')}</p>
          <div>
            <Button asChild variant="outline" className="min-h-11">
              <Link href={BACKEND_HREF}>{t('activities.club.nav.backend')}</Link>
            </Button>
          </div>
        </div>
      </Alert>
    )
  } else {
    body = children(query.data.profile)
  }

  const nav = profile
    ? [
        { href: CLUB_HOME_HREF, label: t('activities.club.nav.today'), current: pathname === CLUB_HOME_HREF },
        {
          href: CLUB_CALENDAR_HREF,
          label: t('activities.club.nav.calendar'),
          current: pathname === CLUB_CALENDAR_HREF || pathname.startsWith('/club/occurrences/'),
        },
        { href: CLUB_PROFILE_HREF, label: t('activities.club.nav.profile'), current: pathname === CLUB_PROFILE_HREF },
        ...(hasStaffContext(profile)
          ? [{ href: BACKEND_HREF, label: t('activities.club.nav.backend'), current: false }]
          : []),
      ]
    : []

  return (
    <MemberShell
      brand={{ name: profile?.club.shortName ?? t('activities.club.title'), logoUrl: profile?.club.logoUrl ?? null }}
      nav={nav}
      navLabel={t('activities.club.nav.label')}
      Link={MemberLink}
      banner={<RecordConflictBanner />}
    >
      {body}
    </MemberShell>
  )
}
