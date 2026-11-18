'use client'
// `/p/[clubSlug]/requests/verify/[token]` — "Request confirmation" (facilities spec P-05, J-007 step 3, REQ-024, DD-44;
// E08-S05 #125; parity spec REQ-R16, #289): the link from the confirmation e-mail. On load the page posts the token in
// the body — once, also under React's strict mode, which runs an effect twice — and shows "Awaiting the
// administrator's approval until …" with the request's summary: the place, the slot in the club's time zone, the
// units, what the requester entered (organisation · contact · e-mail, never the phone — answered once, by the
// confirmation that spent the link, Q-R16) and the indicative amount payable to the facility owner after approval.
// "Link expired" for a used, unknown or expired link (410, no data) with a link back to the club's places, and "The
// slot was taken" (409) with "Back to the calendar" of that place.
// Every state renders inside the club's frame: the header of the confirmed request's club, otherwise the club of the
// address read through the public places (a club that publishes no page leaves the page title alone).
// The token is never rendered or logged; the server sends this path with `Referrer-Policy: no-referrer`.
import * as React from 'react'
import Link from 'next/link'
import { ErrorMessage } from '@open-mercato/ui/backend/detail'
import { Alert, AlertDescription, AlertTitle } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { MemberSkeleton } from '@vereino/ui'
import { PublicFacilitiesFrame } from './PublicFacilitiesFrame'
import {
  clubOfLoad,
  formatAmount,
  placeHref,
  placesHref,
  usePublicPlaces,
  verifyPublicRequest,
  zonedInstantLabel,
  zonedSlotLabel,
  type RequestSummary,
  type VerifyOutcome,
} from './public-client'

function BackLink({ href, label, testId }: { href: string; label: string; testId: string }) {
  return (
    <p>
      <Button asChild variant="outline" className="min-h-11">
        <Link href={href} data-testid={testId}>
          {label}
        </Link>
      </Button>
    </p>
  )
}

function BackToPlaces({ clubSlug }: { clubSlug: string }) {
  const t = useT()
  return (
    <BackLink href={placesHref(clubSlug)} label={t('facilities.public.verify.places')} testId="public-verify-places" />
  )
}

function Summary({ summary }: { summary: RequestSummary }) {
  const t = useT()
  const locale = useLocale()
  const entered = summary.summary
  const requester = [entered.renterDisplayName, entered.contactName, entered.contactEmail]
    .filter((part): part is string => Boolean(part))
    .join(' · ')
  const amount =
    entered.amount === null
      ? t('facilities.public.verify.summary.noAmount')
      : entered.payeeName
        ? t('facilities.public.verify.estimate', {
            amount: formatAmount(entered.amount, summary.currency, locale),
            owner: entered.payeeName,
          })
        : t('facilities.public.verify.estimateClub', {
            amount: formatAmount(entered.amount, summary.currency, locale),
          })
  const rows: Array<[string, string, string]> = [
    ['place', t('facilities.public.verify.summary.place'), entered.placeName],
    [
      'slot',
      t('facilities.public.verify.summary.slot'),
      zonedSlotLabel(entered.startsAt, entered.endsAt, summary.timeZone, locale),
    ],
    [
      'units',
      t('facilities.public.verify.summary.units'),
      t('facilities.public.request.units.label', { units: entered.units, minutes: entered.units * 90 }),
    ],
    ['requester', t('facilities.public.verify.summary.requester'), requester],
    ['amount', t('facilities.public.verify.summary.amount'), amount],
  ]
  return (
    <dl
      className="bg-card grid grid-cols-1 gap-x-4 gap-y-2 rounded-lg border p-4 text-sm sm:grid-cols-3"
      data-testid="public-verify-summary"
    >
      {rows.map(([key, label, value]) => (
        <React.Fragment key={key}>
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="break-words sm:col-span-2" data-testid={`public-verify-${key}`}>
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
  // The club's frame for every state; the confirmed request's own club wins once it is known.
  const places = usePublicPlaces(clubSlug)
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
    body = <MemberSkeleton shape="rows" label={t('facilities.public.verify.loading')} />
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
        {outcome.status === 'taken' && outcome.placeSlug ? (
          <BackLink
            href={placeHref(clubSlug, outcome.placeSlug)}
            label={t('facilities.public.verify.backToCalendar')}
            testId="public-verify-calendar"
          />
        ) : (
          <BackToPlaces clubSlug={clubSlug} />
        )}
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

  const club = (outcome?.status === 'ok' ? outcome.summary.club : null) ?? clubOfLoad(places.data)
  return (
    <PublicFacilitiesFrame club={club}>
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
