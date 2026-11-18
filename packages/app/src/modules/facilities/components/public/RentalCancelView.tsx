'use client'
// `/p/[clubSlug]/rentals/cancel/[token]` — the renter's cancellation (facilities parity spec REQ-R17, J-R06, the
// cancellation page row of *UI and Interaction Contracts*; DD-R13; #286): the link from the summary, approval or
// "moved" e-mail. On load the page reads the preview — the place, the slot in the club's time zone, the amount, the
// payee — and states before the button whether cancelling is still free or forfeits the payment; "Cancel the booking"
// posts the token with the confirmation and shows the result. An unknown, spent or expired link (410) shows "Link no
// longer works" and no data. The token is never rendered or logged; the server sends this path with
// `Referrer-Policy: no-referrer` and `Cache-Control: no-store`.
import * as React from 'react'
import Link from 'next/link'
import { ErrorMessage } from '@open-mercato/ui/backend/detail'
import { Alert, AlertDescription, AlertTitle } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { MemberSkeleton } from '@vereino/ui'
import { PublicFacilitiesFrame } from './PublicFacilitiesFrame'
import {
  cancelRentalByLink,
  formatAmount,
  placesHref,
  previewRentalCancel,
  zonedInstantLabel,
  zonedSlotLabel,
  type CancelOutcome,
  type CancelPreviewOutcome,
  type RentalCancelPreview,
} from './public-client'

function BackToPlaces({ clubSlug }: { clubSlug: string }) {
  const t = useT()
  return (
    <p>
      <Button asChild variant="outline" className="min-h-11">
        <Link href={placesHref(clubSlug)} data-testid="public-cancel-places">
          {t('facilities.public.verify.places')}
        </Link>
      </Button>
    </p>
  )
}

function Summary({ preview }: { preview: RentalCancelPreview }) {
  const t = useT()
  const locale = useLocale()
  const rows: Array<[string, string, string]> = [
    ['place', t('facilities.public.verify.summary.place'), preview.placeName],
    [
      'slot',
      t('facilities.public.verify.summary.slot'),
      zonedSlotLabel(preview.startsAt, preview.endsAt, preview.timeZone, locale),
    ],
    ['amount', t('facilities.public.cancel.summary.amount'), formatAmount(preview.amount, preview.currency, locale)],
  ]
  if (preview.payeeName) rows.push(['payee', t('facilities.public.cancel.summary.payee'), preview.payeeName])
  return (
    <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-3" data-testid="public-cancel-summary">
      {rows.map(([key, label, value]) => (
        <React.Fragment key={key}>
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="sm:col-span-2" data-testid={`public-cancel-${key}`}>
            {value}
          </dd>
        </React.Fragment>
      ))}
    </dl>
  )
}

function Failure({
  outcome,
  onRetry,
  clubSlug,
}: {
  outcome: { status: 'too_many' | 'failed' }
  onRetry: () => void
  clubSlug: string
}) {
  const t = useT()
  return (
    <div data-testid="public-cancel-error" className="flex flex-col gap-3">
      <ErrorMessage
        label={
          outcome.status === 'too_many'
            ? t('facilities.public.request.errors.tooMany')
            : t('facilities.public.cancel.error')
        }
        action={
          <Button type="button" variant="outline" className="min-h-11" onClick={onRetry}>
            {t('facilities.public.actions.retry')}
          </Button>
        }
      />
      <BackToPlaces clubSlug={clubSlug} />
    </div>
  )
}

function Expired({ clubSlug }: { clubSlug: string }) {
  const t = useT()
  return (
    <>
      <Alert status="warning" data-testid="public-cancel-expired">
        <AlertTitle>{t('facilities.public.cancel.expired.title')}</AlertTitle>
        <AlertDescription>{t('facilities.public.cancel.expired.text')}</AlertDescription>
      </Alert>
      <BackToPlaces clubSlug={clubSlug} />
    </>
  )
}

export function RentalCancelView({ clubSlug, token }: { clubSlug: string; token: string }) {
  const t = useT()
  const locale = useLocale()
  // Without a token there is nothing to cancel: the link is read as expired.
  const [preview, setPreview] = React.useState<CancelPreviewOutcome | null>(() =>
    token ? null : { status: 'expired' },
  )
  const [result, setResult] = React.useState<CancelOutcome | null>(null)
  const [submitting, setSubmitting] = React.useState(false)

  const fetchPreview = React.useCallback(() => {
    previewRentalCancel(token)
      .then(setPreview)
      .catch(() => {
        setPreview({ status: 'failed' })
      })
  }, [token])
  const load = () => {
    setPreview(null)
    fetchPreview()
  }

  React.useEffect(() => {
    // The preview spends nothing, so strict mode's second run is harmless.
    if (token) fetchPreview()
  }, [token, fetchPreview])

  const confirm = () => {
    if (submitting) return
    setSubmitting(true)
    cancelRentalByLink(token)
      .then(setResult)
      .catch(() => {
        setResult({ status: 'failed' })
      })
      .finally(() => {
        setSubmitting(false)
      })
  }

  let body: React.ReactNode
  if (result?.status === 'ok') {
    body = (
      <>
        <Alert status="success" data-testid={`public-cancel-done-${result.result}`}>
          <AlertTitle>{t('facilities.public.cancel.done.title')}</AlertTitle>
          <AlertDescription>
            {result.result === 'cancelled_free'
              ? t('facilities.public.cancel.done.free')
              : t('facilities.public.cancel.done.late')}
          </AlertDescription>
        </Alert>
        <BackToPlaces clubSlug={clubSlug} />
      </>
    )
  } else if (result?.status === 'expired' || preview?.status === 'expired') {
    body = <Expired clubSlug={clubSlug} />
  } else if (result) {
    body = <Failure outcome={result} onRetry={confirm} clubSlug={clubSlug} />
  } else if (!preview) {
    body = <MemberSkeleton shape="rows" label={t('facilities.public.cancel.loading')} />
  } else if (preview.status === 'ok') {
    const deadline = zonedInstantLabel(preview.preview.cancellationDeadline, preview.preview.timeZone, locale)
    const amount = formatAmount(preview.preview.amount, preview.preview.currency, locale)
    body = (
      <>
        <Summary preview={preview.preview} />
        <Alert status={preview.preview.free ? 'information' : 'warning'} data-testid="public-cancel-terms">
          <AlertTitle>
            {preview.preview.free ? t('facilities.public.cancel.free.title') : t('facilities.public.cancel.late.title')}
          </AlertTitle>
          <AlertDescription>
            {preview.preview.free
              ? t('facilities.public.cancel.free.text', { deadline })
              : t('facilities.public.cancel.late.text', { deadline, amount })}
          </AlertDescription>
        </Alert>
        <p>
          <Button
            type="button"
            variant="destructive"
            className="min-h-11 w-full sm:w-auto"
            onClick={confirm}
            disabled={submitting}
            data-testid="public-cancel-confirm"
          >
            {t('facilities.public.cancel.action')}
          </Button>
        </p>
      </>
    )
  } else {
    body = <Failure outcome={preview} onRetry={load} clubSlug={clubSlug} />
  }

  return (
    <PublicFacilitiesFrame club={preview?.status === 'ok' ? preview.preview.club : null}>
      <section className="flex flex-col gap-4" aria-labelledby="public-cancel-title" aria-busy={!preview || submitting}>
        <h1 id="public-cancel-title" className="text-2xl font-semibold">
          {t('facilities.public.cancel.title')}
        </h1>
        <div aria-live="polite" className="flex flex-col gap-4">
          {body}
        </div>
      </section>
    </PublicFacilitiesFrame>
  )
}
