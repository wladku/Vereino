'use client'
// The "My groups' payments" tile of `/club` — Today (README M-02 → M-18; payments spec REQ-033; issue #117): a link to
// `/club/coach/payments` with the people to pay and overdue in the coach's groups and the cash the coach holds. The
// spot does not enforce the widget's `features`, so the tile stays hidden until the read answers and for a caller the
// API refuses (no `payments.groups.view`, e.g. a ward) or who has no groups; any other failed read keeps the link
// with the plain description.
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

class CoachTileLoadError extends Error {
  constructor(readonly status: number) {
    super(String(status))
  }
}

export default function ClubCoachPaymentsWidget() {
  const t = useT()
  const query = useQuery({
    queryKey: ['payments-coach', 'tile'],
    retry: false,
    queryFn: async () => {
      // Without the header `apiFetch` throws `ForbiddenError` on the 403 before the status check below (lesson
      // `apifetch-403-throws-before-page-branch`) and a ward gets the tile with the plain description.
      const call = await apiCall<GroupChargesView>('/api/payments/group-charges', {
        headers: { 'x-om-forbidden-redirect': '0' },
      })
      if (!call.ok || !call.result) throw new CoachTileLoadError(call.status)
      return call.result
    },
  })
  const view = query.data
  if (query.isPending) return null
  if (query.error instanceof CoachTileLoadError && (query.error.status === 401 || query.error.status === 403)) {
    return null
  }
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
