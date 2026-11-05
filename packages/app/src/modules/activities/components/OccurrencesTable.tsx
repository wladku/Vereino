'use client'
// `/backend/activities/occurrences` — "Sessions" (club spec UI table, REQ-005, REQ-006; README B-15; E06-S12 #94): the
// sessions in the caller's record scope in date order, with server filters status, date range (slot dates), section,
// group and "needs reschedule"; the date range starts at 7 days back through 14 days ahead and can be cleared. The
// perspectives All / Canceled / Calendar live in the URL (`?perspective=`): Canceled lists cancelled sessions with
// their reason, Calendar is the coordinator's week grid (`CoordinatorCalendar`). The session status, "moved" (detached
// from its series) and "needs reschedule" (a generated session over a conflict) are badges. Each row opens the session;
// with `activities.coach` a future planned session is cancelled from its row (reason required) and a started one opens
// its attendance list. `ActivitySessions` is the same list for one activity (the "Sessions" tab of its record).
import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import type { FilterDef, FilterValues } from '@open-mercato/ui/backend/FilterOverlay'
import { RowActions, type RowActionItem } from '@open-mercato/ui/backend/RowActions'
import { fetchCrudList } from '@open-mercato/ui/backend/utils/crud'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@open-mercato/ui/primitives/tabs'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { useOrganizationScopeVersion } from '@open-mercato/shared/lib/frontend/useOrganizationScope'
import { OCCURRENCE_STATUSES } from '../lib/activities-rules'
import {
  OCCURRENCE_PERSPECTIVES,
  defaultSessionWindow,
  localCalendarDate,
  perspectiveHref,
  perspectiveOf,
  perspectiveStatus,
  sessionRowActions,
  type OccurrencePerspective,
} from '../lib/occurrence-list'
import { CancelOccurrenceDialog } from './CancelOccurrenceDialog'
import { CoordinatorCalendar } from './CoordinatorCalendar'
import { attendanceHref } from './club/club-client'
import { useActivitiesFeatures } from './useActivitiesFeatures'
import {
  OCCURRENCES_HREF,
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

function buildColumns(t: Translate, withActivity: boolean, withReason = false): TableColumns<OccurrenceRow> {
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
  if (withReason) {
    columns.push({
      accessorKey: 'cancelReason',
      header: t('activities.occurrences.columns.reason'),
      enableSorting: false,
      meta: { priority: 3 },
      cell: ({ row }) => <span className="break-words whitespace-pre-wrap">{row.original.cancelReason ?? dash}</span>,
    })
  }
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

/** The list of the All and Canceled perspectives. */
function SessionsList({ perspective }: { perspective: Exclude<OccurrencePerspective, 'calendar'> }) {
  const t = useT()
  const router = useRouter()
  const queryClient = useQueryClient()
  const scopeVersion = useOrganizationScopeVersion()
  const features = useActivitiesFeatures()
  // The browser's today: the default window of 7 days back through 14 days ahead, clearable through the filters.
  const [filters, setFilters] = React.useState<FilterValues>(() => ({
    dates: defaultSessionWindow(localCalendarDate(new Date())),
  }))
  const [page, setPage] = React.useState(1)
  const [cancelling, setCancelling] = React.useState<OccurrenceRow | null>(null)
  const status = perspectiveStatus(perspective)

  const { data, isLoading, error, dataUpdatedAt } = useQuery({
    queryKey: ['activities-occurrences', perspective, filters, page, scopeVersion],
    queryFn: () =>
      fetchCrudList<OccurrenceRow>('activities/occurrences', {
        page,
        pageSize: PAGE_SIZE,
        sortField: 'startAt',
        sortDir: 'asc',
        ...filterParams(filters),
        ...(status ? { status } : {}),
      }),
  })
  // "Started" is judged at the moment the page was read, so the row actions match the rows shown.
  const readAt = React.useMemo(() => new Date(dataUpdatedAt), [dataUpdatedAt])

  const refresh = React.useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['activities-occurrences'] })
  }, [queryClient])

  const columns = React.useMemo(() => buildColumns(t, true, perspective === 'cancelled'), [t, perspective])
  const filterDefs = React.useMemo<FilterDef[]>(
    () => [
      ...(perspective === 'all'
        ? [
            {
              id: 'status',
              label: t('activities.occurrences.filters.status'),
              type: 'select',
              options: OCCURRENCE_STATUSES.map((value) => ({ value, label: statusLabel(t, value) })),
            } satisfies FilterDef,
          ]
        : []),
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
    [t, perspective],
  )

  const rowActions = (row: OccurrenceRow) => {
    const items: RowActionItem[] = [{ id: 'open', label: t('activities.common.open'), href: occurrenceHref(row.id) }]
    for (const action of sessionRowActions(row, readAt, features.coach)) {
      if (action === 'attendance') {
        items.push({
          id: 'attendance',
          label: t('activities.occurrences.actions.attendance'),
          href: attendanceHref(row.id),
        })
      } else {
        items.push({
          id: 'cancel',
          label: t('activities.occurrences.actions.cancel'),
          destructive: true,
          onSelect: () => {
            setCancelling(row)
          },
        })
      }
    }
    return <RowActions items={items} />
  }

  return (
    <>
      <DataTable<OccurrenceRow>
        title={t('activities.occurrences.title')}
        titleHeadingLevel={1}
        entityId="activities:occurrence"
        extensionTableId="activities.occurrences"
        columns={columns}
        data={data?.items ?? []}
        isLoading={isLoading}
        error={error ? errorMessage(error, t('activities.occurrences.errors.load')) : null}
        emptyState={
          <p className="text-muted-foreground text-sm" data-testid={`occurrences-empty-${perspective}`}>
            {t(`activities.occurrences.empty.${perspective}`)}
          </p>
        }
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
      {cancelling ? (
        <CancelOccurrenceDialog
          key={cancelling.id}
          occurrence={cancelling}
          open
          onOpenChange={(open) => {
            if (!open) setCancelling(null)
          }}
          onDone={refresh}
        />
      ) : null}
    </>
  )
}

export function OccurrencesTable() {
  const t = useT()
  const router = useRouter()
  const searchParams = useSearchParams()
  const perspective = perspectiveOf(searchParams.get('perspective'))
  return (
    <Tabs
      value={perspective}
      onValueChange={(value: string) => {
        if (value !== perspective) router.push(perspectiveHref(OCCURRENCES_HREF, perspectiveOf(value)))
      }}
    >
      <div className="overflow-x-auto">
        <TabsList aria-label={t('activities.occurrences.perspectives.label')}>
          {OCCURRENCE_PERSPECTIVES.map((value) => (
            <TabsTrigger key={value} value={value}>
              {t(`activities.occurrences.perspectives.${value}`)}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      <TabsContent value={perspective} className="pt-4">
        {perspective === 'calendar' ? (
          <div className="flex min-w-0 flex-col gap-4">
            <h1 className="text-2xl font-semibold">{t('activities.occurrences.title')}</h1>
            <CoordinatorCalendar />
          </div>
        ) : (
          <SessionsList key={perspective} perspective={perspective} />
        )}
      </TabsContent>
    </Tabs>
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
