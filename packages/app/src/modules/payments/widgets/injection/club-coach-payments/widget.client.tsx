'use client'
// The "My groups' payments" tile of `/club` — Today (README M-02 → M-18; payments spec REQ-033; issue #117): a link to
// `/club/coach/payments` with the people to pay and overdue in the coach's groups and the cash the coach holds. A
// caller without groups sees no tile; a failed read keeps the link with the plain description.
import * as React from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { formatZloty } from '../../../lib/charge-ledger'
import type { GroupChargesView } from '../../../components/club/coach/coach-client'

const TILE_CLASS = 'bg-card flex h-full flex-col gap-2 rounded-lg border p-4'
const LINK_CLASS =
  'hover:bg-accent focus-visible:shadow-focus -m-2 flex min-h-11 flex-col gap-2 rounded-md p-2 outline-none'

export default function ClubCoachPaymentsWidget() {
  const t = useT()
  const query = useQuery({
    queryKey: ['payments-coach', 'tile'],
    retry: false,
    queryFn: async () => {
      const call = await apiCall<GroupChargesView>('/api/payments/group-charges')
      if (!call.ok || !call.result) throw new Error(String(call.status))
      return call.result
    },
  })
  const view = query.data
  if (view && view.groups.length === 0) return null
  const people = view ? view.groups.reduce((sum, group) => sum + group.peopleToPay, 0) : null
  const overdue = view ? view.groups.reduce((sum, group) => sum + group.peopleOverdue, 0) : null
  return (
    <section aria-labelledby="club-today-coach-payments" className="flex flex-col gap-3">
      <h2 id="club-today-coach-payments" className="sr-only">
        {t('payments.coach.title')}
      </h2>
      <div className={TILE_CLASS}>
        <Link href="/club/coach/payments" className={LINK_CLASS} data-testid="club-tile-coach-payments">
          <span className="font-semibold">{t('payments.coach.title')}</span>
          <span className="text-muted-foreground max-w-prose text-sm" data-testid="club-tile-coach-payments-state">
            {view && people !== null && overdue !== null
              ? t('payments.coach.tile.state', {
                  people,
                  overdue,
                  cash: formatZloty(view.cash.total),
                })
              : t('payments.coach.help')}
          </span>
        </Link>
      </div>
    </section>
  )
}
