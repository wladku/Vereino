'use client'
// The view of "Requests awaiting approval" (README B-01; E08-S05 #125): the count, up to five requests (place, slot in
// the club's time zone, time to expiry), "Open list" to B-25, and its own loading, empty and error ("Try again")
// states, so a failure here never takes the other widgets down.
import * as React from 'react'
import Link from 'next/link'
import type { DashboardWidgetComponentProps } from '@open-mercato/shared/modules/dashboard/widgets'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { Button } from '@open-mercato/ui/primitives/button'
import { REQUESTS_HREF, expiryLabel, queueSlotLabel, useRequestQueue } from '../../../components/requests-client'

const SHOWN = 5

const RequestsAwaitingApprovalWidget: React.FC<DashboardWidgetComponentProps<Record<string, never>>> = ({
  mode,
  refreshToken,
  onRefreshStateChange,
}) => {
  const t = useT()
  const locale = useLocale()
  const query = useRequestQueue(1, SHOWN, ['widget', refreshToken], mode === 'view')
  const fetching = query.isFetching

  React.useEffect(() => {
    onRefreshStateChange?.(fetching)
  }, [fetching, onRefreshStateChange])

  if (mode === 'settings') {
    return <p className="text-muted-foreground text-sm">{t('facilities.dashboard.requests.noSettings')}</p>
  }

  if (query.isError && !query.isFetching) {
    return (
      <ErrorMessage
        label={t('facilities.dashboard.requests.error')}
        action={
          <Button type="button" variant="outline" size="sm" onClick={() => void query.refetch()}>
            {t('facilities.public.actions.retry')}
          </Button>
        }
      />
    )
  }

  if (query.isFetching || !query.data) return <LoadingMessage label={t('facilities.common.loading')} />

  const { total, items, timeZone } = query.data
  const now = new Date(query.dataUpdatedAt)
  return (
    <div className="space-y-3" data-testid="facilities-widget-requests">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          <span className="text-foreground mr-2 text-2xl font-semibold" data-testid="facilities-widget-requests-count">
            {total}
          </span>
          {t('facilities.dashboard.requests.countLabel')}
        </p>
        <Link href={REQUESTS_HREF} className="text-primary text-sm font-medium underline-offset-4 hover:underline">
          {t('facilities.dashboard.requests.openList')}
        </Link>
      </div>
      {total === 0 ? (
        <p className="bg-muted/50 text-muted-foreground rounded-md border px-3 py-4 text-center text-sm">
          {t('facilities.dashboard.requests.empty')}
        </p>
      ) : (
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={item.id}>
              <Link
                href={REQUESTS_HREF}
                className="hover:bg-muted flex flex-col rounded-md px-2 py-1.5 text-sm underline-offset-4 hover:underline"
              >
                <span className="text-primary">
                  {[item.placeName, queueSlotLabel(item.startsAt, item.endsAt, timeZone, locale)]
                    .filter(Boolean)
                    .join(' — ')}
                </span>
                <span className="text-muted-foreground text-xs">
                  {t('facilities.dashboard.requests.expiry', { time: expiryLabel(t, item.holdExpiresAt, now) })}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {total > items.length ? (
        <p className="text-muted-foreground text-xs">
          {t('facilities.dashboard.requests.more', { count: total - items.length })}
        </p>
      ) : null}
    </div>
  )
}

export default RequestsAwaitingApprovalWidget
