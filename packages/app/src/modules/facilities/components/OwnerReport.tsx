'use client'
// `/backend/facilities/reports/owner` — "Municipality report" (facilities spec REQ-015, AC-015; README B-28, flow F-12;
// #127): for a facility and a month or quarter, from `GET /api/facilities/reports/owner` — KPI cards for the scheduled
// hours of each zone with the club time that fell in it, the club time (sessions and internal bookings), the rentals
// (count and value), the payments to the municipality's account with their source, incidents and maintenance done —
// then the period's rentals. "Export CSV" downloads the same figures. Empty state "No data for this period".
import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { readApiResultOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { Alert } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import { Card, CardContent, CardHeader, CardTitle } from '@open-mercato/ui/primitives/card'
import { EmptyState } from '@open-mercato/ui/primitives/empty-state'
import { Label } from '@open-mercato/ui/primitives/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { useOrganizationScopeVersion } from '@open-mercato/shared/lib/frontend/useOrganizationScope'
import { ownerReportEmpty, presetPeriod, shiftPeriod, type OwnerReport as Report } from '../lib/owner-report'
import { ZONES } from '../lib/zones'
import { PlaceSelect } from './FacilitiesControls'
import {
  codedMessage,
  localToday,
  usePlaceOptions,
  zoneLabel,
  type TableColumns,
  type Translate,
} from './facilities-client'
import { rentalStatusLabel, rentalStatusVariant, slotLabel } from './rentals-client'

type PeriodKind = 'month' | 'quarter'
type RentalRow = Report['rentals']['items'][number]

function reportUrl(query: { placeId: string; from: string; to: string; format?: 'csv' }): string {
  const params = new URLSearchParams({ placeId: query.placeId, from: query.from, to: query.to })
  if (query.format) params.set('format', query.format)
  return `/api/facilities/reports/owner?${params.toString()}`
}

function formatHours(hours: number, locale: string): string {
  return new Intl.NumberFormat(locale, { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(hours)
}

function formatMoney(minor: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(minor / 100)
}

function buildColumns(t: Translate, currency: string, locale: string): TableColumns<RentalRow> {
  return [
    {
      id: 'slot',
      header: t('facilities.reports.owner.columns.slot'),
      enableSorting: false,
      meta: { priority: 1 },
      cell: ({ row }) => (
        <span className="whitespace-nowrap tabular-nums">{slotLabel(row.original.start, row.original.end)}</span>
      ),
    },
    {
      id: 'renter',
      header: t('facilities.reports.owner.columns.renter'),
      enableSorting: false,
      meta: { priority: 1 },
      cell: ({ row }) => <span className="font-medium">{row.original.renter}</span>,
    },
    {
      id: 'units',
      header: t('facilities.reports.owner.columns.units'),
      enableSorting: false,
      meta: { priority: 3 },
      cell: ({ row }) => <span className="tabular-nums">{String(row.original.units)}</span>,
    },
    {
      id: 'amount',
      header: t('facilities.reports.owner.columns.amount'),
      enableSorting: false,
      meta: { priority: 2 },
      cell: ({ row }) => <span className="tabular-nums">{formatMoney(row.original.amount, currency, locale)}</span>,
    },
    {
      id: 'status',
      header: t('facilities.reports.owner.columns.status'),
      enableSorting: false,
      meta: { priority: 2 },
      cell: ({ row }) => (
        <StatusBadge variant={rentalStatusVariant(row.original.status)}>
          {rentalStatusLabel(t, row.original.status)}
        </StatusBadge>
      ),
    },
  ]
}

function Kpi({ label, value, note, testId }: { label: string; value: string; note?: string; testId: string }) {
  return (
    <Card data-testid={testId}>
      <CardHeader className="pb-2">
        <CardTitle className="text-muted-foreground text-sm font-normal">{label}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        <span className="text-2xl font-semibold tabular-nums" data-testid={`${testId}-value`}>
          {value}
        </span>
        {note ? <span className="text-muted-foreground text-xs">{note}</span> : null}
      </CardContent>
    </Card>
  )
}

function ReportKpis({ report, t, locale }: { report: Report; t: Translate; locale: string }) {
  const hours = (value: number) => t('facilities.reports.owner.hours', { hours: formatHours(value, locale) })
  const money = (value: number) => formatMoney(value, report.currency, locale)
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="owner-report-kpis">
      {ZONES.map((zone) => (
        <Kpi
          key={zone}
          testId={`owner-report-zone-${zone}`}
          label={zoneLabel(t, zone)}
          value={hours(report.zoneHours[zone])}
          note={t('facilities.reports.owner.clubTimeInZone', {
            hours: formatHours(report.clubTime.byZone[zone], locale),
          })}
        />
      ))}
      <Kpi
        testId="owner-report-club-time"
        label={t('facilities.reports.owner.clubTime')}
        value={hours(report.clubTime.total)}
        note={t('facilities.reports.owner.clubTimeSplit', {
          sessions: formatHours(report.clubTime.sessions, locale),
          bookings: formatHours(report.clubTime.bookings, locale),
          none: formatHours(report.clubTime.byZone.none, locale),
        })}
      />
      <Kpi
        testId="owner-report-rentals"
        label={t('facilities.reports.owner.rentals')}
        value={String(report.rentals.count)}
        note={t('facilities.reports.owner.rentalsValue', { amount: money(report.rentals.value) })}
      />
      <Kpi
        testId="owner-report-payments"
        label={t('facilities.reports.owner.payments')}
        value={money(report.payments.amount)}
        note={t(`facilities.reports.owner.paymentsSource.${report.payments.source}`, {
          count: report.payments.count,
        })}
      />
      <Kpi
        testId="owner-report-incidents"
        label={t('facilities.reports.owner.incidents')}
        value={String(report.incidents.count)}
      />
      <Kpi
        testId="owner-report-maintenance"
        label={t('facilities.reports.owner.maintenance')}
        value={String(report.maintenance.done)}
        note={t('facilities.reports.owner.maintenanceCost', { amount: money(report.maintenance.cost) })}
      />
    </div>
  )
}

export function OwnerReport() {
  const t = useT()
  const locale = useLocale()
  const scopeVersion = useOrganizationScopeVersion()
  const places = usePlaceOptions()
  const [placeId, setPlaceId] = React.useState('')
  const [kind, setKind] = React.useState<PeriodKind>('month')
  const [period, setPeriod] = React.useState(() => presetPeriod('month', localToday()))
  const chosenPlace = placeId || places.options[0]?.value || ''

  const { data, isLoading, error } = useQuery({
    queryKey: ['facilities-owner-report', chosenPlace, period.from, period.to, scopeVersion],
    enabled: chosenPlace !== '',
    queryFn: () => readApiResultOrThrow<Report>(reportUrl({ placeId: chosenPlace, ...period })),
  })
  const columns = React.useMemo(() => buildColumns(t, data?.currency ?? 'PLN', locale), [t, data?.currency, locale])
  const periodLabel = t('facilities.reports.owner.periodRange', { from: period.from, to: period.to })

  const filters = (
    <div className="flex flex-wrap items-end gap-3">
      <PlaceSelect
        options={places.options}
        value={chosenPlace}
        onChange={setPlaceId}
        disabled={places.options.length === 0}
        testId="owner-report-place"
      />
      <div className="flex flex-col gap-1">
        <Label htmlFor="owner-report-kind">{t('facilities.reports.owner.periodKind')}</Label>
        <Select
          value={kind}
          onValueChange={(value) => {
            const next = value === 'quarter' ? 'quarter' : 'month'
            setKind(next)
            setPeriod(presetPeriod(next, period.from))
          }}
        >
          <SelectTrigger id="owner-report-kind" className="w-40" data-testid="owner-report-kind">
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
          data-testid="owner-report-period"
          aria-live="polite"
        >
          {periodLabel}
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

  const exportAction = chosenPlace ? (
    <Button asChild variant="outline">
      <a
        href={reportUrl({ placeId: chosenPlace, ...period, format: 'csv' })}
        download
        data-testid="owner-report-export"
      >
        {t('facilities.reports.owner.export')}
      </a>
    </Button>
  ) : null

  let body: React.ReactNode = null
  if (!places.isLoading && places.options.length === 0) {
    body = <EmptyState title={t('facilities.reports.owner.noPlaces')} />
  } else if (error) {
    body = (
      <Alert status="error" data-testid="owner-report-error">
        {codedMessage(error, t) ?? t('facilities.reports.owner.errors.load')}
      </Alert>
    )
  } else if (isLoading || places.isLoading || !data) {
    body = (
      <p className="text-muted-foreground text-sm" data-testid="owner-report-loading">
        {t('facilities.common.loading')}
      </p>
    )
  } else if (ownerReportEmpty(data)) {
    body = (
      <div data-testid="owner-report-empty">
        <EmptyState title={t('facilities.reports.owner.empty')} description={t('facilities.reports.owner.emptyHint')} />
      </div>
    )
  } else {
    body = (
      <div className="flex flex-col gap-4">
        <ReportKpis report={data} t={t} locale={locale} />
        <DataTable<RentalRow>
          title={t('facilities.reports.owner.rentalsInPeriod')}
          columns={columns}
          data={data.rentals.items}
          disableRowClick
          emptyState={<p data-testid="owner-report-rentals-empty">{t('facilities.reports.owner.noRentals')}</p>}
        />
      </div>
    )
  }

  return (
    <section className="flex flex-col gap-4" data-testid="owner-report">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">{t('facilities.reports.owner.title')}</h1>
          <p className="text-muted-foreground text-sm">{t('facilities.reports.owner.subtitle')}</p>
        </div>
        {exportAction}
      </div>
      {filters}
      {body}
    </section>
  )
}
