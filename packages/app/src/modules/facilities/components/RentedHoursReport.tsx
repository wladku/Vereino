'use client'
// `/backend/facilities/reports/rented-hours` — "Rented hours" (facilities spec REQ-038, AC-038, the rented-hours row
// of *UI*; #129): for a month or quarter and all rented places or one, from `GET /api/facilities/reports/rented-hours`
// — the hours of done sessions per place and month, then per group and coach, so that the club can check the owner's
// bill. "Export CSV" downloads the same figures. Empty states: "No places flagged as rented" and no sessions.
import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { readApiResultOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { Alert } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import { EmptyState } from '@open-mercato/ui/primitives/empty-state'
import { Label } from '@open-mercato/ui/primitives/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { useOrganizationScopeVersion } from '@open-mercato/shared/lib/frontend/useOrganizationScope'
import { presetPeriod, shiftPeriod } from '../lib/owner-report'
import type { RentedHoursReport as Report, RentedHoursRow, RentedHoursTotal } from '../lib/rented-hours'
import { ALL_PLACES, PlaceSelect } from './FacilitiesControls'
import { codedMessage, localToday, type TableColumns, type Translate } from './facilities-client'

type PeriodKind = 'month' | 'quarter'

function reportUrl(query: { placeId: string; from: string; to: string; format?: 'csv' }): string {
  const params = new URLSearchParams({ from: query.from, to: query.to })
  if (query.placeId !== ALL_PLACES) params.set('placeId', query.placeId)
  if (query.format) params.set('format', query.format)
  return `/api/facilities/reports/rented-hours?${params.toString()}`
}

function formatHours(hours: number, locale: string): string {
  return new Intl.NumberFormat(locale, { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(hours)
}

/** `2026-11` as "November 2026" in the user's language. */
function monthLabel(month: string, locale: string): string {
  const [year, value] = month.split('-').map(Number)
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year, value - 1, 1)),
  )
}

function placeMonthColumns<T extends RentedHoursTotal>(t: Translate, locale: string): TableColumns<T> {
  return [
    {
      id: 'place',
      header: t('facilities.reports.rentedHours.columns.place'),
      enableSorting: false,
      meta: { priority: 1 },
      cell: ({ row }) => <span className="font-medium">{row.original.placeName}</span>,
    },
    {
      id: 'month',
      header: t('facilities.reports.rentedHours.columns.month'),
      enableSorting: false,
      meta: { priority: 1 },
      cell: ({ row }) => <span className="whitespace-nowrap">{monthLabel(row.original.month, locale)}</span>,
    },
  ]
}

function figureColumns<T extends RentedHoursTotal>(t: Translate, locale: string): TableColumns<T> {
  return [
    {
      id: 'sessions',
      header: t('facilities.reports.rentedHours.columns.sessions'),
      enableSorting: false,
      meta: { priority: 2 },
      cell: ({ row }) => <span className="tabular-nums">{String(row.original.sessions)}</span>,
    },
    {
      id: 'hours',
      header: t('facilities.reports.rentedHours.columns.hours'),
      enableSorting: false,
      meta: { priority: 1 },
      cell: ({ row }) => (
        <span className="tabular-nums" data-testid="rented-hours-cell">
          {t('facilities.reports.owner.hours', { hours: formatHours(row.original.hours, locale) })}
        </span>
      ),
    },
  ]
}

function totalColumns(t: Translate, locale: string): TableColumns<RentedHoursTotal> {
  return [...placeMonthColumns<RentedHoursTotal>(t, locale), ...figureColumns<RentedHoursTotal>(t, locale)]
}

function rowColumns(t: Translate, locale: string): TableColumns<RentedHoursRow> {
  return [
    ...placeMonthColumns<RentedHoursRow>(t, locale),
    {
      id: 'group',
      header: t('facilities.reports.rentedHours.columns.group'),
      enableSorting: false,
      meta: { priority: 2 },
      cell: ({ row }) => row.original.groupName ?? t('facilities.reports.rentedHours.unknownGroup'),
    },
    {
      id: 'coach',
      header: t('facilities.reports.rentedHours.columns.coach'),
      enableSorting: false,
      meta: { priority: 3 },
      cell: ({ row }) => row.original.coachName ?? t('facilities.reports.rentedHours.noCoach'),
    },
    ...figureColumns<RentedHoursRow>(t, locale),
  ]
}

export function RentedHoursReport() {
  const t = useT()
  const locale = useLocale()
  const scopeVersion = useOrganizationScopeVersion()
  const [placeId, setPlaceId] = React.useState(ALL_PLACES)
  const [kind, setKind] = React.useState<PeriodKind>('month')
  const [period, setPeriod] = React.useState(() => presetPeriod('month', localToday()))

  const { data, isLoading, error } = useQuery({
    queryKey: ['facilities-rented-hours', placeId, period.from, period.to, scopeVersion],
    queryFn: () => readApiResultOrThrow<Report>(reportUrl({ placeId, ...period })),
  })
  const totals = React.useMemo(() => totalColumns(t, locale), [t, locale])
  const rows = React.useMemo(() => rowColumns(t, locale), [t, locale])
  const placeOptions = React.useMemo(
    () => (data?.places ?? []).map((place) => ({ value: place.id, label: place.name })),
    [data?.places],
  )
  const noPlaces = data !== undefined && data.places.length === 0

  const filters = (
    <div className="flex flex-wrap items-end gap-3">
      <PlaceSelect
        options={placeOptions}
        value={placeId}
        onChange={setPlaceId}
        allowAll
        disabled={noPlaces}
        testId="rented-hours-place"
      />
      <div className="flex flex-col gap-1">
        <Label htmlFor="rented-hours-kind">{t('facilities.reports.owner.periodKind')}</Label>
        <Select
          value={kind}
          onValueChange={(value) => {
            const next = value === 'quarter' ? 'quarter' : 'month'
            setKind(next)
            setPeriod(presetPeriod(next, period.from))
          }}
        >
          <SelectTrigger id="rented-hours-kind" className="w-40" data-testid="rented-hours-kind">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="month">{t('facilities.reports.owner.month')}</SelectItem>
            <SelectItem value="quarter">{t('facilities.reports.owner.quarter')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          aria-label={t('facilities.reports.owner.previous')}
          onClick={() => {
            setPeriod(shiftPeriod(kind, period.from, -1))
          }}
        >
          ‹
        </Button>
        <span
          className="min-w-48 px-2 text-center text-sm tabular-nums"
          data-testid="rented-hours-period"
          aria-live="polite"
        >
          {t('facilities.reports.owner.periodRange', { from: period.from, to: period.to })}
        </span>
        <Button
          type="button"
          variant="outline"
          aria-label={t('facilities.reports.owner.next')}
          onClick={() => {
            setPeriod(shiftPeriod(kind, period.from, 1))
          }}
        >
          ›
        </Button>
      </div>
    </div>
  )

  const exportAction = noPlaces ? null : (
    <Button asChild variant="outline">
      <a href={reportUrl({ placeId, ...period, format: 'csv' })} download data-testid="rented-hours-export">
        {t('facilities.reports.owner.export')}
      </a>
    </Button>
  )

  let body: React.ReactNode
  if (error) {
    body = (
      <Alert status="error" data-testid="rented-hours-error">
        {codedMessage(error, t) ?? t('facilities.reports.owner.errors.load')}
      </Alert>
    )
  } else if (isLoading || !data) {
    body = (
      <p className="text-muted-foreground text-sm" data-testid="rented-hours-loading">
        {t('facilities.common.loading')}
      </p>
    )
  } else if (noPlaces) {
    body = (
      <div data-testid="rented-hours-no-places">
        <EmptyState
          title={t('facilities.reports.rentedHours.noPlaces')}
          description={t('facilities.reports.rentedHours.noPlacesHint')}
        />
      </div>
    )
  } else if (data.rows.length === 0) {
    body = (
      <div data-testid="rented-hours-empty">
        <EmptyState title={t('facilities.reports.rentedHours.empty')} />
      </div>
    )
  } else {
    body = (
      <div className="flex flex-col gap-4">
        <div data-testid="rented-hours-totals">
          <DataTable<RentedHoursTotal>
            title={t('facilities.reports.rentedHours.totals')}
            columns={totals}
            data={data.totals}
            disableRowClick
          />
        </div>
        <div data-testid="rented-hours-rows">
          <DataTable<RentedHoursRow>
            title={t('facilities.reports.rentedHours.byGroup')}
            columns={rows}
            data={data.rows}
            disableRowClick
          />
        </div>
      </div>
    )
  }

  return (
    <section className="flex flex-col gap-4" data-testid="rented-hours-report">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">{t('facilities.reports.rentedHours.title')}</h1>
          <p className="text-muted-foreground text-sm">{t('facilities.reports.rentedHours.subtitle')}</p>
        </div>
        {exportAction}
      </div>
      {filters}
      {body}
    </section>
  )
}
