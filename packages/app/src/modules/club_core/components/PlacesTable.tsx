'use client'
// `/backend/club/places` (club spec UI table; README B-06, UX parity spec REQ-U03, E06-S04 #86): the place hierarchy
// as a list — each page ordered parent first with the children indented under their parent (`↳`), an External badge
// for a place outside the club, the owner institution, the capacity and the status. The kind, parent and active
// filters and the search live in the URL (`?kind=…&parentPlaceId=…`), so a filtered list is shareable and survives a
// reload and the back button; the server applies them inside the record scope.
import * as React from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import type { FilterDef, FilterValues } from '@open-mercato/ui/backend/FilterOverlay'
import { RowActions } from '@open-mercato/ui/backend/RowActions'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useConfirmDialog } from '@open-mercato/ui/backend/confirm-dialog'
import { surfaceRecordConflict } from '@open-mercato/ui/backend/conflicts'
import { LoadingMessage } from '@open-mercato/ui/backend/detail'
import { deleteCrud, fetchCrudList } from '@open-mercato/ui/backend/utils/crud'
import { readApiResultOrThrow, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import type { CrudFieldOption } from '@open-mercato/ui/backend/CrudForm'
import { Button } from '@open-mercato/ui/primitives/button'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { useOrganizationScopeVersion } from '@open-mercato/shared/lib/frontend/useOrganizationScope'
import {
  hasPlaceFilters,
  orderParentFirst,
  parsePlaceListState,
  placeListQuery,
  type PlaceListState,
} from '../lib/place-hierarchy'
import { PLACE_KINDS } from '../lib/places'
import { enumOptions, errorMessage, type TableColumns, type Translate } from './client-helpers'
import type { PlaceRow } from './places-shared'

const LIST_HREF = '/backend/club/places'
const PAGE_SIZE = 50

/** A row of the page in hierarchy order: its depth on the page and whether its parent is elsewhere. */
type PlaceTableRow = PlaceRow & { depth: number; parentElsewhere: boolean }

/** The indent of a name cell per depth on the page (static classes, so Tailwind emits them); deeper levels share the last. */
const DEPTH_INDENT = ['', 'ps-5', 'ps-10', 'ps-15', 'ps-20'] as const

type PlaceOptionRow = { id: string; name: string; parentName: string | null; isLeaf: boolean }

/** The places that have sub-places, as the parent filter offers them ("Parent › Name" when nested). */
async function parentOptions(): Promise<CrudFieldOption[]> {
  try {
    const data = await readApiResultOrThrow<{ items?: PlaceOptionRow[] }>('/api/club_core/options/places')
    return (data.items ?? [])
      .filter((item) => !item.isLeaf)
      .map((item) => ({ value: item.id, label: item.parentName ? `${item.parentName} › ${item.name}` : item.name }))
      .sort((a, b) => a.label.localeCompare(b.label))
  } catch {
    return []
  }
}

/** A yes/no badge of the public calendar switches (#124): status tokens, the word carries the meaning. */
function YesNo({ value, t }: { value: boolean; t: Translate }) {
  return (
    <StatusBadge variant={value ? 'success' : 'neutral'}>
      {value ? t('club_core.places.public.yes') : t('club_core.places.public.no')}
    </StatusBadge>
  )
}

function buildColumns(t: Translate): TableColumns<PlaceTableRow> {
  const dash = <span className="text-muted-foreground">—</span>
  return [
    {
      id: 'name',
      header: t('club_core.places.columns.name'),
      enableSorting: false,
      meta: { priority: 1, maxWidth: '360px' },
      cell: ({ row }) => {
        const place = row.original
        return (
          <span
            className={`flex flex-wrap items-center gap-x-2 gap-y-1 ${DEPTH_INDENT[Math.min(place.depth, DEPTH_INDENT.length - 1)] ?? ''}`}
            data-testid="place-name-cell"
            data-depth={place.depth}
          >
            {place.parentPlaceId ? (
              <span aria-hidden="true" className="text-muted-foreground">
                ↳
              </span>
            ) : null}
            {place.parentElsewhere && place.parentName ? (
              <span className="text-muted-foreground">
                {t('club_core.places.parentPrefix', { parent: place.parentName })}
              </span>
            ) : null}
            <span className="font-medium">{place.name ?? '—'}</span>
            {place.isExternal ? <StatusBadge variant="info">{t('club_core.places.external')}</StatusBadge> : null}
          </span>
        )
      },
    },
    {
      accessorKey: 'kind',
      header: t('club_core.places.columns.kind'),
      enableSorting: false,
      meta: { priority: 2 },
      cell: ({ row }) => (row.original.kind ? t(`club_core.places.kind.${row.original.kind}`) : '—'),
    },
    {
      accessorKey: 'ownerName',
      header: t('club_core.places.columns.owner'),
      enableSorting: false,
      meta: { priority: 5 },
      cell: ({ row }) => row.original.ownerName ?? dash,
    },
    {
      accessorKey: 'capacityGroups',
      header: () => <span className="block text-right">{t('club_core.places.columns.capacityGroups')}</span>,
      enableSorting: false,
      meta: { priority: 4 },
      cell: ({ row }) => <span className="block text-right tabular-nums">{row.original.capacityGroups}</span>,
    },
    {
      accessorKey: 'isPublicSchedule',
      header: t('club_core.places.columns.publicSchedule'),
      enableSorting: false,
      meta: { priority: 6 },
      cell: ({ row }) => <YesNo value={row.original.isPublicSchedule} t={t} />,
    },
    {
      accessorKey: 'acceptsOnlineRequests',
      header: t('club_core.places.columns.acceptsRequests'),
      enableSorting: false,
      meta: { priority: 7 },
      cell: ({ row }) => <YesNo value={row.original.acceptsOnlineRequests} t={t} />,
    },
    {
      accessorKey: 'isActive',
      header: t('club_core.places.columns.status'),
      enableSorting: false,
      meta: { priority: 3 },
      cell: ({ row }) => (
        <StatusBadge variant={row.original.isActive ? 'success' : 'neutral'}>
          {row.original.isActive ? t('club_core.common.active') : t('club_core.common.inactive')}
        </StatusBadge>
      ),
    },
  ]
}

/** The filter overlay's values of a list state (the search has its own field). */
function filterValuesOf(state: PlaceListState): FilterValues {
  const values: FilterValues = {}
  if (state.kind) values.kind = state.kind
  if (state.parentPlaceId) values.parentPlaceId = state.parentPlaceId
  if (state.isActive) values.isActive = state.isActive
  return values
}

/** The list state of applied filter values, keeping the search; invalid values are dropped as in a URL. */
function stateOf(values: FilterValues, search: string | undefined): PlaceListState {
  const query = new URLSearchParams()
  for (const key of ['kind', 'parentPlaceId', 'isActive'] as const) {
    const value: unknown = values[key]
    if (typeof value === 'string' && value) query.set(key, value)
  }
  if (search) query.set('search', search)
  return parsePlaceListState(query)
}

function PlacesList() {
  const t = useT()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const scopeVersion = useOrganizationScopeVersion()
  const { confirm, ConfirmDialogElement } = useConfirmDialog()
  const state = React.useMemo(() => parsePlaceListState(searchParams), [searchParams])
  const stateKey = placeListQuery(state)
  const [search, setSearch] = React.useState(state.search ?? '')
  // The page belongs to one filter state: a new filter (also from the back button) starts on the first page.
  const [paging, setPaging] = React.useState({ key: stateKey, page: 1 })
  const page = paging.key === stateKey ? paging.page : 1
  const setPage = (next: number) => {
    setPaging({ key: stateKey, page: next })
  }

  /** Writes a list state to the URL; a filter change adds a history entry, typing in the search replaces it. */
  const navigate = (next: PlaceListState, mode: 'push' | 'replace' = 'push') => {
    const query = placeListQuery(next)
    const href = query ? `${pathname}?${query}` : pathname
    if (mode === 'push') router.push(href)
    else router.replace(href)
  }

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['club_core-places', stateKey, page, scopeVersion],
    queryFn: () =>
      fetchCrudList<PlaceRow>('club_core/places', {
        page,
        pageSize: PAGE_SIZE,
        sortField: 'name',
        sortDir: 'asc',
        ...state,
      }),
  })

  const rows = React.useMemo<PlaceTableRow[]>(
    () =>
      orderParentFirst(data?.items ?? []).map(({ place, depth, parentElsewhere }) => ({
        ...place,
        depth,
        parentElsewhere,
      })),
    [data],
  )

  const columns = React.useMemo(() => buildColumns(t), [t])
  const filterDefs = React.useMemo<FilterDef[]>(
    () => [
      {
        id: 'kind',
        label: t('club_core.places.filters.kind'),
        type: 'select',
        options: enumOptions(PLACE_KINDS, 'club_core.places.kind', t),
      },
      {
        id: 'parentPlaceId',
        label: t('club_core.places.filters.parent'),
        type: 'select',
        loadOptions: parentOptions,
      },
      {
        id: 'isActive',
        label: t('club_core.places.filters.status'),
        type: 'select',
        options: [
          { value: 'true', label: t('club_core.common.active') },
          { value: 'false', label: t('club_core.common.inactive') },
        ],
      },
    ],
    [t],
  )

  const remove = async (row: PlaceTableRow) => {
    const confirmed = await confirm({ title: t('club_core.places.confirm.delete'), variant: 'destructive' })
    if (!confirmed) return
    try {
      await withScopedApiRequestHeaders(buildOptimisticLockHeader(row.updatedAt), () =>
        deleteCrud('club_core/places', row.id),
      )
      flash(t('club_core.places.flash.deleted'), 'success')
    } catch (err: unknown) {
      if (!surfaceRecordConflict(err, t)) flash(errorMessage(err, t('club_core.places.errors.delete')), 'error')
    }
    await queryClient.invalidateQueries({ queryKey: ['club_core-places'] })
  }

  const addPlace = (
    <Button asChild>
      <Link href={`${LIST_HREF}/create`}>{t('club_core.places.actions.create')}</Link>
    </Button>
  )

  const emptyState = hasPlaceFilters(state) ? (
    <div className="flex flex-col items-start gap-3" data-testid="places-empty-filtered">
      <p className="text-muted-foreground text-sm">{t('club_core.places.emptyFiltered')}</p>
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          setSearch('')
          navigate({})
        }}
      >
        {t('club_core.places.filters.clear')}
      </Button>
    </div>
  ) : (
    <div className="flex flex-col items-start gap-3" data-testid="places-empty">
      <p className="font-medium">{t('club_core.places.empty')}</p>
      <p className="text-muted-foreground text-sm">{t('club_core.places.emptyHint')}</p>
      {addPlace}
    </div>
  )

  return (
    <>
      <DataTable<PlaceTableRow>
        title={t('club_core.places.title')}
        titleHeadingLevel={1}
        entityId="club_core:place"
        extensionTableId="club_core.places"
        actions={addPlace}
        columns={columns}
        data={rows}
        isLoading={isLoading}
        error={error ? errorMessage(error, t('club_core.places.errors.load')) : null}
        emptyState={emptyState}
        searchValue={search}
        searchPlaceholder={t('club_core.places.search')}
        onSearchChange={(value: string) => {
          setSearch(value)
          navigate({ ...state, search: value.trim() || undefined }, 'replace')
        }}
        filters={filterDefs}
        filterValues={filterValuesOf(state)}
        onFiltersApply={(values: FilterValues) => {
          navigate(stateOf(values, state.search))
        }}
        onFiltersClear={() => {
          navigate(state.search ? { search: state.search } : {})
        }}
        rowActions={(row: PlaceTableRow) => (
          <RowActions
            items={[
              { id: 'edit', label: t('club_core.common.edit'), href: `${LIST_HREF}/${row.id}/edit` },
              {
                id: 'delete',
                label: t('club_core.common.delete'),
                destructive: true,
                onSelect: () => {
                  void remove(row)
                },
              },
            ]}
          />
        )}
        onRowClick={(row: PlaceTableRow) => {
          router.push(`${LIST_HREF}/${row.id}/edit`)
        }}
        pagination={{
          page,
          pageSize: PAGE_SIZE,
          total: data?.total ?? 0,
          totalPages: data?.totalPages ?? 0,
          onPageChange: setPage,
        }}
      />
      {error ? (
        <div className="pt-2">
          <Button type="button" variant="outline" onClick={() => void refetch()}>
            {t('club_core.common.retry')}
          </Button>
        </div>
      ) : null}
      {ConfirmDialogElement}
    </>
  )
}

export function PlacesTable() {
  const t = useT()
  // `useSearchParams` needs a Suspense boundary while the page prerenders.
  return (
    <React.Suspense fallback={<LoadingMessage label={t('club_core.places.loadingList')} />}>
      <PlacesList />
    </React.Suspense>
  )
}
