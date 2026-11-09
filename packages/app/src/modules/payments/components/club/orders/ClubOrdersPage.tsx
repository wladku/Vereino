'use client'
// `/club/orders` — M-16 (payments spec REQ-032, REQ-002; issue #116): the kit order campaigns that cover the payer's
// children, each child with its state — not ordered, to pay, paid, picked up — and the way into the order form. States:
// loading, error with retry, empty ("no campaign for your children"), and the payer gate of the frame (a minor sees
// no orders and no prices).
import * as React from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { Alert } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import type { ChildOrderState } from '../../../lib/orders'
import { formatMoney } from '../../client-helpers'
import { PaymentsClubFrame } from '../PaymentsClubFrame'
import { MY_ORDERS_QUERY_KEY, clubOrderHref, type MyCampaign } from './order-client'

const STATE_VARIANT: Record<ChildOrderState, 'neutral' | 'warning' | 'success' | 'info'> = {
  not_ordered: 'neutral',
  to_pay: 'warning',
  paid: 'success',
  picked_up: 'info',
}

class LoadError extends Error {}

function formatDate(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(
    new Date(`${value}T00:00:00Z`),
  )
}

function Campaigns() {
  const t = useT()
  const locale = useLocale()
  const query = useQuery({
    queryKey: MY_ORDERS_QUERY_KEY,
    queryFn: async () => {
      const call = await apiCall<{ items: MyCampaign[] }>('/api/payments/my-orders')
      if (!call.ok || !call.result) throw new LoadError(String(call.status))
      return call.result.items
    },
  })
  if (query.isLoading) return <LoadingMessage label={t('payments.orders.club.loading')} />
  if (query.isError || !query.data) {
    return (
      <ErrorMessage
        label={t('payments.orders.club.errors.load')}
        action={
          <Button type="button" variant="outline" className="min-h-11" onClick={() => void query.refetch()}>
            {t('payments.club.retry')}
          </Button>
        }
      />
    )
  }
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t('payments.orders.club.listTitle')}</h1>
      {query.data.length === 0 ? (
        <Alert status="information" data-testid="club-orders-empty">
          <p className="max-w-prose">{t('payments.orders.club.empty')}</p>
        </Alert>
      ) : null}
      <ul className="flex flex-col gap-4" data-testid="club-orders">
        {query.data.map((campaign) => (
          <li
            key={campaign.id}
            className="bg-card flex flex-col gap-3 rounded-lg border p-4"
            data-testid="club-order-campaign"
          >
            <div className="flex flex-col gap-1">
              <h2 className="text-lg font-semibold">{campaign.name}</h2>
              <p className="text-muted-foreground text-sm">
                {campaign.ordersOpen
                  ? t('payments.orders.club.deadline', { date: formatDate(campaign.closesOn, locale) })
                  : t('payments.orders.club.closed')}
              </p>
            </div>
            <ul className="flex flex-col gap-2">
              {campaign.children.map((child) => (
                <li
                  key={child.personId}
                  className="flex flex-wrap items-center justify-between gap-2"
                  data-testid="club-order-child"
                  data-child={child.firstName}
                >
                  <span className="flex flex-col">
                    <span className="font-medium">{child.firstName}</span>
                    {child.groupName ? <span className="text-muted-foreground text-sm">{child.groupName}</span> : null}
                  </span>
                  <span className="flex flex-wrap items-center gap-2">
                    <StatusBadge variant={STATE_VARIANT[child.state]}>
                      {t(`payments.orders.club.state.${child.state}`)}
                    </StatusBadge>
                    {child.state === 'to_pay' ? (
                      <span className="text-sm">{formatMoney(child.remaining, locale)}</span>
                    ) : null}
                    <Button asChild variant={child.orderId ? 'outline' : 'default'} className="min-h-11">
                      <Link href={clubOrderHref(campaign.id, child.personId)}>
                        {child.orderId || !campaign.ordersOpen
                          ? t('payments.orders.club.view')
                          : t('payments.orders.club.order')}
                      </Link>
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function ClubOrdersPage() {
  return <PaymentsClubFrame>{() => <Campaigns />}</PaymentsClubFrame>
}
