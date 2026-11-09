'use client'
// `/club/link` — the personal link request (club spec REQ-017; UX concept M-13, F-06): a parent coming from the
// session link in the group chat sees the session without any personal data, enters an address and gets "Send me a
// link". The answer is always the same neutral line ("If the address is registered with the club, we have sent a
// link"), whether or not the address is known; 429 asks to try again in a moment. The club and the session come from
// the query (`?club=<slug>&session=<id>`, built by the public session page); without them the page explains where the
// request starts. A session that has started or is no longer planned shows "Declarations closed" instead of the form:
// a request then sends nothing (#192). States: loading, the form, sending (spinner), sent, invalid address,
// rate-limited, closed, error.
import * as React from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { LanguageSwitcher } from '@open-mercato/ui/frontend/LanguageSwitcher'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { formatDayHeading, formatTimeRange } from '@vereino/ui'
import { linkRequestOpen } from '../../lib/declaration-links'

type PublicSession = {
  club: { name: string }
  session: {
    activityName: string
    occurrenceDate: string
    startAt: string
    endAt: string
    timeZone: string
    status: 'planned' | 'done' | 'cancelled'
  }
}

type SendState = 'idle' | 'sending' | 'sent' | 'invalid' | 'rate_limited' | 'error'

const SIGN_IN_HREF = '/login'
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function usePublicSession(clubSlug: string, occurrenceId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['activities-link-request-session', clubSlug, occurrenceId],
    enabled,
    queryFn: async (): Promise<PublicSession | null> => {
      const call = await apiCall<PublicSession>(
        `/api/activities/public/${encodeURIComponent(clubSlug)}/sessions/${encodeURIComponent(occurrenceId)}`,
      )
      if (call.ok && call.result) return call.result
      if (call.status === 404) return null
      throw new Error(`[internal] public session request failed with ${String(call.status)}`)
    },
    retry: false,
  })
}

function Frame({ clubName, children }: { clubName: string | null; children: React.ReactNode }) {
  const t = useT()
  return (
    <div className="bg-background text-foreground min-h-svh">
      <header className="bg-card border-b">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <span className="font-semibold" data-testid="link-request-club">
            {clubName ?? t('activities.linkRequest.title')}
          </span>
          <LanguageSwitcher />
        </div>
      </header>
      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">{children}</main>
    </div>
  )
}

function SignIn() {
  const t = useT()
  return (
    <p className="text-sm">
      <Link href={SIGN_IN_HREF} className="underline underline-offset-4" data-testid="link-request-sign-in">
        {t('activities.linkRequest.signIn')}
      </Link>
    </p>
  )
}

export function DeclarationLinkRequestView() {
  const t = useT()
  const locale = useLocale()
  const search = useSearchParams()
  const clubSlug = search.get('club')?.trim() ?? ''
  const occurrenceId = search.get('session')?.trim() ?? ''
  const targeted = clubSlug.length > 0 && UUID_PATTERN.test(occurrenceId)
  const query = usePublicSession(clubSlug, occurrenceId, targeted)
  const [email, setEmail] = React.useState('')
  const [state, setState] = React.useState<SendState>('idle')

  const submit = async (event: React.SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (state === 'sending') return
    setState('sending')
    try {
      const call = await apiCall('/api/activities/declaration-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), clubSlug, occurrencePublicRef: occurrenceId }),
      })
      if (call.status === 202) setState('sent')
      else if (call.status === 429) setState('rate_limited')
      else if (call.status === 400) setState('invalid')
      else setState('error')
    } catch {
      setState('error')
    }
  }

  if (!targeted || query.data === null) {
    return (
      <Frame clubName={null}>
        <section className="flex flex-col gap-3" data-testid="link-request-untargeted">
          <h1 className="text-2xl font-semibold">{t('activities.linkRequest.untargeted.title')}</h1>
          <p className="text-muted-foreground max-w-prose">{t('activities.linkRequest.untargeted.message')}</p>
          <SignIn />
        </section>
      </Frame>
    )
  }
  if (query.isPending) {
    return (
      <Frame clubName={null}>
        <p role="status" className="text-muted-foreground">
          {t('activities.linkRequest.loading')}
        </p>
      </Frame>
    )
  }
  if (query.isError) {
    return (
      <Frame clubName={null}>
        <section role="alert" className="flex flex-col gap-3">
          <p>{t('activities.linkRequest.errors.load')}</p>
          <div>
            <Button type="button" variant="outline" className="min-h-11" onClick={() => void query.refetch()}>
              {t('activities.club.actions.retry')}
            </Button>
          </div>
        </section>
      </Frame>
    )
  }

  const { club, session } = query.data
  const feedback: Record<Exclude<SendState, 'idle' | 'sending'>, { text: string; alert: boolean }> = {
    sent: { text: t('activities.linkRequest.sent'), alert: false },
    invalid: { text: t('activities.linkRequest.errors.invalid'), alert: true },
    rate_limited: { text: t('activities.linkRequest.errors.rateLimited'), alert: true },
    error: { text: t('activities.linkRequest.errors.send'), alert: true },
  }
  const shown = state === 'idle' || state === 'sending' ? null : feedback[state]
  const heading = (
    <section className="flex flex-col gap-2" aria-labelledby="link-request-session" data-testid="link-request-session">
      <h1 id="link-request-session" className="text-2xl font-semibold">
        {session.activityName}
      </h1>
      <p className="text-lg" data-testid="link-request-when">
        {formatDayHeading(session.occurrenceDate, locale)} ·{' '}
        {formatTimeRange(new Date(session.startAt), new Date(session.endAt), locale, session.timeZone)}
      </p>
    </section>
  )
  if (!linkRequestOpen(session, new Date())) {
    return (
      <Frame clubName={club.name}>
        {heading}
        <section className="flex flex-col gap-2" role="status" data-testid="link-request-closed">
          <h2 className="font-semibold">{t('activities.linkRequest.closed.title')}</h2>
          <p className="text-muted-foreground max-w-prose">{t('activities.linkRequest.closed.message')}</p>
        </section>
        <SignIn />
      </Frame>
    )
  }
  return (
    <Frame clubName={club.name}>
      {heading}
      <section className="bg-card flex flex-col gap-4 rounded-lg border p-4" aria-labelledby="link-request-form-title">
        <h2 id="link-request-form-title" className="font-semibold">
          {t('activities.linkRequest.form.title')}
        </h2>
        <p className="text-muted-foreground max-w-prose text-sm" id="link-request-hint">
          {t('activities.linkRequest.form.hint')}
        </p>
        <form className="flex flex-col gap-3" onSubmit={(event) => void submit(event)} noValidate={false}>
          <div className="flex flex-col gap-1">
            <Label htmlFor="link-request-email">{t('activities.linkRequest.form.email')}</Label>
            <Input
              id="link-request-email"
              type="email"
              autoComplete="email"
              inputMode="email"
              required
              maxLength={254}
              value={email}
              onChange={(event) => {
                setEmail(event.target.value)
              }}
              aria-describedby="link-request-hint link-request-feedback"
              aria-invalid={state === 'invalid' ? true : undefined}
              className="min-h-11"
              data-testid="link-request-email"
            />
          </div>
          <div>
            <Button
              type="submit"
              className="min-h-11"
              disabled={state === 'sending'}
              aria-busy={state === 'sending' ? true : undefined}
              data-testid="link-request-submit"
            >
              {state === 'sending' ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              {t('activities.linkRequest.form.submit')}
            </Button>
          </div>
          <p
            id="link-request-feedback"
            role={shown?.alert ? 'alert' : 'status'}
            aria-live="polite"
            className={shown?.alert ? 'text-destructive text-sm' : 'text-sm'}
            data-testid="link-request-feedback"
            data-state={state}
          >
            {shown?.text ?? ''}
          </p>
        </form>
      </section>
      <SignIn />
    </Frame>
  )
}
