'use client'
// The view of the `payments` dashboard widgets "Overdue" and "Charges without a payer" (README B-01; payments spec
// REQ-011; issue #111 E07-S04, on the pattern of the `activities` widgets of #95): the figure — the remaining total
// with the number of families, or the number of charges without a payer — and "Open list" to the matching B-21
// perspective, with its own loading, empty and error ("Try again") states so a failure never takes other widgets down.
import * as React from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import type { DashboardWidgetComponentProps } from '@open-mercato/shared/modules/dashboard/widgets'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { readApiResultOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { Button } from '@open-mercato/ui/primitives/button'
import { chargesPerspectiveHref, formatZloty } from '../lib/charge-ledger'
import { CHARGES_HREF } from './client-helpers'

export type PaymentsWidgetKind = 'overdue' | 'withoutPayer'

/** `GET /api/payments/dashboard`. */
type PaymentsDashboardResponse = {
  overdue: { total: number; charges: number; families: number }
  withoutPayer: { charges: number }
}

export function PaymentsDashboardWidget({
  kind,
  mode,
  refreshToken,
  onRefreshStateChange,
}: DashboardWidgetComponentProps<Record<string, never>> & { kind: PaymentsWidgetKind }) {
  const t = useT()
  const prefix = `payments.dashboard.widgets.${kind}`
  const query = useQuery({
    queryKey: ['payments', 'dashboard', refreshToken],
    queryFn: () => readApiResultOrThrow<PaymentsDashboardResponse>('/api/payments/dashboard'),
    enabled: mode === 'view',
    // The widget shows its own error with "Try again" at once instead of retrying in the background.
    retry: false,
  })
  const fetching = query.isFetching

  React.useEffect(() => {
    onRefreshStateChange?.(fetching)
  }, [fetching, onRefreshStateChange])

  if (mode === 'settings') {
    return <p className="text-muted-foreground text-sm">{t('payments.dashboard.widgets.noSettings')}</p>
  }

  if (query.isError && !query.isFetching) {
    return (
      <ErrorMessage
        label={t(`${prefix}.error`)}
        action={
          <Button type="button" variant="outline" size="sm" onClick={() => void query.refetch()}>
            {t('payments.dashboard.widgets.retry')}
          </Button>
        }
      />
    )
  }

  if (query.isFetching || !query.data) return <LoadingMessage label={t('payments.dashboard.widgets.loading')} />

  const { overdue, withoutPayer } = query.data
  const count = kind === 'overdue' ? overdue.charges : withoutPayer.charges
  return (
    <div className="space-y-3" data-testid={`payments-widget-${kind}`}>
      <div className="flex items-baseline justify-between gap-3">
        {kind === 'overdue' ? (
          <p className="text-muted-foreground text-sm">
            <span className="text-foreground mr-2 text-2xl font-semibold" data-testid="payments-widget-overdue-total">
              {formatZloty(overdue.total)}
            </span>
            <span data-testid="payments-widget-overdue-families">
              {t('payments.dashboard.widgets.overdue.families', { count: overdue.families })}
            </span>
          </p>
        ) : (
          <p className="text-muted-foreground text-sm">
            <span
              className="text-foreground mr-2 text-2xl font-semibold"
              data-testid="payments-widget-withoutPayer-count"
            >
              {withoutPayer.charges}
            </span>
            {t('payments.dashboard.widgets.withoutPayer.countLabel')}
          </p>
        )}
        <Link
          href={chargesPerspectiveHref(CHARGES_HREF, kind === 'overdue' ? 'overdue' : 'payer_missing')}
          className="text-primary text-sm font-medium underline-offset-4 hover:underline"
        >
          {t('payments.dashboard.widgets.openList')}
        </Link>
      </div>
      {count === 0 ? (
        <p className="bg-muted/50 text-muted-foreground rounded-md border px-3 py-4 text-center text-sm">
          {t(`${prefix}.empty`)}
        </p>
      ) : null}
    </div>
  )
}
