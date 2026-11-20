'use client'
// `/backend/activities/club-events` (club events spec B-T1, REQ-T11; #378): the club events of the caller's scope —
// Name, Dates, Place (with the external mark), Section or "Whole club", Parts, Public, Status — in the views Upcoming,
// Past and Cancelled (a tablist under `?view=`, switched without a reload), with search and a section filter. The
// administrator and the coordinators read every club event of the club (Q-T18); "New club event" for
// `activities.manage`. An empty list explains what a club event is and offers to create one.
import * as React from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { EmptyState } from '@open-mercato/ui/backend/EmptyState'
import type { FilterDef, FilterValues } from '@open-mercato/ui/backend/FilterOverlay'
import { RowActions } from '@open-mercato/ui/backend/RowActions'
import { fetchCrudList } from '@open-mercato/ui/backend/utils/crud'
import { Button } from '@open-mercato/ui/primitives/button'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@open-mercato/ui/primitives/tabs'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { useOrganizationScopeVersion } from '@open-mercato/shared/lib/frontend/useOrganizationScope'
import { errorMessage, sectionOptions, tolerant, type TableColumns, type Translate } from './client-helpers'
import {
  CLUB_EVENT_CREATE_HREF,
  clubEventDatesLabel,
  clubEventHref,
  clubEventStatusVariant,
  type ClubEventRow,
} from './club-events-client'
import { useActivitiesFeatures } from './useActivitiesFeatures'

const PAGE_SIZE = 50

/** The views of the list (`view` of `GET /api/activities/club-events`). */
const CLUB_EVENT_VIEWS = ['upcoming', 'past', 'cancelled'] as const

type View = (typeof CLUB_EVENT_VIEWS)[number]

function viewFrom(value: string | null): View {
  return CLUB_EVENT_VIEWS.find((view) => view === value) ?? 'upcoming'
}

function buildColumns(t: Translate, locale: string): TableColumns<ClubEventRow> {
  const dash = <span className="text-muted-foreground">—</span>
  return [
    {
      id: 'name',
      header: t('activities.clubEvents.columns.name'),
      enableSorting: false,
      meta: { priority: 1 },
      cell: ({ row }) => (
        <Link className="font-medium underline-offset-4 hover:underline" href={clubEventHref(row.original.id)}>
          {row.original.name ?? t('activities.common.empty')}
        </Link>
      ),
    },
    {
      id: 'dates',
      header: t('activities.clubEvents.columns.dates'),
      enableSorting: false,
      meta: { priority: 2 },
      cell: ({ row }) => clubEventDatesLabel(locale, row.original) ?? dash,
    },
    {
      id: 'place',
      header: t('activities.clubEvents.columns.place'),
      enableSorting: false,
      meta: { priority: 3 },
      cell: ({ row }) => (
        <span className="flex flex-wrap items-center gap-2">
          <span>{row.original.placeName ?? t('activities.common.empty')}</span>
          {row.original.placeExternal ? (
            <StatusBadge variant="neutral">{t('activities.clubEvents.place.external')}</StatusBadge>
          ) : null}
        </span>
      ),
    },
    {
      id: 'section',
      header: t('activities.clubEvents.columns.section'),
      enableSorting: false,
      meta: { priority: 5 },
      cell: ({ row }) =>
        row.original.sectionId ? (row.original.sectionName ?? dash) : t('activities.clubEvents.section.wholeClub'),
    },
    {
      id: 'parts',
      header: t('activities.clubEvents.columns.parts'),
      enableSorting: false,
      meta: { priority: 5 },
      cell: ({ row }) => String(row.original.partsCount ?? 0),
    },
    {
      id: 'public',
      header: t('activities.clubEvents.columns.public'),
      enableSorting: false,
      meta: { priority: 4 },
      cell: ({ row }) =>
        row.original.isPublic ? (
          <StatusBadge variant="success">{t('activities.clubEvents.public.yes')}</StatusBadge>
        ) : (
          <span className="text-muted-foreground">{t('activities.clubEvents.public.no')}</span>
        ),
    },
    {
      id: 'status',
      header: t('activities.clubEvents.columns.status'),
      enableSorting: false,
      meta: { priority: 3 },
      cell: ({ row }) => (
        <StatusBadge variant={clubEventStatusVariant(row.original.status)}>
          {t(`activities.clubEvents.status.${row.original.status === 'cancelled' ? 'cancelled' : 'planned'}`)}
        </StatusBadge>
      ),
    },
  ]
}

export function ClubEventsTable() {
  const t = useT()
  const locale = useLocale()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const features = useActivitiesFeatures()
  const scopeVersion = useOrganizationScopeVersion()
  const view = viewFrom(searchParams.get('view'))
  const [search, setSearch] = React.useState('')
  const [filters, setFilters] = React.useState<FilterValues>({})
  const [page, setPage] = React.useState(1)
  const sectionId = typeof filters.sectionId === 'string' && filters.sectionId ? filters.sectionId : null

  const { data, isLoading, error } = useQuery({
    queryKey: ['activities-club-events', view, search, sectionId, page, scopeVersion],
    queryFn: () =>
      fetchCrudList<ClubEventRow>('activities/club-events', {
        page,
        pageSize: PAGE_SIZE,
        sortField: 'name',
        sortDir: 'asc',
        view,
        ...(search ? { search } : {}),
        ...(sectionId ? { sectionId } : {}),
      }),
  })

  const columns = React.useMemo(() => buildColumns(t, locale), [t, locale])
  const filterDefs = React.useMemo<FilterDef[]>(
    () => [
      {
        id: 'sectionId',
        label: t('activities.clubEvents.filters.section'),
        type: 'select',
        loadOptions: tolerant(sectionOptions),
      },
    ],
    [t],
  )

  const selectView = (next: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set('view', next)
    setPage(1)
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
  }

  const filtered = search !== '' || sectionId !== null
  const createButton = features.manage ? (
    <Button asChild>
      <Link href={CLUB_EVENT_CREATE_HREF} data-testid="club-events-create">
        {t('activities.clubEvents.actions.create')}
      </Link>
    </Button>
  ) : null

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <p className="text-muted-foreground text-sm">{t('activities.clubEvents.subtitle')}</p>
      <Tabs value={view} onValueChange={selectView} variant="underline">
        <div className="overflow-x-auto">
          <TabsList aria-label={t('activities.clubEvents.views.label')}>
            {CLUB_EVENT_VIEWS.map((value) => (
              <TabsTrigger key={value} value={value}>
                {t(`activities.clubEvents.views.${value}`)}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        {CLUB_EVENT_VIEWS.map((value) => (
          <TabsContent key={value} value={value} className="pt-2">
            {value === view ? (
              <DataTable<ClubEventRow>
                title={t('activities.clubEvents.title')}
                titleHeadingLevel={1}
                entityId="activities:club_event"
                extensionTableId="activities.club-events"
                actions={createButton}
                columns={columns}
                data={data?.items ?? []}
                isLoading={isLoading}
                error={error ? errorMessage(error, t('activities.clubEvents.errors.load')) : null}
                emptyState={
                  <div data-testid="club-events-empty">
                    <EmptyState
                      title={t(
                        filtered ? 'activities.clubEvents.emptyFiltered.title' : 'activities.clubEvents.empty.title',
                      )}
                      description={t(
                        filtered ? 'activities.clubEvents.emptyFiltered.text' : 'activities.clubEvents.empty.text',
                      )}
                      actions={filtered ? undefined : (createButton ?? undefined)}
                    />
                  </div>
                }
                searchValue={search}
                searchPlaceholder={t('activities.clubEvents.search')}
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
                rowActions={(row: ClubEventRow) => (
                  <RowActions
                    items={[{ id: 'open', label: t('activities.common.open'), href: clubEventHref(row.id) }]}
                  />
                )}
                onRowClick={(row: ClubEventRow) => {
                  router.push(clubEventHref(row.id))
                }}
                pagination={{
                  page,
                  pageSize: PAGE_SIZE,
                  total: data?.total ?? 0,
                  totalPages: data?.totalPages ?? 0,
                  onPageChange: setPage,
                }}
              />
            ) : null}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}
