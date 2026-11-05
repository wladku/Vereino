'use client'
// The frame of the `communication` member pages (`/club/messages`, `/club/messages/[threadId]`; club spec DD-05, *UI
// architecture*; foundation III REQ-M10): the shared `MemberShell` of `@vereino/ui` with the member navigation and
// the loading, error and "not linked" states of the member profile. The profile is read over HTTP
// (`GET /api/people/me`, the query key `people`'s pages use), so `communication` imports nothing of `people`.
import * as React from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { RecordConflictBanner } from '@open-mercato/ui/backend/conflicts'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { Alert } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useLocale, useLocaleLocked, useT } from '@open-mercato/shared/lib/i18n/context'
import {
  BACKEND_HREF,
  MemberShell,
  memberContextStore,
  memberNav,
  memberShellLabels,
  memberSwitchers,
  useMemberContext,
  type MemberLinkProps,
} from '@vereino/ui'

export type MessagesProfile = {
  person: { id: string; firstName: string; lastName: string }
  /** The active wards of a guardian (the inbox's ward filter, M-06); empty for anyone else. */
  wards: { personId: string; firstName: string; lastName: string }[]
  contexts: string[]
  locale: string
  club: { shortName: string | null; logoUrl: string | null }
}

type ProfileLoad = { status: 'ok'; profile: MessagesProfile } | { status: 'not_linked' }

class ProfileLoadError extends Error {}

/** The query key of `people`'s member pages: the same cache entry, the same `{ status, profile }` shape. */
const MEMBER_PROFILE_QUERY_KEY = ['people-me'] as const

function useMemberProfile() {
  return useQuery({
    queryKey: MEMBER_PROFILE_QUERY_KEY,
    queryFn: async (): Promise<ProfileLoad> => {
      const call = await apiCall<MessagesProfile>('/api/people/me')
      if (call.status === 404) return { status: 'not_linked' }
      if (!call.ok || !call.result) throw new ProfileLoadError(String(call.status))
      return { status: 'ok', profile: call.result }
    },
  })
}

/** The member's locale (DD-34) through the platform's locale route, as `people`'s member frame does. */
function useMemberLocale(profile: MessagesProfile | null) {
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

export function MessagesClubFrame({ children }: { children: (profile: MessagesProfile) => React.ReactNode }) {
  const t = useT()
  const pathname = usePathname()
  const query = useMemberProfile()
  const profile = query.data?.status === 'ok' ? query.data.profile : null
  useMemberLocale(profile)

  let body: React.ReactNode
  if (!query.data && query.isFetching) {
    body = <LoadingMessage label={t('communication.club.loading')} />
  } else if (!query.data) {
    body = (
      <ErrorMessage
        label={t('communication.club.errors.load')}
        action={
          <Button type="button" variant="outline" className="min-h-11" onClick={() => void query.refetch()}>
            {t('communication.actions.retry')}
          </Button>
        }
      />
    )
  } else if (query.data.status === 'not_linked') {
    body = (
      <Alert status="warning" data-testid="club-not-linked">
        <div className="flex flex-col gap-3">
          <p className="max-w-prose">{t('communication.club.notLinked')}</p>
          <div>
            <Button asChild variant="outline" className="min-h-11">
              <Link href={BACKEND_HREF}>{t('communication.club.nav.backend')}</Link>
            </Button>
          </div>
        </div>
      </Alert>
    )
  } else {
    body = children(query.data.profile)
  }

  // The navigation and the switchers appear once the profile is loaded; a user linked to no person sees none of it.
  const labels = memberShellLabels(t, 'communication.club.nav')
  const [context, setContext] = useMemberContext(profile)
  const nav = profile ? memberNav({ pathname, contexts: profile.contexts, labels }) : null
  const switchers = profile ? memberSwitchers(profile, context, setContext, labels) : []

  return (
    <MemberShell
      brand={{ name: profile?.club.shortName ?? t('communication.club.title'), logoUrl: profile?.club.logoUrl ?? null }}
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
