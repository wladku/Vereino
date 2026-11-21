'use client'
// E20-S14 (#493): a row (`<li>`) of Today's "Shortcuts" list on the spot `vereino:club:today:more`, not a tile.
// The "My groups' payments" tile of `/club` — Today (README M-02 → M-18; payments spec REQ-033; issue #117): a link to
// `/club/coach/payments` with the people to pay and overdue in the coach's groups and the cash the coach holds. The
// spot does not enforce the widget's `features`, so the tile stays hidden until the read answers and for a caller the
// API refuses (no `payments.groups.view`, e.g. a ward) or who has no groups; any other failed read keeps the link
// with the plain description. The link opens M-18 on the coach's group with "To pay" (`?group=&due=1`; REQ-C12, #300).
// The platform feature check runs first, so a caller without `payments.groups.view` (a guardian, an attendant) makes no
// read the route refuses; the load error keeps its status off `status`, so the query cache's global 403 handler shows
// no "Access denied" toast for a tile that simply stays hidden (#483).
import * as React from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { grantsFeature } from '@vereino/ui'
import { formatZloty } from '../../../lib/charge-ledger'
import { coachPaymentsHref, tileGroupOf } from '../../../lib/group-charges'
import type { GroupChargesView } from '../../../components/club/coach/coach-client'

/** A row of Today's "Shortcuts" list (E20-S14 #493): a line under it, the link at least 44 px tall. */
const ROW_CLASS = 'border-b last:border-b-0'
const LINK_CLASS =
  'hover:bg-accent focus-visible:focus-indicator flex min-h-11 flex-col gap-1 rounded-md px-2 py-3 outline-none'

const GROUPS_VIEW_FEATURE = 'payments.groups.view'

class CoachTileLoadError extends Error {
  constructor(readonly httpStatus: number) {
    super(String(httpStatus))
  }
}

export default function ClubCoachPaymentsWidget() {
  const t = useT()
  const query = useQuery({
    queryKey: ['payments-coach', 'tile'],
    retry: false,
    queryFn: async (): Promise<GroupChargesView | null> => {
      const check = await apiCall<{ granted?: unknown[] }>('/api/auth/feature-check', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ features: [GROUPS_VIEW_FEATURE] }),
      })
      const granted = check.ok && Array.isArray(check.result?.granted) ? check.result.granted.map(String) : []
      if (!grantsFeature(granted, GROUPS_VIEW_FEATURE)) return null
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
  if (query.isPending || query.data === null) return null
  if (query.error instanceof CoachTileLoadError && (query.error.httpStatus === 401 || query.error.httpStatus === 403)) {
    return null
  }
  if (view && view.groups.length === 0) return null
  const people = view ? view.groups.reduce((sum, group) => sum + group.peopleToPay, 0) : null
  const overdue = view ? view.groups.reduce((sum, group) => sum + group.peopleOverdue, 0) : null
  return (
    <li className={ROW_CLASS}>
      <Link
        href={coachPaymentsHref({ groupId: view ? tileGroupOf(view.groups) : null, due: true })}
        className={LINK_CLASS}
        data-testid="club-tile-coach-payments"
      >
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
    </li>
  )
}
