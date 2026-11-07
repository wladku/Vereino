'use client'
// The live quote of a rental (facilities spec B-24; #122), shared by the new rental and the move dialogs: the amount,
// the end, the payment due date and the free cancellation deadline as the server computes them — nothing is saved.
// Its issues are shown next to the dialog's fields, not here.
import * as React from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { errorMessage, instantLabel, minorToAmount } from './facilities-client'
import { localTimeOf, type RentalQuote } from './rentals-client'

export function QuotePanel({
  ready,
  quote,
  loading,
  error,
  chosenCategory,
  testId = 'facilities-rental-quote',
}: {
  ready: boolean
  quote: RentalQuote | undefined
  loading: boolean
  error: unknown
  chosenCategory?: string
  testId?: string
}) {
  const t = useT()
  const headingId = React.useId()
  let body: React.ReactNode
  if (!ready) {
    body = <p className="text-muted-foreground text-sm">{t('facilities.rentals.quote.incomplete')}</p>
  } else if (error) {
    body = (
      <p className="text-destructive text-sm" role="alert">
        {errorMessage(error, t('facilities.rentals.quote.error'))}
      </p>
    )
  } else if (!quote) {
    body = (
      <p className="text-muted-foreground text-sm" role="status">
        {t('facilities.rentals.quote.loading')}
      </p>
    )
  } else {
    const empty = t('facilities.common.empty')
    body = (
      <dl className="grid grid-cols-1 gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
        <div className="flex flex-col">
          <dt className="text-muted-foreground">{t('facilities.rentals.quote.amount')}</dt>
          <dd className="font-medium tabular-nums" data-testid={`${testId}-amount`}>
            {quote.amount === null ? empty : minorToAmount(quote.amount)}
          </dd>
        </div>
        <div className="flex flex-col">
          <dt className="text-muted-foreground">{t('facilities.rentals.quote.endsAt')}</dt>
          <dd className="tabular-nums" data-testid={`${testId}-ends-at`}>
            {localTimeOf(quote.endsAt) || empty}
          </dd>
        </div>
        <div className="flex flex-col">
          <dt className="text-muted-foreground">{t('facilities.rentals.quote.paymentDeadline')}</dt>
          <dd className="tabular-nums" data-testid={`${testId}-payment-deadline`}>
            {instantLabel(quote.paymentDeadline) || empty}
          </dd>
        </div>
        <div className="flex flex-col">
          <dt className="text-muted-foreground">{t('facilities.rentals.quote.cancellationDeadline')}</dt>
          <dd className="tabular-nums" data-testid={`${testId}-cancellation-deadline`}>
            {instantLabel(quote.cancellationDeadline) || empty}
          </dd>
        </div>
        {quote.appliedCategory && quote.appliedCategory !== chosenCategory ? (
          <p className="text-muted-foreground sm:col-span-2" data-testid={`${testId}-applied-category`}>
            {t('facilities.rentals.quote.appliedCategory', {
              category: t(`facilities.rates.category.${quote.appliedCategory}`),
            })}
          </p>
        ) : null}
      </dl>
    )
  }
  return (
    <section
      aria-labelledby={headingId}
      aria-busy={loading || undefined}
      className="bg-muted/40 flex flex-col gap-2 rounded-md border p-3"
      data-testid={testId}
    >
      <h3 id={headingId} className="text-sm font-medium">
        {t('facilities.rentals.quote.title')}
        {loading && quote ? (
          <span className="text-muted-foreground font-normal"> · {t('facilities.rentals.quote.updating')}</span>
        ) : null}
      </h3>
      {body}
    </section>
  )
}
