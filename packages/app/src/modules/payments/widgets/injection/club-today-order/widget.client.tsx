'use client'
// E20-S14 (#493): a row (`<li>`) of Today's "Shortcuts" list on the spot `vereino:club:today:more`, not a tile.
// The "Order" tile of `/club` — Today (README M-02 → M-17; payments parity spec REQ-C11; issue #299): for each campaign
// that still takes orders and covers the caller's children, its name, "orders until {date}" and, per child, "ordered —
// {amount}" or "not ordered", as a link to the order page. The spot does not enforce the widget's `features`, so the
// tile stays hidden until the read answers, when nothing applies, and when the read fails (a minor gets 403
// `payments_minor`): the Today page never shows an empty or broken order tile. The read runs only when the Today
// page's profile (the spot context) says the R10 gate opens the caller's own payments (`paymentsVisible`): staff
// without a payer grant would only get 403 `scope_denied` or `scope_unlinked` (#483).
import * as React from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import type { InjectionWidgetComponentProps } from '@open-mercato/shared/modules/widgets/injection'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { todayOrderCampaigns } from '../../../lib/orders'
import { formatMoney } from '../../../components/client-helpers'
import { MY_ORDERS_QUERY_KEY, clubOrderHref, type MyCampaign } from '../../../components/club/orders/order-client'

/** A row of Today's "Shortcuts" list (E20-S14 #493): a line under it, the link at least 44 px tall. */
const ROW_CLASS = 'border-b last:border-b-0'
const LINK_CLASS =
  'hover:bg-accent focus-visible:focus-indicator flex min-h-11 flex-col gap-1 rounded-md px-2 py-3 outline-none'

class OrderTileLoadError extends Error {}

function formatDate(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(
    new Date(`${value}T00:00:00Z`),
  )
}

/** The slice of `people`'s member profile the Today page passes as the spot context. */
export type ClubTodayOrderContext = { profile?: { paymentsVisible?: boolean } }

export default function ClubTodayOrderWidget({
  context,
}: InjectionWidgetComponentProps<ClubTodayOrderContext, Record<string, unknown>>) {
  const t = useT()
  const locale = useLocale()
  const query = useQuery({
    queryKey: MY_ORDERS_QUERY_KEY,
    retry: false,
    enabled: context?.profile?.paymentsVisible === true,
    queryFn: async () => {
      // Without the header `apiFetch` throws `ForbiddenError` on a minor's 403 (lesson
      // `apifetch-403-throws-before-page-branch`).
      const call = await apiCall<{ items: MyCampaign[] }>('/api/payments/my-orders', {
        headers: { 'x-om-forbidden-redirect': '0' },
      })
      if (!call.ok || !call.result) throw new OrderTileLoadError(String(call.status))
      return call.result.items
    },
  })
  const campaigns = query.data ? todayOrderCampaigns(query.data) : []
  if (campaigns.length === 0) return null
  return (
    <>
      {campaigns.map((campaign) => (
        <li key={campaign.id} className={ROW_CLASS} data-testid="club-tile-order">
          <Link
            href={clubOrderHref(campaign.id)}
            className={LINK_CLASS}
            data-testid="club-tile-order-link"
            aria-label={`${t('payments.orders.tile.title')}: ${campaign.name}`}
          >
            <span className="font-semibold">{t('payments.orders.tile.title')}</span>
            <span className="font-medium">{campaign.name}</span>
            <span className="text-muted-foreground text-sm">
              {t('payments.orders.tile.ordersUntil', { date: formatDate(campaign.closesOn, locale) })}
            </span>
            <ul className="flex flex-col gap-1 text-sm">
              {campaign.children.map((child) => (
                <li
                  key={child.personId}
                  data-testid="club-tile-order-child"
                  data-child={child.firstName}
                  data-ordered={child.orderId ? 'true' : 'false'}
                >
                  {child.orderId
                    ? t('payments.orders.tile.ordered', {
                        child: child.firstName,
                        amount: formatMoney(child.total, locale),
                      })
                    : t('payments.orders.tile.notOrdered', { child: child.firstName })}
                </li>
              ))}
            </ul>
          </Link>
        </li>
      ))}
    </>
  )
}
