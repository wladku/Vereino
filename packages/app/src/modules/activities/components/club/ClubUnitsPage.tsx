'use client'
// `/club/coach/units` — "My units" (README B-16 for the coach, the phone rule of 2026-11-03; #96): the coach's own row
// of the month's coach units report from `GET /api/activities/reports/coach-units?mine=1` — planned, handed over,
// taken over, balance, matches and away trips, with the sessions behind them — and never an amount. Previous / next
// month; "No closed sessions this month" when the coach closed none; a warning counts the month's sessions still
// waiting for their attendance list. Reached from More → My units.
import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { Alert } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { shiftMonth } from '../../lib/coach-units'
import { OWN_FORBIDDEN_STATE } from '../client-helpers'
import { CoachUnitsSessions, coachUnitsUrl, type CoachUnitsReportData } from '../coach-units-client'
import { ActivitiesClubFrame } from './ActivitiesClubFrame'

type Translate = (key: string, params?: Record<string, string | number>) => string

function currentMonth(): string {
  const now = new Date()
  return `${String(now.getFullYear())}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

/** "November 2026" in the user's locale. */
function monthLabel(month: string, locale: string): string {
  const [year, monthNumber] = month.split('-').map(Number)
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year, monthNumber - 1, 1)),
  )
}

type Answer = { status: 'ok'; report: CoachUnitsReportData } | { status: 'forbidden' }

function useMyUnits(month: string) {
  return useQuery({
    queryKey: ['activities-my-units', month],
    queryFn: async (): Promise<Answer> => {
      const call = await apiCall<CoachUnitsReportData>(coachUnitsUrl({ month, mine: true }), OWN_FORBIDDEN_STATE)
      if (call.status === 403) return { status: 'forbidden' }
      if (!call.ok || !call.result) throw new Error(String(call.status))
      return { status: 'ok', report: call.result }
    },
  })
}

function Stat({ label, value, testId }: { label: string; value: number; testId: string }) {
  return (
    <div className="bg-muted/40 flex flex-col gap-1 rounded-md p-3">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-2xl font-semibold tabular-nums" data-testid={testId}>
        {value}
      </dd>
    </div>
  )
}

function MyUnits({ t }: { t: Translate }) {
  const locale = useLocale()
  const [month, setMonth] = React.useState(currentMonth)
  const query = useMyUnits(month)
  const row = query.data?.status === 'ok' ? query.data.report.items[0] : undefined

  let body: React.ReactNode
  if (!query.data && query.isFetching) {
    body = <LoadingMessage label={t('activities.club.units.loading')} />
  } else if (!query.data) {
    body = (
      <ErrorMessage
        label={t('activities.club.units.errors.load')}
        action={
          <Button type="button" variant="outline" className="min-h-11" onClick={() => void query.refetch()}>
            {t('activities.club.actions.retry')}
          </Button>
        }
      />
    )
  } else if (query.data.status === 'forbidden') {
    body = <Alert status="warning">{t('activities.club.units.forbidden')}</Alert>
  } else if (!row) {
    body = (
      <p className="text-muted-foreground" data-testid="club-units-empty">
        {t('activities.reports.coachUnits.empty')}
      </p>
    )
  } else {
    body = (
      <div className="flex flex-col gap-4">
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat
            label={t('activities.reports.coachUnits.columns.planned')}
            value={row.planned}
            testId="club-units-planned"
          />
          <Stat
            label={t('activities.reports.coachUnits.columns.handedOver')}
            value={row.handedOver}
            testId="club-units-handed-over"
          />
          <Stat
            label={t('activities.reports.coachUnits.columns.takenOver')}
            value={row.takenOver}
            testId="club-units-taken-over"
          />
          <Stat
            label={t('activities.reports.coachUnits.columns.balance')}
            value={row.balance}
            testId="club-units-balance"
          />
          <Stat
            label={t('activities.reports.coachUnits.columns.matches')}
            value={row.matches}
            testId="club-units-matches"
          />
          <Stat label={t('activities.reports.coachUnits.columns.trips')} value={row.trips} testId="club-units-trips" />
        </dl>
        <CoachUnitsSessions row={row} t={t} locale={locale} />
      </div>
    )
  }

  const unsettled = query.data?.status === 'ok' ? query.data.report.unsettledCount : 0
  return (
    <section className="flex flex-col gap-4" aria-labelledby="club-units-heading">
      <h1 id="club-units-heading" className="text-xl font-semibold">
        {t('activities.club.units.title')}
      </h1>
      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="outline"
          className="min-h-11 min-w-11"
          aria-label={t('activities.reports.coachUnits.previousMonth')}
          onClick={() => {
            setMonth((value) => shiftMonth(value, -1))
          }}
        >
          ‹
        </Button>
        <p className="font-medium capitalize" aria-live="polite" data-testid="club-units-month">
          {monthLabel(month, locale)}
        </p>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 min-w-11"
          aria-label={t('activities.reports.coachUnits.nextMonth')}
          onClick={() => {
            setMonth((value) => shiftMonth(value, 1))
          }}
        >
          ›
        </Button>
      </div>
      {unsettled > 0 ? (
        <Alert status="warning" data-testid="club-units-unsettled">
          {t('activities.reports.coachUnits.unsettled', { count: unsettled })}
        </Alert>
      ) : null}
      {body}
    </section>
  )
}

export function ClubUnitsPage() {
  const t = useT()
  return <ActivitiesClubFrame>{() => <MyUnits t={t} />}</ActivitiesClubFrame>
}
