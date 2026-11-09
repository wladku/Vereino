'use client'
// `/p/[clubSlug]/requests/verify/[token]` — "Request confirmation" (facilities spec P-05, J-007 step 3, REQ-024, DD-44;
// E08-S05 #125): the link from the confirmation e-mail. On load the page posts the token in the body — once, also under
// React's strict mode, which runs an effect twice — and shows "Awaiting the administrator's approval until …" with the
// request's summary (the place, the slot in the club's time zone, the units and the indicative amount), "Link expired"
// for a used, unknown or expired link (410) and "The slot was taken" (409), each with a link back to the club's places.
// The token is never rendered or logged; the server sends this path with `Referrer-Policy: no-referrer`.
import * as React from 'react'
import Link from 'next/link'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { Alert, AlertDescription, AlertTitle } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { PublicFacilitiesFrame } from './PublicFacilitiesFrame'
import {
  formatAmount,
  placesHref,
  verifyPublicRequest,
  zonedInstantLabel,
  zonedSlotLabel,
  type RequestSummary,
  type VerifyOutcome,
} from './public-client'

function BackToPlaces({ clubSlug }: { clubSlug: string }) {
  const t = useT()
  return (
    <p>
      <Button asChild variant="outline" className="min-h-11">
        <Link href={placesHref(clubSlug)} data-testid="public-verify-places">
          {t('facilities.public.verify.places')}
        </Link>
      </Button>
    </p>
  )
}

function Summary({ summary }: { summary: RequestSummary }) {
  const t = useT()
  const locale = useLocale()
  const rows: Array<[string, string, string]> = [
    ['place', t('facilities.public.verify.summary.place'), summary.placeName],
    [
      'slot',
      t('facilities.public.verify.summary.slot'),
      zonedSlotLabel(summary.startsAt, summary.endsAt, summary.timeZone, locale),
    ],
    [
      'units',
      t('facilities.public.verify.summary.units'),
      t('facilities.public.request.units.label', { units: summary.units, minutes: summary.units * 90 }),
    ],
    [
      'amount',
      t('facilities.public.verify.summary.amount'),
      summary.amount === null
        ? t('facilities.public.verify.summary.noAmount')
        : t('facilities.public.verify.summary.amountValue', {
            amount: formatAmount(summary.amount, summary.currency, locale),
          }),
    ],
  ]
  return (
    <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-3" data-testid="public-verify-summary">
      {rows.map(([key, label, value]) => (
        <React.Fragment key={key}>
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="sm:col-span-2" data-testid={`public-verify-${key}`}>
            {value}
          </dd>
        </React.Fragment>
      ))}
    </dl>
  )
}

export function RequestVerifyView({ clubSlug, token }: { clubSlug: string; token: string }) {
  const t = useT()
  const locale = useLocale()
  // Without a token there is nothing to confirm: the link is read as expired.
  const [outcome, setOutcome] = React.useState<VerifyOutcome | null>(() => (token ? null : { status: 'expired' }))
  // The link is spent by the first call: the ref keeps strict mode's second effect from posting it again. No cleanup
  // flag either — the first call's answer must land even though strict mode unmounts once in between.
  const started = React.useRef(false)
  const run = React.useCallback(() => {
    verifyPublicRequest(token)
      .then(setOutcome)
      .catch(() => {
        setOutcome({ status: 'failed' })
      })
  }, [token])
  const retry = () => {
    setOutcome(null)
    run()
  }

  React.useEffect(() => {
    if (started.current || !token) return
    started.current = true
    run()
  }, [token, run])

  let body: React.ReactNode
  if (!outcome) {
    body = <LoadingMessage label={t('facilities.public.verify.loading')} />
  } else if (outcome.status === 'ok') {
    const until = zonedInstantLabel(outcome.summary.holdExpiresAt, outcome.summary.timeZone, locale)
    body = (
      <>
        <Alert status="success" data-testid="public-verify-awaiting">
          <AlertTitle>{t('facilities.public.verify.awaiting.title')}</AlertTitle>
          <AlertDescription>{t('facilities.public.verify.awaiting.text', { until })}</AlertDescription>
        </Alert>
        <Summary summary={outcome.summary} />
        <p className="text-muted-foreground max-w-prose text-sm">{t('facilities.public.verify.next')}</p>
        <BackToPlaces clubSlug={clubSlug} />
      </>
    )
  } else if (outcome.status === 'expired' || outcome.status === 'taken') {
    body = (
      <>
        <Alert status="warning" data-testid={`public-verify-${outcome.status}`}>
          <AlertTitle>{t(`facilities.public.verify.${outcome.status}.title`)}</AlertTitle>
          <AlertDescription>{t(`facilities.public.verify.${outcome.status}.text`)}</AlertDescription>
        </Alert>
        <BackToPlaces clubSlug={clubSlug} />
      </>
    )
  } else {
    body = (
      <div data-testid="public-verify-error" className="flex flex-col gap-3">
        <ErrorMessage
          label={
            outcome.status === 'too_many'
              ? t('facilities.public.request.errors.tooMany')
              : t('facilities.public.verify.error')
          }
          action={
            <Button type="button" variant="outline" className="min-h-11" onClick={retry}>
              {t('facilities.public.actions.retry')}
            </Button>
          }
        />
        <BackToPlaces clubSlug={clubSlug} />
      </div>
    )
  }

  return (
    <PublicFacilitiesFrame club={null}>
      <section className="flex flex-col gap-4" aria-labelledby="public-verify-title" aria-busy={!outcome}>
        <h1 id="public-verify-title" className="text-2xl font-semibold">
          {t('facilities.public.verify.title')}
        </h1>
        <div aria-live="polite" className="flex flex-col gap-4">
          {body}
        </div>
      </section>
    </PublicFacilitiesFrame>
  )
}
