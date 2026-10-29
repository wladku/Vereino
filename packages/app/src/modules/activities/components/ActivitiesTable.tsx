'use client'
// `/backend/activities/activities` (club spec UI table, REQ-005): the activities in the caller's record scope — a
// coordinator's sections, the whole club for the administrator — with group, section, type, schedule, place, coach and
// status; server filters search, section, group, type and status. The add action for `activities.manage`, the one-off
// event action for `activities.events.create`; each row opens the activity record.
import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import type { FilterDef, FilterValues } from '@open-mercato/ui/backend/FilterOverlay'
import { RowActions } from '@open-mercato/ui/backend/RowActions'
import { fetchCrudList } from '@open-mercato/ui/backend/utils/crud'
import { Button } from '@open-mercato/ui/primitives/button'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { useOrganizationScopeVersion } from '@open-mercato/shared/lib/frontend/useOrganizationScope'
import { ACTIVITY_TYPES } from '../lib/activities-rules'
import {
  ACTIVITIES_HREF,
  EVENTS_CREATE_HREF,
  activityHref,
  errorMessage,
  groupOptions,
  scheduleSummary,
  sectionOptions,
  tolerant,
  typeLabel,
  type ActivityRow,
  type TableColumns,
  type Translate,
} from './client-helpers'
import { useActivitiesFeatures } from './useActivitiesFeatures'

const PAGE_SIZE = 50

function buildColumns(t: Translate): TableColumns<ActivityRow> {
  const dash = <span className="text-muted-foreground">—</span>
  return [
    {
      id: 'name',
      header: t('activities.activities.columns.name'),
      enableSorting: false,
      meta: { priority: 1 },
      cell: ({ row }) => (
        <Link className="font-medium underline-offset-4 hover:underline" href={activityHref(row.original.id)}>
          {row.original.name ?? t('activities.common.empty')}
        </Link>
      ),
    },
    {
      accessorKey: 'groupName',
      header: t('activities.activities.columns.group'),
      enableSorting: false,
      meta: { priority: 2 },
      cell: ({ row }) => row.original.groupName ?? dash,
    },
    {
      accessorKey: 'sectionName',
      header: t('activities.activities.columns.section'),
      enableSorting: false,
      meta: { priority: 6 },
      cell: ({ row }) => row.original.sectionName ?? dash,
    },
    {
      accessorKey: 'type',
      header: t('activities.activities.columns.type'),
      enableSorting: false,
      meta: { priority: 4 },
      cell: ({ row }) => typeLabel(t, row.original.type),
    },
    {
      id: 'schedule',
      header: t('activities.activities.columns.schedule'),
      enableSorting: false,
      meta: { priority: 3 },
      cell: ({ row }) => scheduleSummary(t, row.original),
    },
    {
      accessorKey: 'placeName',
      header: t('activities.activities.columns.place'),
      enableSorting: false,
      meta: { priority: 5 },
      cell: ({ row }) => row.original.placeName ?? dash,
    },
    {
      accessorKey: 'coachName',
      header: t('activities.activities.columns.coach'),
      enableSorting: false,
      meta: { priority: 7 },
      cell: ({ row }) => row.original.coachName ?? dash,
    },
    {
      accessorKey: 'isActive',
      header: t('activities.activities.columns.status'),
      enableSorting: false,
      meta: { priority: 4 },
      cell: ({ row }) => (
        <StatusBadge variant={row.original.isActive ? 'success' : 'neutral'}>
          {row.original.isActive ? t('activities.common.active') : t('activities.common.inactive')}
        </StatusBadge>
      ),
    },
  ]
}

/** The list query parameters of the applied filters (`GET /api/activities/activities`). */
function filterParams(values: FilterValues): Record<string, string> {
  const params: Record<string, string> = {}
  for (const key of ['sectionId', 'groupId', 'type'] as const) {
    const value: unknown = values[key]
    if (typeof value === 'string' && value) params[key] = value
  }
  const isActive: unknown = values.isActive
  if (isActive === 'true' || isActive === 'false') params.isActive = isActive
  return params
}

export function ActivitiesTable() {
  const t = useT()
  const router = useRouter()
  const features = useActivitiesFeatures()
  const scopeVersion = useOrganizationScopeVersion()
  const [search, setSearch] = React.useState('')
  const [filters, setFilters] = React.useState<FilterValues>({})
  const [page, setPage] = React.useState(1)

  const { data, isLoading, error } = useQuery({
    queryKey: ['activities-activities', search, filters, page, scopeVersion],
    queryFn: () =>
      fetchCrudList<ActivityRow>('activities/activities', {
        page,
        pageSize: PAGE_SIZE,
        sortField: 'name',
        sortDir: 'asc',
        ...(search ? { search } : {}),
        ...filterParams(filters),
      }),
  })

  const columns = React.useMemo(() => buildColumns(t), [t])
  const filterDefs = React.useMemo<FilterDef[]>(
    () => [
      {
        id: 'sectionId',
        label: t('activities.activities.filters.section'),
        type: 'select',
        loadOptions: tolerant(sectionOptions),
      },
      {
        id: 'groupId',
        label: t('activities.activities.filters.group'),
        type: 'select',
        loadOptions: tolerant(() => groupOptions(false)),
      },
      {
        id: 'type',
        label: t('activities.activities.filters.type'),
        type: 'select',
        options: ACTIVITY_TYPES.map((type) => ({ value: type, label: typeLabel(t, type) })),
      },
      {
        id: 'isActive',
        label: t('activities.activities.filters.status'),
        type: 'select',
        options: [
          { value: 'true', label: t('activities.common.active') },
          { value: 'false', label: t('activities.common.inactive') },
        ],
      },
    ],
    [t],
  )

  return (
    <DataTable<ActivityRow>
      title={t('activities.activities.title')}
      titleHeadingLevel={1}
      entityId="activities:activity"
      extensionTableId="activities.activities"
      actions={
        features.manage || features.createEvents ? (
          <div className="flex flex-wrap gap-2">
            {features.createEvents ? (
              <Button asChild variant="outline">
                <Link href={EVENTS_CREATE_HREF}>{t('activities.activities.actions.createEvent')}</Link>
              </Button>
            ) : null}
            {features.manage ? (
              <Button asChild>
                <Link href={`${ACTIVITIES_HREF}/create`}>{t('activities.activities.actions.create')}</Link>
              </Button>
            ) : null}
          </div>
        ) : null
      }
      columns={columns}
      data={data?.items ?? []}
      isLoading={isLoading}
      error={error ? errorMessage(error, t('activities.activities.errors.load')) : null}
      emptyState={<p className="text-muted-foreground text-sm">{t('activities.activities.empty')}</p>}
      searchValue={search}
      searchPlaceholder={t('activities.activities.search')}
      onSearchChange={(value: string) => {
        setSearch(value)
        setPage(1)
      }}
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
      rowActions={(row: ActivityRow) => (
        <RowActions items={[{ id: 'open', label: t('activities.common.open'), href: activityHref(row.id) }]} />
      )}
      onRowClick={(row: ActivityRow) => {
        router.push(activityHref(row.id))
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
