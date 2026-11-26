'use client'
// `/backend/activities/reports/declaration-share` — "Declarations in Vereino" (product brief Goals — the primary
// metric; D21; E27-S01, #818): per section of the caller's reach, the share of confirm-type answers and of training
// absences declared in Vereino, and the headline, from `GET /api/activities/reports/declaration-share`. The period is
// the last 28 days (default), a month or a range of up to 12 months. Counts and percentages only, no names; a section
// without a completed session reads "No completed sessions", never 0 %.
import * as React from 'react'
import { useQuery } from '@tanstack/react-query'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { readApiResultOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { useOrganizationScopeVersion } from '@open-mercato/shared/lib/frontend/useOrganizationScope'
import { monthRange } from '../lib/coach-units'
import { defaultSharePeriod, resolveSharePeriod, type SharePeriod } from '../lib/declaration-share'
import type { TableColumns } from './client-helpers'
import { TableLoadError, monthOf, useClubToday } from '@vereino/ui'

type Counts = { declared: number; total: number; percent: number | null }

export type DeclarationShareRow = {
  sectionId: string
  sectionName: string
  sessions: number
  confirm: Counts
  absence: Counts
  headline: Counts
}

export type DeclarationShareData = { from: string; to: string; timeZone: string; items: DeclarationShareRow[] }

type PeriodMode = 'last28' | 'month' | 'range'

type Translate = (key: string, params?: Record<string, string | number>) => string

export function declarationShareUrl(period: SharePeriod | null): string {
  if (!period) return '/api/activities/reports/declaration-share'
  const params = new URLSearchParams({ from: period.from, to: period.to })
  return `/api/activities/reports/declaration-share?${params.toString()}`
}

function countsText(t: Translate, key: string, counts: Counts): string {
  return t(key, { declared: counts.declared, total: counts.total, percent: counts.percent ?? 0 })
}

export type DeclarationShareKind = 'confirm' | 'absence' | 'headline'

/**
 * The text of one share of a section row, the same on the panel table and the coordinator's phone page (E27-S02, #819):
 * a section without a completed session reads "No completed sessions", never 0 %.
 */
export function declarationShareText(t: Translate, kind: DeclarationShareKind, row: DeclarationShareRow): string {
  const prefix = 'activities.reports.declarationShare'
  if (kind === 'confirm') {
    if (row.sessions === 0) return t(`${prefix}.noSessions`)
    if (row.confirm.total === 0) return t(`${prefix}.noConfirm`)
    return countsText(t, `${prefix}.confirmValue`, row.confirm)
  }
  if (kind === 'absence') {
    if (row.sessions === 0) return '—'
    if (row.absence.total === 0) return t(`${prefix}.noAbsences`)
    return countsText(t, `${prefix}.absenceValue`, row.absence)
  }
  if (row.headline.total === 0) return '—'
  return countsText(t, `${prefix}.headlineValue`, row.headline)
}

function buildColumns(t: Translate): TableColumns<DeclarationShareRow> {
  const prefix = 'activities.reports.declarationShare'
  const cell = (kind: DeclarationShareKind): TableColumns<DeclarationShareRow>[number]['cell'] =>
    function ShareCell({ row }) {
      return (
        <span className="tabular-nums" data-testid={`declaration-share-${kind}-${row.original.sectionId}`}>
          {declarationShareText(t, kind, row.original)}
        </span>
      )
    }
  return [
    {
      accessorKey: 'sectionName',
      header: t(`${prefix}.columns.section`),
      cell: ({ row }) => <span className="font-medium">{row.original.sectionName}</span>,
    },
    { id: 'confirm', meta: { truncate: false }, header: t(`${prefix}.columns.confirm`), cell: cell('confirm') },
    { id: 'absence', meta: { truncate: false }, header: t(`${prefix}.columns.absence`), cell: cell('absence') },
    { id: 'headline', meta: { truncate: false }, header: t(`${prefix}.columns.headline`), cell: cell('headline') },
  ]
}

export function DeclarationShareReport() {
  const t = useT()
  const today = useClubToday()
  const scopeVersion = useOrganizationScopeVersion()
  const [mode, setMode] = React.useState<PeriodMode>('last28')
  const [month, setMonth] = React.useState(() => monthOf(today))
  const [range, setRange] = React.useState<SharePeriod>(() => defaultSharePeriod(today))

  const period: SharePeriod | null =
    mode === 'last28'
      ? defaultSharePeriod(today)
      : mode === 'month'
        ? monthRange(month)
        : // Both days are required here: two empty fields are no range (the API would answer the last 28 days).
          range.from && range.to
          ? resolveSharePeriod(range, today)
          : null
  const periodInvalid = period === null
  const query = mode === 'last28' ? null : period

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['activities-declaration-share', query?.from, query?.to, scopeVersion],
    queryFn: () => readApiResultOrThrow<DeclarationShareData>(declarationShareUrl(query)),
    enabled: !periodInvalid,
  })
  const columns = React.useMemo(() => buildColumns(t), [t])

  const toolbar = (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <Label htmlFor="declaration-share-mode">{t('activities.reports.declarationShare.filters.period')}</Label>
        <Select
          value={mode}
          onValueChange={(value) => {
            setMode(value as PeriodMode)
          }}
        >
          <SelectTrigger id="declaration-share-mode" className="w-48" data-testid="declaration-share-mode">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="last28">{t('activities.reports.declarationShare.filters.last28')}</SelectItem>
            <SelectItem value="month">{t('activities.reports.declarationShare.filters.month')}</SelectItem>
            <SelectItem value="range">{t('activities.reports.declarationShare.filters.range')}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {mode === 'month' ? (
        <div className="flex flex-col gap-1">
          <Label htmlFor="declaration-share-month">{t('activities.reports.declarationShare.filters.month')}</Label>
          <Input
            id="declaration-share-month"
            type="month"
            value={month}
            onChange={(event) => {
              if (monthRange(event.target.value)) setMonth(event.target.value)
            }}
            className="w-40"
            data-testid="declaration-share-month"
          />
        </div>
      ) : null}
      {mode === 'range' ? (
        <>
          <div className="flex flex-col gap-1">
            <Label htmlFor="declaration-share-from">{t('activities.reports.declarationShare.filters.from')}</Label>
            <Input
              id="declaration-share-from"
              type="date"
              value={range.from}
              onChange={(event) => {
                setRange((value) => ({ ...value, from: event.target.value }))
              }}
              className="w-44"
              data-testid="declaration-share-from"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="declaration-share-to">{t('activities.reports.declarationShare.filters.to')}</Label>
            <Input
              id="declaration-share-to"
              type="date"
              value={range.to}
              onChange={(event) => {
                setRange((value) => ({ ...value, to: event.target.value }))
              }}
              className="w-44"
              data-testid="declaration-share-to"
            />
          </div>
        </>
      ) : null}
    </div>
  )

  return (
    <div className="flex flex-col gap-4">
      <p className="text-muted-foreground text-sm">{t('activities.reports.declarationShare.description')}</p>
      {periodInvalid ? (
        <p role="alert" className="text-destructive text-sm" data-testid="declaration-share-period-invalid">
          {t('activities.reports.declarationShare.periodInvalid')}
        </p>
      ) : data ? (
        <p className="text-sm" data-testid="declaration-share-period">
          {t('activities.reports.declarationShare.period', { from: data.from, to: data.to })}
        </p>
      ) : null}
      <DataTable<DeclarationShareRow>
        title={t('activities.reports.declarationShare.title')}
        columns={columns}
        data={periodInvalid ? [] : (data?.items ?? [])}
        toolbar={toolbar}
        isLoading={isLoading && !periodInvalid}
        error={
          error ? (
            <TableLoadError
              message={t('activities.reports.declarationShare.errors.load')}
              retryLabel={t('activities.common.retry')}
              onRetry={() => void refetch()}
            />
          ) : null
        }
        emptyState={
          periodInvalid ? null : (
            <p data-testid="declaration-share-empty">{t('activities.reports.declarationShare.empty')}</p>
          )
        }
        disableRowClick
      />
    </div>
  )
}
