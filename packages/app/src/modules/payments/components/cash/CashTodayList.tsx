'use client'
// "Received by me today" (UX concept M-15; payments spec REQ-031; issue #114): the receipts the signed-in user issued
// today, each with what it paid for over its number and the payer (REQ-C12, #300), the amount, and the total to hand
// over to the treasurer. A reversed receipt stays in the list, struck through, and counts for nothing.
import * as React from 'react'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { errorMessage, formatMoney, personName } from '../client-helpers'
import { useCashToday } from './cash-client'

export function CashTodayList() {
  const t = useT()
  const locale = useLocale()
  const today = useCashToday()
  const headingId = React.useId()

  let body: React.ReactNode
  if (today.isLoading) {
    body = (
      <p className="text-muted-foreground text-sm" role="status">
        {t('payments.cash.loading')}
      </p>
    )
  } else if (today.error || !today.data) {
    body = (
      <p className="text-destructive text-sm" role="alert">
        {errorMessage(today.error, t('payments.cash.errors.today'))}
      </p>
    )
  } else if (today.data.items.length === 0) {
    body = (
      <p className="text-muted-foreground text-sm" data-testid="cash-today-empty">
        {t('payments.cash.today.empty')}
      </p>
    )
  } else {
    body = (
      <ul className="flex flex-col divide-y rounded-md border">
        {today.data.items.map((item) => (
          <li
            key={item.receiptNumber}
            className="flex flex-wrap items-baseline justify-between gap-2 p-3"
            data-testid="cash-today-item"
          >
            <span className="flex min-w-0 flex-col">
              <span
                className={item.reversed ? 'font-medium break-words line-through' : 'font-medium break-words'}
                data-testid="cash-today-description"
              >
                {item.descriptions.join(', ')}
              </span>
              <span className="text-muted-foreground text-sm" data-testid="cash-today-receipt">
                {item.reversed
                  ? t('payments.cash.today.reversed', { receipt: item.receiptNumber })
                  : item.receiptNumber}
                {' · '}
                {personName(item.payer) || t('payments.cash.today.unknownPayer')}
              </span>
            </span>
            <span className="font-semibold">{formatMoney(item.amount, locale)}</span>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3" data-testid="cash-today">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={headingId} className="text-base font-semibold">
          {t('payments.cash.today.title')}
        </h2>
        {today.data ? (
          <span className="text-sm" data-testid="cash-today-total">
            {t('payments.cash.today.total', { amount: formatMoney(today.data.total, locale) })}
          </span>
        ) : null}
      </div>
      {body}
    </section>
  )
}
