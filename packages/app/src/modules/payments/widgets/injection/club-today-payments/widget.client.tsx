'use client'
// The body of the "Payments" tile on `/club` — Today (README M-02; payments spec REQ-012, REQ-002; issue #111
// E07-S04): the open total with the nearest due date and "Pay" (an overdue marker when that date has passed),
// "Everything is paid", or "The guardian pays" for an adult participant whose charges someone else pays. It renders
// inside `people`'s tile link to `/club/payments`, which `people` shows only when the R10 gate allows it, so a minor
// never mounts it. A failed read falls back to the tile's plain description.
import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { formatZloty } from '../../../lib/charge-ledger'

type Summary =
  | { state: 'due'; openTotal: number; openCount: number; nearestDueDate: string; overdue: boolean }
  | { state: 'paid' }
  | { state: 'guardian_pays' }

export const MY_PAYMENTS_SUMMARY_QUERY_KEY = ['payments-my-summary'] as const

function formatDate(value: string, locale: string): string {
  const date = new Date(`${value}T12:00:00Z`)
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'numeric', timeZone: 'UTC' }).format(date)
}

export default function ClubTodayPaymentsWidget() {
  const t = useT()
  const locale = useLocale()
  const summary = useQuery({
    queryKey: MY_PAYMENTS_SUMMARY_QUERY_KEY,
    queryFn: async (): Promise<Summary> => {
      const call = await apiCall<Summary>('/api/payments/my-charges/summary')
      if (!call.ok || !call.result) throw new Error(String(call.status))
      return call.result
    },
    retry: false,
  })
  const muted = 'text-muted-foreground max-w-prose text-sm'
  if (summary.isPending) {
    return <span className={muted}>{t('payments.club.tile.loading')}</span>
  }
  if (!summary.data) {
    return <span className={muted}>{t('payments.club.tile.description')}</span>
  }
  const data = summary.data
  if (data.state === 'paid') {
    return (
      <span className="text-sm" data-testid="club-tile-payments-state" data-state="paid">
        {t('payments.club.tile.paid')}
      </span>
    )
  }
  if (data.state === 'guardian_pays') {
    return (
      <span className={muted} data-testid="club-tile-payments-state" data-state="guardian_pays">
        {t('payments.club.tile.guardianPays')}
      </span>
    )
  }
  return (
    <span className="flex flex-col gap-2" data-testid="club-tile-payments-state" data-state="due">
      <span className="flex flex-wrap items-center gap-2">
        <span className="text-lg font-semibold" data-testid="club-tile-payments-amount">
          {formatZloty(data.openTotal)}
        </span>
        <span className="text-muted-foreground text-sm" data-testid="club-tile-payments-due">
          {t('payments.club.tile.due', { date: formatDate(data.nearestDueDate, locale) })}
        </span>
        {data.overdue ? <StatusBadge variant="error">{t('payments.club.charges.overdue')}</StatusBadge> : null}
      </span>
      {/* The whole tile is the link; "Pay" reads as its call to action, not a second control. */}
      <span className="bg-primary text-primary-foreground inline-flex min-h-11 w-fit items-center rounded-md px-4 text-sm font-medium">
        {t('payments.club.tile.pay')}
      </span>
    </span>
  )
}
