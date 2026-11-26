'use client'
// The view of "Applications past the answer time" (sign-up form spec B-J1, REQ-J17, J-J07; #799): the count from
// `GET /api/enrolment/overdue` and "Open list" to `/backend/enrolment/applications?overdue=1`, with its own loading and
// error ("Try again") states, so a failure here never takes the other widgets down.
import * as React from 'react'
import Link from 'next/link'
import type { DashboardWidgetComponentProps } from '@open-mercato/shared/modules/dashboard/widgets'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { Button } from '@open-mercato/ui/primitives/button'
import { BACKEND_APPLICATIONS_HREF } from '../../../lib/paths'
import { useOverdueCount } from '../../../components/club/applications-client'

const OVERDUE_HREF = `${BACKEND_APPLICATIONS_HREF}?overdue=1`

const OverdueApplicationsWidget: React.FC<DashboardWidgetComponentProps<Record<string, never>>> = ({
  mode,
  refreshToken,
  onRefreshStateChange,
}) => {
  const t = useT()
  const query = useOverdueCount(refreshToken, mode === 'view')
  const fetching = query.isFetching

  React.useEffect(() => {
    onRefreshStateChange?.(fetching)
  }, [fetching, onRefreshStateChange])

  if (mode === 'settings') {
    return <p className="text-muted-foreground text-sm">{t('enrolment.widgets.overdue.noSettings')}</p>
  }
  if (query.isError && !query.isFetching) {
    return (
      <ErrorMessage
        label={t('enrolment.widgets.overdue.error')}
        action={
          <Button type="button" variant="outline" size="sm" onClick={() => void query.refetch()}>
            {t('enrolment.club.actions.retry')}
          </Button>
        }
      />
    )
  }
  if (query.data === undefined) return <LoadingMessage label={t('enrolment.club.loading')} />

  const count = query.data
  return (
    <div className="space-y-3" data-testid="enrolment-widget-overdue">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          <span className="text-foreground mr-2 text-2xl font-semibold" data-testid="enrolment-widget-overdue-count">
            {count}
          </span>
          {t('enrolment.widgets.overdue.countLabel')}
        </p>
        <Link
          href={OVERDUE_HREF}
          className="text-primary text-sm font-medium underline-offset-4 hover:underline"
          data-testid="enrolment-widget-overdue-link"
        >
          {t('enrolment.widgets.overdue.openList')}
        </Link>
      </div>
      {count === 0 ? (
        <p className="bg-muted/50 text-muted-foreground rounded-md border px-3 py-4 text-center text-sm">
          {t('enrolment.widgets.overdue.empty')}
        </p>
      ) : null}
    </div>
  )
}

export default OverdueApplicationsWidget
