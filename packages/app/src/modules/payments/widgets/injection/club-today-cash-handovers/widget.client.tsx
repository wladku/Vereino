'use client'
// The "Handovers to confirm" row of `/club` — Today (payments spec REQ-033a, M-18a; D-042, #791): a row (`<li>`) of
// Today's "Shortcuts" list on the spot `vereino:club:today:more` (E20-S14 #493) linking to `/club/cash-handovers`,
// with the number of pending handovers and their total ("Nothing to confirm" when none waits). The spot does not
// enforce the widget's `features`, so the platform feature check runs first: a caller without `payments.cash.settle`
// (a coach, a guardian) makes no read and sees no row. A refused read hides the row; any other failure keeps the link
// with the plain description. The load error keeps its status off `status`, so the query cache's global 403 handler
// shows no "Access denied" toast for a row that simply stays hidden (#483).
import * as React from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { grantsFeature } from '@vereino/ui'
import { formatZloty } from '../../../lib/charge-ledger'
import { pendingSummary } from '../../../lib/cash-handovers'

const ROW_CLASS = 'border-b last:border-b-0'
const LINK_CLASS =
  'hover:bg-accent focus-visible:focus-indicator flex min-h-11 flex-col gap-1 rounded-md px-2 py-3 outline-none'

const SETTLE_FEATURE = 'payments.cash.settle'

class HandoversLoadError extends Error {
  constructor(readonly httpStatus: number) {
    super(String(httpStatus))
  }
}

export default function ClubTodayCashHandoversWidget() {
  const t = useT()
  const query = useQuery({
    queryKey: ['payments-cash-custody', 'today-row'],
    retry: false,
    queryFn: async (): Promise<{ count: number; total: number } | null> => {
      const check = await apiCall<{ granted?: unknown[] }>('/api/auth/feature-check', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ features: [SETTLE_FEATURE] }),
      })
      const granted = check.ok && Array.isArray(check.result?.granted) ? check.result.granted.map(String) : []
      if (!grantsFeature(granted, SETTLE_FEATURE)) return null
      const call = await apiCall<{ items: { amount: number }[]; total: number }>(
        '/api/payments/cash-handovers?status=pending&pageSize=100',
        { headers: { 'x-om-forbidden-redirect': '0' } },
      )
      if (!call.ok || !call.result) throw new HandoversLoadError(call.status)
      return { ...pendingSummary(call.result.items), count: call.result.total }
    },
  })
  if (query.isPending || query.data === null) return null
  if (query.error instanceof HandoversLoadError && (query.error.httpStatus === 401 || query.error.httpStatus === 403)) {
    return null
  }
  const summary = query.data
  return (
    <li className={ROW_CLASS}>
      <Link href="/club/cash-handovers" className={LINK_CLASS} data-testid="club-tile-cash-handovers">
        <span className="font-semibold">{t('payments.cashHandovers.title')}</span>
        <span className="text-muted-foreground max-w-prose text-sm" data-testid="club-tile-cash-handovers-state">
          {!summary
            ? t('payments.cashHandovers.help')
            : summary.count === 0
              ? t('payments.cashHandovers.tile.none')
              : t('payments.cashHandovers.tile.state', { count: summary.count, total: formatZloty(summary.total) })}
        </span>
      </Link>
    </li>
  )
}
