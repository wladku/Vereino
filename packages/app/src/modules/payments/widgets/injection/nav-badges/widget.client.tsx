'use client'
// The Bank statements and Order campaigns menu counts (navigation spec REQ-N03; #260): `bank.toDecide` and
// `campaignsRunning` of `GET /api/payments/dashboard?only=counts` — each present only with its feature, so an item the
// person cannot open gets no count — read on every navigation and every 60 seconds through the shared
// `navBadgeEffect`. One read serves both items.
import * as React from 'react'
import type { InjectionWidgetComponentProps } from '@open-mercato/shared/modules/widgets/injection'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { readApiResultOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { setNavBadge } from '@open-mercato/ui/backend/nav/navBadges'
import { navBadgeEffect } from '@vereino/ui'
import { BANK_HREF } from '../../../components/client-helpers'
import { ORDERS_HREF } from '../../../components/orders/orders-client'

const HREFS = [BANK_HREF, ORDERS_HREF] as const

async function readCounts(): Promise<Record<string, unknown>> {
  const body = await readApiResultOrThrow<{ bank?: { toDecide?: unknown }; campaignsRunning?: unknown }>(
    '/api/payments/dashboard?only=counts',
  )
  return { [BANK_HREF]: body.bank?.toDecide, [ORDERS_HREF]: body.campaignsRunning }
}

export default function PaymentsNavBadgesWidget({ context }: InjectionWidgetComponentProps<Record<string, unknown>, Record<string, unknown>>) {
  const t = useT()
  // The shell's injection context carries the current path, so the counts are read again on every navigation.
  const path = typeof context?.path === 'string' ? context.path : ''
  const label = React.useCallback((count: number) => t('payments.nav.badge.waiting', { count }), [t])
  React.useEffect(navBadgeEffect({ hrefs: HREFS, read: readCounts, publish: setNavBadge, label }), [path, label])
  return null
}
