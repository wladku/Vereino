'use client'
// `/p/[clubSlug]/s/[occurrenceId]` — the public session page (club spec DD-17, J-003 step 2; foundation III DD-M14,
// REQ-M08, J-M02 step 2): the page a share text from the group chat opens without a sign-in. It shows the club's name,
// the activity name, the date, the time and the status of the session, and the way to sign in; never a name, the
// roster or a count. The "send me a link" form arrives with REQ-017 (Q12). Like every public club page it ends with a
// footer holding the club name and its published phone (E06-S07, #89). States: loading, error with retry, 404 without
// any detail.
import * as React from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { LanguageSwitcher } from '@open-mercato/ui/frontend/LanguageSwitcher'
import { Button } from '@open-mercato/ui/primitives/button'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { formatClockTime, formatDayHeading, formatTimeRange } from '@vereino/ui'

type PublicSessionPage = {
  /** `contact` is the club phone, null while the club does not publish the `contact` block. */
  club: { name: string; slug: string; contact: { phone: string } | null }
  session: {
    activityName: string
    occurrenceDate: string
    startAt: string
    gatheringAt: string | null
    endAt: string
    timeZone: string
    status: 'planned' | 'done' | 'cancelled'
  }
}

type PublicSessionLoad = { status: 'ok'; page: PublicSessionPage } | { status: 'not_found' }

const SIGN_IN_HREF = '/login'

function usePublicSession(clubSlug: string, occurrenceId: string) {
  return useQuery({
    queryKey: ['activities-public-session', clubSlug, occurrenceId],
    queryFn: async (): Promise<PublicSessionLoad> => {
      const call = await apiCall<PublicSessionPage>(
        `/api/activities/public/${encodeURIComponent(clubSlug)}/sessions/${encodeURIComponent(occurrenceId)}`,
      )
      if (call.ok && call.result) return { status: 'ok', page: call.result }
      if (call.status === 404) return { status: 'not_found' }
      throw new Error(`[internal] public session request failed with ${String(call.status)}`)
    },
    retry: false,
  })
}

/** The page footer of the public club pages (club_core `PublicFrame`): the club name and the published phone. */
function Footer({ club }: { club: PublicSessionPage['club'] }) {
  const t = useT()
  return (
    <footer className="bg-card border-t" data-testid="public-footer">
      <div className="text-muted-foreground mx-auto flex max-w-3xl flex-col gap-1 px-4 py-4 text-sm sm:flex-row sm:items-center sm:justify-between">
        <span className="text-foreground font-medium" data-testid="public-footer-club">
          {club.name}
        </span>
        {club.contact ? (
          <span data-testid="public-footer-phone">
            {t('activities.publicSession.footer.phone')}{' '}
            <a
              className="text-foreground inline-flex min-h-11 items-center underline underline-offset-4 sm:min-h-6"
              href={`tel:${club.contact.phone.replace(/[^\d+]/g, '')}`}
            >
              {club.contact.phone}
            </a>
          </span>
        ) : null}
      </div>
    </footer>
  )
}

function Frame({
  clubName,
  club = null,
  children,
}: {
  clubName: string | null
  club?: PublicSessionPage['club'] | null
  children: React.ReactNode
}) {
  const t = useT()
  return (
    <div className="bg-background text-foreground min-h-svh">
      <header className="bg-card border-b">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <span className="font-semibold" data-testid="public-session-club">
            {clubName ?? t('activities.publicSession.title')}
          </span>
          <LanguageSwitcher />
        </div>
      </header>
      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">{children}</main>
      {club ? <Footer club={club} /> : null}
    </div>
  )
}

export function PublicSessionView({ clubSlug, occurrenceId }: { clubSlug: string; occurrenceId: string }) {
  const t = useT()
  const locale = useLocale()
  const query = usePublicSession(clubSlug, occurrenceId)
  const load = query.data

  if (!load && query.isFetching) {
    return (
      <Frame clubName={null}>
        <LoadingMessage label={t('activities.publicSession.loading')} />
      </Frame>
    )
  }
  if (!load) {
    return (
      <Frame clubName={null}>
        <ErrorMessage
          label={t('activities.publicSession.errors.load')}
          action={
            <Button type="button" variant="outline" className="min-h-11" onClick={() => void query.refetch()}>
              {t('activities.club.actions.retry')}
            </Button>
          }
        />
      </Frame>
    )
  }
  if (load.status === 'not_found') {
    return (
      <Frame clubName={null}>
        <section className="flex flex-col gap-2" data-testid="public-session-not-found">
          <h1 className="text-2xl font-semibold">{t('activities.publicSession.notFound.title')}</h1>
          <p className="text-muted-foreground max-w-prose">{t('activities.publicSession.notFound.message')}</p>
        </section>
      </Frame>
    )
  }

  const { club, session } = load.page
  const start = new Date(session.startAt)
  const end = new Date(session.endAt)
  const cancelled = session.status === 'cancelled'
  return (
    <Frame clubName={club.name} club={club}>
      <section className="flex flex-col gap-3" aria-labelledby="public-session-title" data-testid="public-session">
        <h1 id="public-session-title" className="text-2xl font-semibold" data-testid="public-session-activity">
          {session.activityName}
        </h1>
        <p className="text-lg" data-testid="public-session-when">
          {formatDayHeading(session.occurrenceDate, locale)} ·{' '}
          {session.gatheringAt ? (
            <>
              <span className="font-semibold" data-testid="public-session-gathering">
                {t('activities.gathering.at', {
                  time: formatClockTime(new Date(session.gatheringAt), locale, session.timeZone),
                })}
              </span>{' '}
              ·{' '}
            </>
          ) : null}
          {formatTimeRange(start, end, locale, session.timeZone)}
        </p>
        <p
          className="flex flex-wrap items-center gap-2"
          data-testid="public-session-status"
          data-status={session.status}
        >
          <span className="text-muted-foreground text-sm">{t('activities.publicSession.status')}</span>
          <StatusBadge variant={cancelled ? 'error' : session.status === 'done' ? 'success' : 'info'}>
            {t(`activities.occurrences.status.${session.status}`)}
          </StatusBadge>
        </p>
      </section>
      <section className="bg-card flex flex-col gap-3 rounded-lg border p-4" aria-labelledby="public-session-signin">
        <h2 id="public-session-signin" className="font-semibold">
          {t('activities.publicSession.signIn.title')}
        </h2>
        <p className="text-muted-foreground max-w-prose text-sm">{t('activities.publicSession.signIn.message')}</p>
        <div>
          <Button asChild className="min-h-11">
            <Link href={SIGN_IN_HREF} data-testid="public-session-sign-in">
              {t('activities.publicSession.signIn.action')}
            </Link>
          </Button>
        </div>
      </section>
    </Frame>
  )
}
