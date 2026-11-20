'use client'
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

const TILE_CLASS = 'bg-card flex h-full flex-col gap-2 rounded-lg border p-4'
const LINK_CLASS =
  'hover:bg-accent focus-visible:focus-indicator -m-2 flex min-h-11 flex-col gap-2 rounded-md p-2 outline-none'

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
        <section
          key={campaign.id}
          aria-labelledby={`club-today-order-${campaign.id}`}
          className="flex flex-col gap-3"
          data-testid="club-tile-order"
        >
          <h2 id={`club-today-order-${campaign.id}`} className="sr-only">
            {`${t('payments.orders.tile.title')}: ${campaign.name}`}
          </h2>
          <div className={TILE_CLASS}>
            <Link href={clubOrderHref(campaign.id)} className={LINK_CLASS} data-testid="club-tile-order-link">
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
          </div>
        </section>
      ))}
    </>
  )
}
