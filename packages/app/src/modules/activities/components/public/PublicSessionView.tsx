'use client'
// `/p/[clubSlug]/s/[occurrenceId]` — the public session page (club spec DD-17, J-003 step 2; foundation III DD-M14,
// REQ-M08, J-M02 step 2): the page a share text from the group chat opens without a sign-in. It shows the club's name,
// the activity name, the date, the time and the status of the session, and the way to sign in; never a name, the
// roster or a count. A planned session that has not started also offers "Send me a link" (`/club/link`, REQ-017, M-13)
// for a guardian without an account — after the start a request sends nothing, so the page does not offer it (#192).
// Like every public club page it ends with a footer holding the club name, its published phone (E06-S07, #89) and the
// club's rules and privacy-policy links (#195), and starts with the public header of `@vereino/ui` (Club · Sections ·
// Facilities · Events · Sign in; navigation spec REQ-N09, #261). States: loading, error with retry, 404 without any
// detail.
import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { ErrorMessage } from '@open-mercato/ui/backend/detail'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { LanguageSwitcher } from '@open-mercato/ui/frontend/LanguageSwitcher'
import { Button } from '@open-mercato/ui/primitives/button'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import {
  formatClockTime,
  formatDayHeading,
  formatTimeRange,
  MemberSkeleton,
  privacyPolicyHref,
  PublicHeader,
  StatusTag,
} from '@vereino/ui'
import { linkRequestOpen, linkRequestPath } from '../../lib/declaration-links'

type PublicSessionPage = {
  /**
   * `contact` is the club phone, null while the club does not publish the `contact` block; `links` are the club's rules
   * and privacy policy, each null while not set (#195); `nav` says which optional header links the club publishes (#261).
   */
  club: {
    name: string
    slug: string
    logo: { url: string | null; source: 'section' | 'club' | 'initial'; initial: string }
    contact: { phone: string } | null
    links: { rules: string | null; privacyPolicy: string | null }
    nav: { facilities: boolean; events: boolean }
  }
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

/**
 * The page footer of the public club pages (club_core `PublicFrame`): the club name, the published phone and the club's
 * rules link (#195) and the privacy-policy link, which leads to the default notice while the club set no address of
 * its own (E19-S03, #469).
 */
function Footer({ club }: { club: PublicSessionPage['club'] }) {
  const t = useT()
  const privacy = privacyPolicyHref(club.slug, club.links.privacyPolicy)
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
        <nav aria-label={t('activities.publicSession.footer.links')} data-testid="public-footer-links">
          <ul className="flex flex-wrap gap-x-4">
            {club.links.rules ? (
              <li>
                <a
                  className="text-foreground inline-flex min-h-11 items-center underline underline-offset-4 sm:min-h-6"
                  href={club.links.rules}
                  rel="noopener noreferrer"
                  data-testid="public-footer-rules"
                >
                  {t('activities.publicSession.footer.rules')}
                </a>
              </li>
            ) : null}
            <li>
              <a
                className="text-foreground inline-flex min-h-11 items-center underline underline-offset-4 sm:min-h-6"
                href={privacy.href}
                rel="noopener noreferrer"
                data-testid="public-footer-privacy"
                data-source={privacy.source}
              >
                {t('activities.publicSession.footer.privacyPolicy')}
              </a>
            </li>
          </ul>
        </nav>
      </div>
    </footer>
  )
}

function Frame({ club = null, children }: { club?: PublicSessionPage['club'] | null; children: React.ReactNode }) {
  const t = useT()
  const pathname = usePathname()
  return (
    <div className="bg-background text-foreground min-h-svh">
      <PublicHeader
        club={club}
        title={t('activities.publicSession.title')}
        labels={{
          nav: t('activities.publicSession.nav.label'),
          club: t('activities.publicSession.nav.club'),
          sections: t('activities.publicSession.nav.sections'),
          facilities: t('activities.publicSession.nav.facilities'),
          events: t('activities.publicSession.nav.events'),
          signIn: t('activities.publicSession.nav.signIn'),
        }}
        pathname={pathname}
        Link={Link}
        headerEnd={<LanguageSwitcher />}
      />
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
      <Frame>
        <MemberSkeleton shape="rows" label={t('activities.publicSession.loading')} />
      </Frame>
    )
  }
  if (!load) {
    return (
      <Frame>
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
      <Frame>
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
    <Frame club={club}>
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
          <StatusTag status={cancelled ? 'canceled' : session.status === 'done' ? 'success' : 'info'}>
            {t(`activities.occurrences.status.${session.status}`)}
          </StatusTag>
        </p>
      </section>
      {linkRequestOpen(session, new Date()) ? (
        <section className="bg-card flex flex-col gap-3 rounded-lg border p-4" aria-labelledby="public-session-link">
          <h2 id="public-session-link" className="font-semibold">
            {t('activities.publicSession.link.title')}
          </h2>
          <p className="text-muted-foreground max-w-prose text-sm">{t('activities.publicSession.link.message')}</p>
          <div>
            <Button asChild variant="outline" className="min-h-11">
              <Link href={linkRequestPath(club.slug, occurrenceId)} data-testid="public-session-request-link">
                {t('activities.publicSession.link.action')}
              </Link>
            </Button>
          </div>
        </section>
      ) : null}
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
