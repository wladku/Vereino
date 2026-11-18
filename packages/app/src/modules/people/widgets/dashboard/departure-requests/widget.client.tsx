'use client'
// The view of "Departure requests" (people life-cycle spec row 10 of the dashboard widgets; #306): the count of open
// requests and the five oldest — subject, requester, requested last day — each linking to B-10 `?tab=leaving`, with
// its own loading, empty and error ("Try again") states.
import * as React from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import type { DashboardWidgetComponentProps } from '@open-mercato/shared/modules/dashboard/widgets'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { readApiResultOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { Button } from '@open-mercato/ui/primitives/button'
import { OWN_FORBIDDEN_STATE, personRecordHref } from '../../../components/client-helpers'

type RequestRow = {
  id: string
  subjectPersonId: string
  subjectName: string
  requestedByName: string | null
  requesterKind: 'self' | 'guardian' | 'club'
  requestedLastDay: string | null
}

type RequestPage = { items: RequestRow[]; total: number }

function formatDay(day: string, locale: string): string {
  const date = new Date(`${day}T00:00:00Z`)
  return Number.isNaN(date.getTime()) ? day : date.toLocaleDateString(locale, { dateStyle: 'medium', timeZone: 'UTC' })
}

const DepartureRequestsWidget: React.FC<DashboardWidgetComponentProps<Record<string, never>>> = ({
  mode,
  refreshToken,
  onRefreshStateChange,
}) => {
  const t = useT()
  const locale = useLocale()
  const query = useQuery({
    queryKey: ['people', 'dashboard', 'departureRequests', refreshToken],
    queryFn: () =>
      readApiResultOrThrow<RequestPage>('/api/people/departure-requests?status=open&pageSize=5', OWN_FORBIDDEN_STATE),
    enabled: mode === 'view',
    retry: false,
  })
  const fetching = query.isFetching

  React.useEffect(() => {
    onRefreshStateChange?.(fetching)
  }, [fetching, onRefreshStateChange])

  if (mode === 'settings') {
    return <p className="text-muted-foreground text-sm">{t('people.dashboard.widgets.departureRequests.noSettings')}</p>
  }
  if (query.isError && !query.isFetching) {
    return (
      <ErrorMessage
        label={t('people.dashboard.widgets.departureRequests.error')}
        action={
          <Button type="button" variant="outline" size="sm" onClick={() => void query.refetch()}>
            {t('people.dashboard.widgets.departureRequests.retry')}
          </Button>
        }
      />
    )
  }
  if (query.isFetching || !query.data) {
    return <LoadingMessage label={t('people.dashboard.widgets.departureRequests.loading')} />
  }

  const { total, items } = query.data
  return (
    <div className="space-y-3" data-testid="departure-requests-widget">
      <p className="text-muted-foreground text-sm">
        <span className="text-foreground mr-2 text-2xl font-semibold" data-testid="departure-requests-count">
          {total}
        </span>
        {t('people.dashboard.widgets.departureRequests.countLabel')}
      </p>
      {total === 0 ? (
        <p className="bg-muted/50 text-muted-foreground rounded-md border px-3 py-4 text-center text-sm">
          {t('people.dashboard.widgets.departureRequests.empty')}
        </p>
      ) : (
        <ul className="space-y-1">
          {items.map((row) => (
            <li key={row.id}>
              <Link
                href={personRecordHref(row.subjectPersonId, 'leaving')}
                className="hover:bg-muted block rounded-md px-2 py-1.5 text-sm"
              >
                <span className="text-primary font-medium underline-offset-4 hover:underline">
                  {row.subjectName || t('people.common.empty')}
                </span>
                <span className="text-muted-foreground block text-xs">
                  {row.requestedByName ?? t(`people.leaving.requesterKind.${row.requesterKind}`)}
                  {row.requestedLastDay
                    ? ` · ${t('people.leaving.requests.lastDay', { date: formatDay(row.requestedLastDay, locale) })}`
                    : ''}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default DepartureRequestsWidget
