'use client'
// `/club/d/[token]` — the declaration from a personal link (club spec REQ-017, AC-017; foundation P-19 `TokenPageShell`
// and `DeclarationControls`; UX concept M-14, F-06): without signing in, the link's holder sees the session and the
// persons they may declare for in it (their children in the group, themself when they take part) with the controls of
// the session's kind — "Report absence" and its undo for an `absence_only` session (a training), "Attending / Not
// attending" for a `confirm` one — and "Sign in to see the full calendar". A started, cancelled or done session shows
// "Declarations closed". States: loading, 410 "Link expired — request a new one", 404 "Invalid link", error with
// retry, saving per person, "Saved", 409 (closed meanwhile).
import * as React from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { LanguageSwitcher } from '@open-mercato/ui/frontend/LanguageSwitcher'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import {
  DeclarationControls,
  TokenPageShell,
  formatDayHeading,
  formatTimeRange,
  type DeclarationControlsLabels,
  type DeclaredValue,
  type MemberLinkProps,
  type TokenPageState,
} from '@vereino/ui'

type LinkPerson = { id: string; firstName: string; declared: DeclaredValue }

type LinkPage = {
  club: { name: string }
  session: {
    activityName: string
    occurrenceDate: string
    startAt: string
    endAt: string
    timeZone: string
    status: 'planned' | 'done' | 'cancelled'
    kind: 'absence_only' | 'confirm'
    window: 'open' | 'closed' | 'not_planned'
  }
  persons: LinkPerson[]
}

type LinkLoad = { status: 'ok'; page: LinkPage } | { status: 'expired' } | { status: 'not_found' }

const SIGN_IN_HREF = '/login'
const REQUEST_LINK_HREF = '/club/link'

function RouterLink(props: MemberLinkProps) {
  return (
    <Link href={props.href} className={props.className} aria-current={props['aria-current']}>
      {props.children}
    </Link>
  )
}

function linkUrl(token: string): string {
  return `/api/activities/declaration-links/${encodeURIComponent(token)}`
}

function useDeclarationLink(token: string) {
  return useQuery({
    queryKey: ['activities-declaration-link', token],
    queryFn: async (): Promise<LinkLoad> => {
      const call = await apiCall<LinkPage>(linkUrl(token))
      if (call.ok && call.result) return { status: 'ok', page: call.result }
      if (call.status === 410) return { status: 'expired' }
      if (call.status === 404) return { status: 'not_found' }
      throw new Error(`[internal] declaration link request failed with ${String(call.status)}`)
    },
    retry: false,
  })
}

type PersonState = { declared: DeclaredValue; busy: boolean; error: string | null; saved: boolean }

const IDLE: PersonState = { declared: 'unknown', busy: false, error: null, saved: false }

export function DeclarationLinkView({ token }: { token: string }) {
  const t = useT()
  const locale = useLocale()
  const query = useDeclarationLink(token)
  const [people, setPeople] = React.useState<Partial<Record<string, PersonState>>>({})
  const [expired, setExpired] = React.useState(false)
  const load = query.data

  const labels: DeclarationControlsLabels = {
    attending: t('activities.declarationLink.attending'),
    notAttending: t('activities.declarationLink.notAttending'),
    reportAbsence: t('activities.declarationLink.reportAbsence'),
    undoAbsence: t('activities.declarationLink.undoAbsence'),
    expected: t('activities.declarationLink.expected'),
    absent: t('activities.declarationLink.absent'),
    noAnswer: t('activities.declarationLink.noAnswer'),
  }

  const declare = async (person: LinkPerson, declared: DeclaredValue) => {
    const personId = person.id
    setPeople((current) => ({
      ...current,
      [personId]: { declared: current[personId]?.declared ?? person.declared, busy: true, error: null, saved: false },
    }))
    let next: Partial<PersonState> = { busy: false }
    try {
      const call = await apiCall<{ declared: DeclaredValue; code?: string }>(linkUrl(token), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personId, declared }),
      })
      if (call.ok && call.result) next = { busy: false, declared: call.result.declared, saved: true }
      else if (call.status === 410) setExpired(true)
      else if (call.status === 409) next = { busy: false, error: t('activities.declarationLink.errors.closed') }
      else if (call.status === 403) next = { busy: false, error: t('activities.declarationLink.errors.forbidden') }
      else next = { busy: false, error: t('activities.declarationLink.errors.save') }
    } catch {
      next = { busy: false, error: t('activities.declarationLink.errors.save') }
    }
    setPeople((current) => ({ ...current, [personId]: { ...(current[personId] ?? IDLE), ...next } }))
  }

  const state: TokenPageState = expired ? 'expired' : load ? load.status : query.isError ? 'error' : 'loading'
  const page = load?.status === 'ok' ? load.page : null
  const shellLabels = {
    title: t('activities.declarationLink.title'),
    loading: t('activities.declarationLink.loading'),
    expiredTitle: t('activities.declarationLink.expired.title'),
    expiredMessage: t('activities.declarationLink.expired.message'),
    notFoundTitle: t('activities.declarationLink.notFound.title'),
    notFoundMessage: t('activities.declarationLink.notFound.message'),
    errorMessage: t('activities.declarationLink.errors.load'),
    retry: t('activities.club.actions.retry'),
    requestLink: t('activities.declarationLink.requestLink'),
  }

  return (
    <TokenPageShell
      state={state}
      clubName={page?.club.name ?? null}
      labels={shellLabels}
      requestLinkHref={REQUEST_LINK_HREF}
      Link={RouterLink}
      onRetry={() => void query.refetch()}
      headerEnd={<LanguageSwitcher />}
    >
      {page ? (
        <>
          <section className="flex flex-col gap-2" aria-labelledby="declaration-link-session">
            <h1
              id="declaration-link-session"
              className="text-2xl font-semibold"
              data-testid="declaration-link-activity"
            >
              {page.session.activityName}
            </h1>
            <p className="text-lg" data-testid="declaration-link-when">
              {formatDayHeading(page.session.occurrenceDate, locale)} ·{' '}
              {formatTimeRange(
                new Date(page.session.startAt),
                new Date(page.session.endAt),
                locale,
                page.session.timeZone,
              )}
            </p>
            {page.session.window !== 'open' ? (
              <p className="font-medium" role="status" data-testid="declaration-link-closed">
                {page.session.status === 'cancelled'
                  ? t('activities.declarationLink.cancelled')
                  : t('activities.declarationLink.closed')}
              </p>
            ) : page.session.kind === 'absence_only' ? (
              <p className="text-muted-foreground max-w-prose text-sm" data-testid="declaration-link-expected-hint">
                {t('activities.declarationLink.expectedHint')}
              </p>
            ) : null}
          </section>
          <section className="flex flex-col gap-4" aria-labelledby="declaration-link-persons">
            <h2 id="declaration-link-persons" className="font-semibold">
              {t('activities.declarationLink.persons')}
            </h2>
            {page.persons.length === 0 ? (
              <p className="text-muted-foreground" data-testid="declaration-link-empty">
                {t('activities.declarationLink.empty')}
              </p>
            ) : (
              <ul className="flex flex-col gap-4">
                {page.persons.map((person) => {
                  const current = people[person.id]
                  return (
                    <li
                      key={person.id}
                      className="bg-card rounded-lg border p-4"
                      data-testid="declaration-link-person"
                      data-person-id={person.id}
                    >
                      <DeclarationControls
                        id={`declaration-${person.id}`}
                        name={person.firstName}
                        kind={page.session.kind}
                        declared={current?.declared ?? person.declared}
                        labels={labels}
                        busy={current?.busy === true}
                        disabled={page.session.window !== 'open'}
                        error={current?.error ?? null}
                        onDeclare={(value) => void declare(person, value)}
                      />
                      {current?.saved ? (
                        <p className="mt-2 text-sm" role="status" data-testid="declaration-link-saved">
                          {t('activities.declarationLink.saved')}
                        </p>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
          <p className="text-sm">
            <Link href={SIGN_IN_HREF} className="underline underline-offset-4" data-testid="declaration-link-sign-in">
              {t('activities.declarationLink.signIn')}
            </Link>
          </p>
        </>
      ) : null}
    </TokenPageShell>
  )
}
