'use client'
// `/backend/activities/occurrences` — "Sessions" (club spec UI table, REQ-005, REQ-006): the sessions in the caller's
// record scope in date order, with server filters status, date range (slot dates), section, group and "needs
// reschedule"; the session status, "moved" (detached from its series) and "needs reschedule" (a generated session over
// a conflict) as badges. Each row opens the session. `ActivitySessions` is the same list for one activity (the
// "Sessions" tab of its record).
import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import type { FilterDef, FilterValues } from '@open-mercato/ui/backend/FilterOverlay'
import { RowActions } from '@open-mercato/ui/backend/RowActions'
import { fetchCrudList } from '@open-mercato/ui/backend/utils/crud'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { useOrganizationScopeVersion } from '@open-mercato/shared/lib/frontend/useOrganizationScope'
import { OCCURRENCE_STATUSES } from '../lib/activities-rules'
import {
  dateLabel,
  errorMessage,
  groupOptions,
  occurrenceHref,
  sectionOptions,
  statusLabel,
  statusVariant,
  timeRangeOfInstants,
  tolerant,
  type OccurrenceRow,
  type TableColumns,
  type Translate,
} from './client-helpers'

const PAGE_SIZE = 50

/** The status badge and the "moved" / "needs reschedule" flags of a session. */
export function OccurrenceBadges({ row, t }: { row: OccurrenceRow; t: Translate }) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      <StatusBadge variant={statusVariant(row.status)}>{statusLabel(t, row.status)}</StatusBadge>
      {row.isDetached ? <StatusBadge variant="info">{t('activities.occurrences.flags.moved')}</StatusBadge> : null}
      {row.needsReschedule ? (
        <StatusBadge variant="warning">{t('activities.occurrences.flags.needsReschedule')}</StatusBadge>
      ) : null}
    </span>
  )
}

function buildColumns(t: Translate, withActivity: boolean): TableColumns<OccurrenceRow> {
  const dash = <span className="text-muted-foreground">—</span>
  const columns: TableColumns<OccurrenceRow> = [
    {
      id: 'date',
      header: t('activities.occurrences.columns.date'),
      enableSorting: false,
      meta: { priority: 1 },
      cell: ({ row }) => (
        <Link
          className="font-medium whitespace-nowrap underline-offset-4 hover:underline"
          href={occurrenceHref(row.original.id)}
        >
          {dateLabel(t, row.original.occurrenceDate)}
        </Link>
      ),
    },
    {
      id: 'time',
      header: t('activities.occurrences.columns.time'),
      enableSorting: false,
      meta: { priority: 2 },
      cell: ({ row }) => (
        <span className="whitespace-nowrap">{timeRangeOfInstants(row.original.startAt, row.original.endAt)}</span>
      ),
    },
  ]
  if (withActivity) {
    columns.push(
      {
        accessorKey: 'activityName',
        header: t('activities.occurrences.columns.activity'),
        enableSorting: false,
        meta: { priority: 2 },
        cell: ({ row }) => row.original.activityName ?? dash,
      },
      {
        accessorKey: 'groupName',
        header: t('activities.occurrences.columns.group'),
        enableSorting: false,
        meta: { priority: 4 },
        cell: ({ row }) => row.original.groupName ?? dash,
      },
    )
  }
  columns.push(
    {
      accessorKey: 'placeName',
      header: t('activities.occurrences.columns.place'),
      enableSorting: false,
      meta: { priority: 5 },
      cell: ({ row }) => row.original.placeName ?? dash,
    },
    {
      accessorKey: 'coachName',
      header: t('activities.occurrences.columns.coach'),
      enableSorting: false,
      meta: { priority: 6 },
      cell: ({ row }) => row.original.coachName ?? dash,
    },
    {
      accessorKey: 'status',
      header: t('activities.occurrences.columns.status'),
      enableSorting: false,
      meta: { priority: 3 },
      cell: ({ row }) => <OccurrenceBadges row={row.original} t={t} />,
    },
  )
  return columns
}

/** The list query parameters of the applied filters (`GET /api/activities/occurrences`). */
function filterParams(values: FilterValues): Record<string, string> {
  const params: Record<string, string> = {}
  for (const key of ['status', 'sectionId', 'groupId'] as const) {
    const value: unknown = values[key]
    if (typeof value === 'string' && value) params[key] = value
  }
  const range: unknown = values.dates
  if (range && typeof range === 'object') {
    const { from, to } = range as { from?: unknown; to?: unknown }
    if (typeof from === 'string' && from) params.from = from
    if (typeof to === 'string' && to) params.to = to
  }
  if (values.needsReschedule === true) params.needsReschedule = 'true'
  return params
}

function useOccurrenceRowActions(t: Translate) {
  return React.useCallback(
    (row: OccurrenceRow) => (
      <RowActions items={[{ id: 'open', label: t('activities.common.open'), href: occurrenceHref(row.id) }]} />
    ),
    [t],
  )
}

export function OccurrencesTable() {
  const t = useT()
  const router = useRouter()
  const scopeVersion = useOrganizationScopeVersion()
  const [filters, setFilters] = React.useState<FilterValues>({})
  const [page, setPage] = React.useState(1)
  const rowActions = useOccurrenceRowActions(t)

  const { data, isLoading, error } = useQuery({
    queryKey: ['activities-occurrences', filters, page, scopeVersion],
    queryFn: () =>
      fetchCrudList<OccurrenceRow>('activities/occurrences', {
        page,
        pageSize: PAGE_SIZE,
        sortField: 'startAt',
        sortDir: 'asc',
        ...filterParams(filters),
      }),
  })

  const columns = React.useMemo(() => buildColumns(t, true), [t])
  const filterDefs = React.useMemo<FilterDef[]>(
    () => [
      {
        id: 'status',
        label: t('activities.occurrences.filters.status'),
        type: 'select',
        options: OCCURRENCE_STATUSES.map((status) => ({ value: status, label: statusLabel(t, status) })),
      },
      { id: 'dates', label: t('activities.occurrences.filters.dates'), type: 'dateRange' },
      {
        id: 'sectionId',
        label: t('activities.occurrences.filters.section'),
        type: 'select',
        loadOptions: tolerant(sectionOptions),
      },
      {
        id: 'groupId',
        label: t('activities.occurrences.filters.group'),
        type: 'select',
        loadOptions: tolerant(() => groupOptions(false)),
      },
      { id: 'needsReschedule', label: t('activities.occurrences.filters.needsReschedule'), type: 'checkbox' },
    ],
    [t],
  )

  return (
    <DataTable<OccurrenceRow>
      title={t('activities.occurrences.title')}
      titleHeadingLevel={1}
      entityId="activities:occurrence"
      extensionTableId="activities.occurrences"
      columns={columns}
      data={data?.items ?? []}
      isLoading={isLoading}
      error={error ? errorMessage(error, t('activities.occurrences.errors.load')) : null}
      emptyState={<p className="text-muted-foreground text-sm">{t('activities.occurrences.empty')}</p>}
      filters={filterDefs}
      filterValues={filters}
      onFiltersApply={(values: FilterValues) => {
        setFilters(values)
        setPage(1)
      }}
      onFiltersClear={() => {
        setFilters({})
        setPage(1)
      }}
      rowActions={rowActions}
      onRowClick={(row: OccurrenceRow) => {
        router.push(occurrenceHref(row.id))
      }}
      pagination={{
        page,
        pageSize: PAGE_SIZE,
        total: data?.total ?? 0,
        totalPages: data?.totalPages ?? 0,
        onPageChange: setPage,
      }}
    />
  )
}

export function ActivitySessions({ activityId }: { activityId: string }) {
  const t = useT()
  const router = useRouter()
  const [page, setPage] = React.useState(1)
  const rowActions = useOccurrenceRowActions(t)
  const { data, isLoading, error } = useQuery({
    queryKey: ['activities-occurrences', 'activity', activityId, page],
    queryFn: () =>
      fetchCrudList<OccurrenceRow>('activities/occurrences', {
        activityId,
        page,
        pageSize: PAGE_SIZE,
        sortField: 'startAt',
        sortDir: 'asc',
      }),
  })
  const columns = React.useMemo(() => buildColumns(t, false), [t])
  return (
    <div className="min-w-0" data-testid="activities-sessions-table">
      <DataTable<OccurrenceRow>
        embedded
        title={t('activities.activities.record.sessions')}
        entityId="activities:occurrence"
        extensionTableId="activities.activity-sessions"
        columns={columns}
        data={data?.items ?? []}
        isLoading={isLoading}
        error={error ? errorMessage(error, t('activities.occurrences.errors.load')) : null}
        emptyState={<p className="text-muted-foreground text-sm">{t('activities.activities.record.sessionsEmpty')}</p>}
        rowActions={rowActions}
        onRowClick={(row: OccurrenceRow) => {
          router.push(occurrenceHref(row.id))
        }}
        pagination={{
          page,
          pageSize: PAGE_SIZE,
          total: data?.total ?? 0,
          totalPages: data?.totalPages ?? 0,
          onPageChange: setPage,
        }}
      />
    </div>
  )
}
