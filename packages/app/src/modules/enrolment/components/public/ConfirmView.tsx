'use client'
// `/p/[clubSlug]/applications/confirm/[token]` — "Confirm your application" (sign-up form spec P-J3, DD-J06, DD-J09,
// J-J01; #799): the link from the confirmation e-mail. Opening the page spends nothing — mail scanners open links — the
// applicant presses "Confirm my application", which posts the token in the body. Results: confirmed ("we will answer
// within {n} days", and the number on the waiting list of a full group), already confirmed (410 used: the status link
// is in the e-mail), the link expired (410: apply again). The token is never rendered or logged; the server sends this
// path with `Referrer-Policy: no-referrer`.
import * as React from 'react'
import Link from 'next/link'
import { ErrorMessage } from '@open-mercato/ui/backend/detail'
import { Alert, AlertDescription, AlertTitle } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { PublicEnrolmentFrame, tooManyText } from './PublicEnrolmentFrame'
import { clubHref, confirmApplication, usePublicClub, type ConfirmOutcome } from './public-client'

const LINK_CLASS = 'inline-flex min-h-11 items-center underline underline-offset-4 sm:min-h-6'

type State = { status: 'idle' } | { status: 'pending' } | ConfirmOutcome | { status: 'network' }

export function ConfirmView({ clubSlug, token }: { clubSlug: string; token: string }) {
  const t = useT()
  const club = usePublicClub(clubSlug)
  const [state, setState] = React.useState<State>(() => (token ? { status: 'idle' } : { status: 'expired' }))

  const confirm = async () => {
    setState({ status: 'pending' })
    try {
      setState(await confirmApplication(clubSlug, token))
    } catch {
      setState({ status: 'network' })
    }
  }

  const clubLink = (
    <p>
      <Link href={clubHref(clubSlug)} className={LINK_CLASS} data-testid="enrolment-club-link">
        {t('enrolment.public.confirm.clubPage')}
      </Link>
    </p>
  )

  let body: React.ReactNode
  if (state.status === 'idle' || state.status === 'pending') {
    body = (
      <>
        <p className="text-muted-foreground max-w-prose">{t('enrolment.public.confirm.intro')}</p>
        <p>
          <Button
            type="button"
            className="min-h-11"
            disabled={state.status === 'pending'}
            data-testid="enrolment-confirm"
            onClick={() => void confirm()}
          >
            {state.status === 'pending'
              ? t('enrolment.public.confirm.confirming')
              : t('enrolment.public.confirm.button')}
          </Button>
        </p>
      </>
    )
  } else if (state.status === 'confirmed') {
    body = (
      <>
        <Alert style="light" status="success" data-testid="enrolment-confirmed" data-state={state.state}>
          <AlertTitle>{t('enrolment.public.confirm.confirmed.title')}</AlertTitle>
          <AlertDescription>
            {t('enrolment.public.confirm.confirmed.text', { days: state.answerDays })}
          </AlertDescription>
        </Alert>
        {state.state === 'waiting' && state.waitingNumber !== null ? (
          <p className="font-medium" data-testid="enrolment-waiting-number" data-number={state.waitingNumber}>
            {t('enrolment.public.confirm.waiting', { number: state.waitingNumber })}
          </p>
        ) : null}
        <p className="text-muted-foreground max-w-prose text-sm">{t('enrolment.public.confirm.statusLink')}</p>
        {clubLink}
      </>
    )
  } else if (state.status === 'used') {
    body = (
      <>
        <Alert style="light" status="information" data-testid="enrolment-confirm-used">
          <AlertTitle>{t('enrolment.public.confirm.used.title')}</AlertTitle>
          <AlertDescription>{t('enrolment.public.confirm.used.text')}</AlertDescription>
        </Alert>
        {clubLink}
      </>
    )
  } else if (state.status === 'expired') {
    body = (
      <>
        <Alert style="light" status="warning" data-testid="enrolment-confirm-expired">
          <AlertTitle>{t('enrolment.public.confirm.expired.title')}</AlertTitle>
          <AlertDescription>{t('enrolment.public.confirm.expired.text')}</AlertDescription>
        </Alert>
        {clubLink}
      </>
    )
  } else {
    body = (
      <div className="flex flex-col gap-3" data-testid="enrolment-confirm-error">
        <ErrorMessage
          label={
            state.status === 'too_many'
              ? tooManyText(t, state.retryAfter)
              : state.status === 'network'
                ? t('enrolment.public.errors.network')
                : t('enrolment.public.errors.failed')
          }
          action={
            <Button type="button" variant="outline" className="min-h-11" onClick={() => void confirm()}>
              {t('enrolment.public.actions.retry')}
            </Button>
          }
        />
      </div>
    )
  }

  return (
    <PublicEnrolmentFrame club={club.data ?? null}>
      <section
        className="flex flex-col gap-4"
        aria-labelledby="enrolment-confirm-title"
        aria-busy={state.status === 'pending'}
      >
        <h1 id="enrolment-confirm-title" className="text-2xl font-semibold">
          {t('enrolment.public.confirm.title')}
        </h1>
        <div aria-live="polite" className="flex flex-col gap-4">
          {body}
        </div>
      </section>
    </PublicEnrolmentFrame>
  )
}
