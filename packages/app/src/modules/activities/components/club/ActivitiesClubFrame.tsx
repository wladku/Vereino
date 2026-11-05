'use client'
// The frame of the `activities` member pages (`/club/calendar`, `/club/occurrences/[id]`; club spec DD-05, *UI
// architecture*; #32): the shared `MemberShell` of `@vereino/ui` with the member navigation, and the loading, error and
// "not linked" states of the member profile. The profile is read over HTTP (`GET /api/people/me`), so `activities`
// imports nothing of `people`; the navigation is the shared `memberNav` of `@vereino/ui` (E06-S19 #101).
import * as React from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { RecordConflictBanner } from '@open-mercato/ui/backend/conflicts'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { Alert } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useLocale, useLocaleLocked, useT } from '@open-mercato/shared/lib/i18n/context'
import {
  MemberShell,
  memberContextStore,
  memberNav,
  memberShellLabels,
  memberSwitchers,
  useMemberContext,
  type MemberLinkProps,
} from '@vereino/ui'
import { BACKEND_HREF, useClubProfile, type ClubProfile } from './club-client'

/**
 * The member's locale (DD-34: preferred → club default → request → en) through the platform's locale route, the same
 * effect `people`'s member frame runs — a member who opens a session from a notification link sees their language.
 */
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

export function ActivitiesClubFrame({ children }: { children: (profile: ClubProfile) => React.ReactNode }) {
  const t = useT()
  const pathname = usePathname()
  const query = useClubProfile()
  const profile = query.data?.status === 'ok' ? query.data.profile : null
  useMemberLocale(profile)

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

  // The navigation and the switchers appear once the profile is loaded; a user linked to no person sees none of it.
  const labels = memberShellLabels(t, 'activities.club.nav')
  const [context, setContext] = useMemberContext(profile)
  const nav = profile ? memberNav({ pathname, contexts: profile.contexts, labels }) : null
  const switchers = profile ? memberSwitchers(profile, context, setContext, labels) : []

  return (
    <MemberShell
      brand={{ name: profile?.club.shortName ?? t('activities.club.title'), logoUrl: profile?.club.logoUrl ?? null }}
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
