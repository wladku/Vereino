'use client'
// The view of "Today at the facility" (README B-01; facilities parity spec REQ-R20; #290): today's entries in the club's
// time zone — time, what occupies the place and the place — at most eight and "and N more", a link to B-23 on the first
// entry's place and today, each row to its own place, and its own loading, empty ("Nothing scheduled") and error
// ("Try again") states, so a failure here never takes the other widgets down.
import * as React from 'react'
import Link from 'next/link'
import type { DashboardWidgetComponentProps } from '@open-mercato/shared/modules/dashboard/widgets'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { Button } from '@open-mercato/ui/primitives/button'
import { browserTimeZone, useClubTimeZone, useClubToday } from '@vereino/ui'
import { todayAtFacility } from '../../../lib/today-at-facility'
import { CALENDAR_HREF, placeCalendarHref } from '../../../components/facilities-client'
import { dayWindow, entryLabel, entryRange, useStaffCalendar } from '../../../components/club-places/places-client'

const TodayAtFacilityWidget: React.FC<DashboardWidgetComponentProps<Record<string, never>>> = ({
  mode,
  refreshToken,
  onRefreshStateChange,
}) => {
  const t = useT()
  const today = useClubToday()
  const zone = useClubTimeZone() ?? browserTimeZone()
  const day = React.useMemo(() => dayWindow(today, zone), [today, zone])
  const query = useStaffCalendar(day)
  const fetching = query.isFetching
  const { refetch } = query

  React.useEffect(() => {
    onRefreshStateChange?.(fetching)
  }, [fetching, onRefreshStateChange])

  const firstToken = React.useRef(refreshToken)
  React.useEffect(() => {
    if (refreshToken === firstToken.current) return
    firstToken.current = refreshToken
    void refetch()
  }, [refreshToken, refetch])

  if (mode === 'settings') {
    return <p className="text-muted-foreground text-sm">{t('facilities.dashboard.today.noSettings')}</p>
  }

  if (query.isError && !query.isFetching) {
    return (
      <ErrorMessage
        label={t('facilities.dashboard.today.error')}
        action={
          <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
            {t('facilities.public.actions.retry')}
          </Button>
        }
      />
    )
  }

  if (!query.data) return <LoadingMessage label={t('facilities.common.loading')} />

  const timeZone = query.data.timeZone || zone
  const { shown, more, firstPlaceId } = todayAtFacility(query.data)
  return (
    <div className="space-y-3" data-testid="facilities-widget-today">
      <div className="flex justify-end">
        <Link
          href={firstPlaceId ? placeCalendarHref(firstPlaceId, today) : CALENDAR_HREF}
          className="text-primary text-sm font-medium underline-offset-4 hover:underline"
          data-testid="facilities-widget-today-open"
        >
          {t('facilities.dashboard.today.open')}
        </Link>
      </div>
      {shown.length === 0 ? (
        <p
          className="bg-muted/50 text-muted-foreground rounded-md border px-3 py-4 text-center text-sm"
          data-testid="facilities-widget-today-empty"
        >
          {t('facilities.dashboard.today.empty')}
        </p>
      ) : (
        <ul className="space-y-1">
          {shown.map((entry) => (
            <li key={`${entry.kind}:${entry.id}`} data-testid="facilities-widget-today-entry">
              <Link
                href={placeCalendarHref(entry.placeId, today)}
                className="hover:bg-muted flex flex-col rounded-md px-2 py-1.5 text-sm underline-offset-4 hover:underline"
              >
                <span className="text-primary">
                  <span className="tabular-nums">{entryRange(entry, timeZone)}</span> {entryLabel(t, entry)}
                </span>
                {entry.placeName ? <span className="text-muted-foreground text-xs">{entry.placeName}</span> : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {more > 0 ? (
        <p className="text-muted-foreground text-xs" data-testid="facilities-widget-today-more">
          {t('facilities.dashboard.today.more', { count: more })}
        </p>
      ) : null}
    </div>
  )
}

export default TodayAtFacilityWidget
