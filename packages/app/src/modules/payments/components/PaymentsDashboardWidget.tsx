'use client'
// The view of the `payments` dashboard widgets (README B-01; payments spec REQ-011, #111; payments parity spec
// REQ-C09, REQ-C02, #297 E12-S07; mockup `screenDashboard`, `kitDashboardWidget`), on the pattern of the `activities`
// widgets of #95: one read of `GET /api/payments/dashboard` shared by
// - "Overdue": the remaining total and "{n} overdue charges · {n} families · {n} without a payer";
// - "Charges without a payer": the count, up to five rows (description · period · person) and "and {n} more";
// - "Bank statements and cash": the transfers waiting for a decision or "All imported transfers are settled",
//   "{n} to refund" when any, "Import statement" and "Accept cash" (the shared dialog, `origin = dashboard`);
// - "Order campaigns": each running campaign with its stage and "{orders} of {children} children · paid {paid} of
//   {value}", linking to its B-32.
// Each has "Open list" to the matching page or perspective and its own loading, empty and error ("Try again") states,
// so a failure never takes other widgets down.
import * as React from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import type { DashboardWidgetComponentProps } from '@open-mercato/shared/modules/dashboard/widgets'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { readApiResultOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { Button } from '@open-mercato/ui/primitives/button'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { chargesPerspectiveHref, formatZloty } from '../lib/charge-ledger'
import type { CampaignStatus } from '../lib/order-campaigns'
import { AcceptCashButton } from './AcceptCashButton'
import { BANK_HREF, CHARGES_HREF, chargeHref, type Translate } from './client-helpers'
import { ORDERS_HREF, STAGE_VARIANTS, campaignHref, pluralKey } from './orders/orders-client'

export type PaymentsWidgetKind = 'overdue' | 'withoutPayer' | 'bank' | 'orderCampaigns'

/** `GET /api/payments/dashboard`. */
type PaymentsDashboardResponse = {
  overdue: { total: number; charges: number; families: number; withoutPayer: number }
  withoutPayer: {
    charges: number
    items: {
      id: string
      description: string
      period: string | null
      person: { firstName: string; lastName: string } | null
    }[]
    more: number
  }
  toRefund: { count: number }
  bank?: { toDecide: number }
  campaigns?: {
    id: string
    name: string
    status: CampaignStatus
    orders: number
    children: number
    paid: number
    value: number
  }[]
}

const OPEN_HREF: Record<PaymentsWidgetKind, string> = {
  overdue: chargesPerspectiveHref(CHARGES_HREF, 'overdue'),
  withoutPayer: chargesPerspectiveHref(CHARGES_HREF, 'payer_missing'),
  bank: BANK_HREF,
  orderCampaigns: ORDERS_HREF,
}

const linkClass = 'text-primary text-sm font-medium underline-offset-4 hover:underline'

function EmptyLine({ children }: { children: React.ReactNode }) {
  return <p className="bg-muted/50 text-muted-foreground rounded-md border px-3 py-4 text-center text-sm">{children}</p>
}

function Figure({ value, testId }: { value: React.ReactNode; testId: string }) {
  return (
    <span className="text-foreground mr-2 text-2xl font-semibold" data-testid={testId}>
      {value}
    </span>
  )
}

function OverdueBody({ data, t, locale }: { data: PaymentsDashboardResponse; t: Translate; locale: string }) {
  const { overdue } = data
  return (
    <>
      <p className="text-muted-foreground text-sm">
        <Figure value={formatZloty(overdue.total)} testId="payments-widget-overdue-total" />
      </p>
      {overdue.charges === 0 ? (
        <EmptyLine>{t('payments.dashboard.widgets.overdue.empty')}</EmptyLine>
      ) : (
        <p className="text-muted-foreground text-sm" data-testid="payments-widget-overdue-counts">
          <span data-testid="payments-widget-overdue-charges">
            {t(`payments.dashboard.widgets.overdue.charges.${pluralKey(locale, overdue.charges)}`, {
              count: overdue.charges,
            })}
          </span>
          {' · '}
          <span data-testid="payments-widget-overdue-families">
            {t(`payments.dashboard.widgets.overdue.families.${pluralKey(locale, overdue.families)}`, {
              count: overdue.families,
            })}
          </span>
          {overdue.withoutPayer > 0 ? (
            <>
              {' · '}
              <span data-testid="payments-widget-overdue-withoutPayer">
                {t('payments.dashboard.widgets.overdue.withoutPayer', { count: overdue.withoutPayer })}
              </span>
            </>
          ) : null}
        </p>
      )}
    </>
  )
}

function WithoutPayerBody({ data, t }: { data: PaymentsDashboardResponse; t: Translate }) {
  const { withoutPayer } = data
  return (
    <>
      <p className="text-muted-foreground text-sm">
        <Figure value={withoutPayer.charges} testId="payments-widget-withoutPayer-count" />
        {t('payments.dashboard.widgets.withoutPayer.countLabel')}
      </p>
      {withoutPayer.charges === 0 ? (
        <EmptyLine>{t('payments.dashboard.widgets.withoutPayer.empty')}</EmptyLine>
      ) : (
        <ul className="space-y-1 text-sm" data-testid="payments-widget-withoutPayer-items">
          {withoutPayer.items.map((item) => (
            <li key={item.id} data-testid="payments-widget-withoutPayer-item">
              <Link href={chargeHref(item.id)} className={linkClass}>
                {item.description}
              </Link>
              {item.period ? (
                <span className="text-muted-foreground">
                  {' · '}
                  {t('payments.dashboard.widgets.withoutPayer.period', { period: item.period })}
                </span>
              ) : null}
              {item.person ? (
                <span className="text-muted-foreground">
                  {' · '}
                  {`${item.person.firstName} ${item.person.lastName}`}
                </span>
              ) : null}
            </li>
          ))}
          {withoutPayer.more > 0 ? (
            <li className="text-muted-foreground" data-testid="payments-widget-withoutPayer-more">
              {t('payments.dashboard.widgets.withoutPayer.more', { count: withoutPayer.more })}
            </li>
          ) : null}
        </ul>
      )}
    </>
  )
}

function BankBody({
  data,
  t,
  locale,
  onCash,
}: {
  data: PaymentsDashboardResponse
  t: Translate
  locale: string
  onCash: () => void
}) {
  const toDecide = data.bank?.toDecide ?? 0
  const toRefund = data.toRefund.count
  return (
    <>
      <p className="text-sm" data-testid="payments-widget-bank-toDecide">
        {toDecide > 0
          ? t(`payments.dashboard.widgets.bank.toDecide.${pluralKey(locale, toDecide)}`, { count: toDecide })
          : t('payments.dashboard.widgets.bank.allSettled')}
      </p>
      {toRefund > 0 ? (
        <p className="text-sm">
          <Link
            href={chargesPerspectiveHref(CHARGES_HREF, 'to_refund')}
            className={linkClass}
            data-testid="payments-widget-bank-toRefund"
          >
            {t('payments.dashboard.widgets.bank.toRefund', { count: toRefund })}
          </Link>
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href={BANK_HREF} data-testid="payments-widget-bank-import">
            {t('payments.dashboard.widgets.bank.importStatement')}
          </Link>
        </Button>
        <AcceptCashButton origin="dashboard" size="sm" testId="payments-widget-bank-cash" onDone={onCash} />
      </div>
    </>
  )
}

function OrderCampaignsBody({ data, t }: { data: PaymentsDashboardResponse; t: Translate }) {
  const campaigns = data.campaigns ?? []
  if (campaigns.length === 0) return <EmptyLine>{t('payments.dashboard.widgets.orderCampaigns.empty')}</EmptyLine>
  return (
    <ul className="space-y-2 text-sm">
      {campaigns.map((campaign) => (
        <li key={campaign.id} data-testid="payments-widget-orderCampaigns-item" data-campaign-id={campaign.id}>
          <div className="flex flex-wrap items-center gap-2">
            <Link href={campaignHref(campaign.id)} className={linkClass}>
              {campaign.name}
            </Link>
            <StatusBadge variant={STAGE_VARIANTS[campaign.status]} dot>
              {t(`payments.orders.stage.${campaign.status}`)}
            </StatusBadge>
          </div>
          <p className="text-muted-foreground" data-testid="payments-widget-orderCampaigns-progress">
            {t('payments.dashboard.widgets.orderCampaigns.progress', {
              orders: campaign.orders,
              children: campaign.children,
              paid: formatZloty(campaign.paid),
              value: formatZloty(campaign.value),
            })}
          </p>
        </li>
      ))}
    </ul>
  )
}

export function PaymentsDashboardWidget({
  kind,
  mode,
  refreshToken,
  onRefreshStateChange,
}: DashboardWidgetComponentProps<Record<string, never>> & { kind: PaymentsWidgetKind }) {
  const t = useT()
  const locale = useLocale()
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

  // Only before the first answer of this refresh: a refetch after "Accept cash" keeps the open dialog mounted.
  if (!query.data) return <LoadingMessage label={t('payments.dashboard.widgets.loading')} />

  const data = query.data
  return (
    <div className="space-y-3" data-testid={`payments-widget-${kind}`}>
      <div className="flex justify-end">
        <Link href={OPEN_HREF[kind]} className={linkClass}>
          {t('payments.dashboard.widgets.openList')}
        </Link>
      </div>
      {kind === 'overdue' ? <OverdueBody data={data} t={t} locale={locale} /> : null}
      {kind === 'withoutPayer' ? <WithoutPayerBody data={data} t={t} /> : null}
      {kind === 'bank' ? <BankBody data={data} t={t} locale={locale} onCash={() => void query.refetch()} /> : null}
      {kind === 'orderCampaigns' ? <OrderCampaignsBody data={data} t={t} /> : null}
    </div>
  )
}
