'use client'
// The view of the `activities` dashboard widgets "Sessions needing a coach" and "Unsettled sessions" (README B-01;
// E06-S13 #95, on the E06-S06 pattern of #88): the count, up to five sessions in start order each linking to the
// session (where "Assign substitute" or the attendance list is), "Open list" to the B-15 perspective, and its own
// loading, empty and error ("Try again") states, so a failure here never takes the other widgets down. The record scope
// of the list route decides which sessions count: the coordinator's sections, the administrator's club.
import * as React from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import type { DashboardWidgetComponentProps } from '@open-mercato/shared/modules/dashboard/widgets'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { readApiResultOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { Button } from '@open-mercato/ui/primitives/button'
import {
  sessionsWidgetListHref,
  sessionsWidgetQuery,
  summarizeSessionsPage,
  type SessionsWidgetData,
  type SessionsWidgetKind,
} from '../lib/dashboard-rules'
import { localCalendarDate } from '../lib/occurrence-list'
import {
  OCCURRENCES_HREF,
  OWN_FORBIDDEN_STATE,
  dateLabel,
  instantDate,
  instantTime,
  occurrenceHref,
} from './client-helpers'

async function loadSessions(kind: SessionsWidgetKind): Promise<SessionsWidgetData> {
  const body = await readApiResultOrThrow<{ items?: unknown; total?: unknown }>(
    `/api/activities/occurrences?${sessionsWidgetQuery(kind, localCalendarDate(new Date()))}`,
    OWN_FORBIDDEN_STATE,
  )
  return summarizeSessionsPage(body)
}

export function SessionsWidget({
  kind,
  mode,
  refreshToken,
  onRefreshStateChange,
}: DashboardWidgetComponentProps<Record<string, never>> & { kind: SessionsWidgetKind }) {
  const t = useT()
  const prefix = `activities.dashboard.widgets.${kind}`
  const query = useQuery({
    queryKey: ['activities', 'dashboard', kind, refreshToken],
    queryFn: () => loadSessions(kind),
    enabled: mode === 'view',
    // The widget shows its own error with "Try again" at once instead of retrying in the background.
    retry: false,
  })
  const fetching = query.isFetching

  React.useEffect(() => {
    onRefreshStateChange?.(fetching)
  }, [fetching, onRefreshStateChange])

  if (mode === 'settings') {
    return <p className="text-muted-foreground text-sm">{t('activities.dashboard.widgets.noSettings')}</p>
  }

  if (query.isError && !query.isFetching) {
    return (
      <ErrorMessage
        label={t(`${prefix}.error`)}
        action={
          <Button type="button" variant="outline" size="sm" onClick={() => void query.refetch()}>
            {t('activities.dashboard.widgets.retry')}
          </Button>
        }
      />
    )
  }

  if (query.isFetching || !query.data) return <LoadingMessage label={t('activities.dashboard.widgets.loading')} />

  const { total, sessions } = query.data
  return (
    <div className="space-y-3" data-testid={`activities-widget-${kind}`}>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          <span className="text-foreground mr-2 text-2xl font-semibold" data-testid={`activities-widget-${kind}-count`}>
            {total}
          </span>
          {t(`${prefix}.countLabel`)}
        </p>
        <Link
          href={sessionsWidgetListHref(kind, OCCURRENCES_HREF)}
          className="text-primary text-sm font-medium underline-offset-4 hover:underline"
        >
          {t('activities.dashboard.widgets.openList')}
        </Link>
      </div>
      {total === 0 ? (
        <p className="bg-muted/50 text-muted-foreground rounded-md border px-3 py-4 text-center text-sm">
          {t(`${prefix}.empty`)}
        </p>
      ) : (
        <ul className="space-y-1">
          {sessions.map((session) => (
            <li key={session.id}>
              <Link
                href={occurrenceHref(session.id)}
                className="text-primary hover:bg-muted block rounded-md px-2 py-1.5 text-sm underline-offset-4 hover:underline"
              >
                {[
                  `${dateLabel(t, instantDate(session.startAt))} ${instantTime(session.startAt)}`,
                  [session.activityName, session.groupName].filter(Boolean).join(' · '),
                  kind === 'unsettledSessions' ? session.coachName : null,
                ]
                  .filter(Boolean)
                  .join(' — ')}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {total > sessions.length ? (
        <p className="text-muted-foreground text-xs">
          {t('activities.dashboard.widgets.more', { count: total - sessions.length })}
        </p>
      ) : null}
    </div>
  )
}
