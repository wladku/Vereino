'use client'
// `/backend/activities/reports/coach-units` — "Coach units report" (club spec REQ-008, REQ-021, AC-021; README B-16;
// #96): the month's coach units per coach in the caller's sections, from `GET /api/activities/reports/coach-units`.
// Month (previous / next and a month field) and section filters; columns Coach, Planned, Handed over, Taken over,
// Balance, Matches, Away trips and — for the club administrator — Amount in the club's settlement model, which the
// header names, with a "No contract" or "Incomplete contract" badge instead of an amount; each row opens its "n
// sessions" list; a warning names the month's unsettled sessions, explains that they do not count until the coach
// closes the attendance list and links them to "Sessions → Unsettled"; "Export CSV" downloads the same rows with the
// headers in the user's language and the locale's separator (REQ-A06). The empty state is "No closed sessions this month".
import * as React from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { readApiResultOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { Alert, AlertDescription, AlertTitle } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { useOrganizationScopeVersion } from '@open-mercato/shared/lib/frontend/useOrganizationScope'
import { monthRange, shiftMonth } from '../lib/coach-units'
import { perspectiveHref } from '../lib/occurrence-list'
import { sectionOptions, type TableColumns } from './client-helpers'
import {
  CoachUnitsSessions,
  coachUnitsUrl,
  formatAmount,
  type CoachUnitsReportData,
  type CoachUnitsRow,
} from './coach-units-client'
import { TableLoadError, monthOf, StatusTag, useClubToday } from '@vereino/ui'

const ALL_SECTIONS = '__all'

function buildColumns(
  t: (key: string, params?: Record<string, string | number>) => string,
  report: CoachUnitsReportData | undefined,
  locale: string,
): TableColumns<CoachUnitsRow> {
  type CountKey = 'planned' | 'handedOver' | 'takenOver' | 'balance' | 'matches' | 'trips'
  const count = (key: CountKey, label: string) => ({
    accessorKey: key,
    header: label,
    cell: ({ row }: { row: { original: CoachUnitsRow } }) => <span>{String(row.original[key])}</span>,
  })
  const columns: TableColumns<CoachUnitsRow> = [
    {
      accessorKey: 'coachName',
      header: t('activities.reports.coachUnits.columns.coach'),
      cell: ({ row }) => <span className="font-medium">{row.original.coachName ?? '—'}</span>,
    },
    count('planned', t('activities.reports.coachUnits.columns.planned')),
    count('handedOver', t('activities.reports.coachUnits.columns.handedOver')),
    count('takenOver', t('activities.reports.coachUnits.columns.takenOver')),
    count('balance', t('activities.reports.coachUnits.columns.balance')),
    count('matches', t('activities.reports.coachUnits.columns.matches')),
    count('trips', t('activities.reports.coachUnits.columns.trips')),
  ]
  if (report?.withAmounts) {
    columns.push({
      accessorKey: 'amount',
      header: t('activities.reports.coachUnits.columns.amount'),
      cell: ({ row }) => {
        const { amount, contractState } = row.original
        if (contractState === 'no_contract') {
          return <StatusTag status="warning">{t('activities.reports.coachUnits.noContract')}</StatusTag>
        }
        if (amount === null || amount === undefined) {
          return <StatusTag status="warning">{t('activities.reports.coachUnits.incompleteContract')}</StatusTag>
        }
        return <span className="tabular-nums">{formatAmount(amount, report.currency, locale)}</span>
      },
    })
  }
  columns.push({
    id: 'sessions',
    header: t('activities.reports.coachUnits.columns.sessions'),
    cell: ({ row }) => <CoachUnitsSessions row={row.original} t={t} locale={locale} />,
  })
  return columns
}

export function CoachUnitsReport() {
  const t = useT()
  const locale = useLocale()
  const today = useClubToday()
  const scopeVersion = useOrganizationScopeVersion()
  const [month, setMonth] = React.useState(() => monthOf(today))
  const [sectionId, setSectionId] = React.useState<string>(ALL_SECTIONS)
  const section = sectionId === ALL_SECTIONS ? undefined : sectionId

  const sections = useQuery({
    queryKey: ['activities-report-sections', scopeVersion],
    queryFn: () => sectionOptions().catch(() => []),
  })
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['activities-coach-units', month, section, scopeVersion],
    queryFn: () => readApiResultOrThrow<CoachUnitsReportData>(coachUnitsUrl({ month, sectionId: section })),
    enabled: monthRange(month) !== null,
  })
  const columns = React.useMemo(() => buildColumns(t, data, locale), [t, data, locale])

  const toolbar = (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex items-end gap-1">
        <Button
          type="button"
          variant="outline"
          aria-label={t('activities.reports.coachUnits.previousMonth')}
          onClick={() => {
            setMonth((value) => shiftMonth(value, -1))
          }}
        >
          ‹
        </Button>
        <div className="flex flex-col gap-1">
          <Label htmlFor="coach-units-month">{t('activities.reports.coachUnits.filters.month')}</Label>
          <Input
            id="coach-units-month"
            type="month"
            value={month}
            onChange={(event) => {
              if (monthRange(event.target.value)) setMonth(event.target.value)
            }}
            className="w-40"
            data-testid="coach-units-month"
          />
        </div>
        <Button
          type="button"
          variant="outline"
          aria-label={t('activities.reports.coachUnits.nextMonth')}
          onClick={() => {
            setMonth((value) => shiftMonth(value, 1))
          }}
        >
          ›
        </Button>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="coach-units-section">{t('activities.reports.coachUnits.filters.section')}</Label>
        <Select value={sectionId} onValueChange={setSectionId}>
          <SelectTrigger id="coach-units-section" className="w-56" data-testid="coach-units-section">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_SECTIONS}>{t('activities.reports.coachUnits.filters.allSections')}</SelectItem>
            {(sections.data ?? []).map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )

  const actions = (
    <Button asChild variant="outline">
      <a href={coachUnitsUrl({ month, sectionId: section, format: 'csv' })} download data-testid="coach-units-export">
        {t('activities.reports.coachUnits.export')}
      </a>
    </Button>
  )

  return (
    <div className="flex flex-col gap-4">
      {data ? (
        <p className="text-muted-foreground text-sm" data-testid="coach-units-model">
          {t('activities.reports.coachUnits.model', {
            model: t(`activities.reports.coachUnits.models.${data.model}`),
          })}
        </p>
      ) : null}
      {data && data.unsettledCount > 0 ? (
        <Alert style="light" status="warning" data-testid="coach-units-unsettled">
          <AlertTitle>{t('activities.reports.coachUnits.unsettled', { count: data.unsettledCount })}</AlertTitle>
          <AlertDescription>
            {t('activities.reports.coachUnits.unsettledText')}{' '}
            <Link className="underline" href={perspectiveHref('/backend/activities/occurrences', 'unsettled')}>
              {t('activities.reports.coachUnits.unsettledLink')}
            </Link>
          </AlertDescription>
        </Alert>
      ) : null}
      <DataTable<CoachUnitsRow>
        title={t('activities.reports.coachUnits.title')}
        columns={columns}
        data={data?.items ?? []}
        toolbar={toolbar}
        actions={actions}
        isLoading={isLoading}
        error={
          error ? (
            <TableLoadError
              message={t('activities.reports.coachUnits.errors.load')}
              retryLabel={t('activities.common.retry')}
              onRetry={() => void refetch()}
            />
          ) : null
        }
        emptyState={<p data-testid="coach-units-empty">{t('activities.reports.coachUnits.empty')}</p>}
        disableRowClick
      />
    </div>
  )
}
