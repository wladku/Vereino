'use client'
// `/backend/facilities/rates` (facilities spec B-26; REQ-013; #121): the rental rates of the club's places — place,
// renter category, price per 90 minutes in PLN, season and lighting, validity — with a place selector and a category
// filter. Read with `facilities.view`; add, edit and delete for `facilities.manage`.
import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import type { FilterDef, FilterValues } from '@open-mercato/ui/backend/FilterOverlay'
import { RowActions } from '@open-mercato/ui/backend/RowActions'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useConfirmDialog } from '@open-mercato/ui/backend/confirm-dialog'
import { surfaceRecordConflict } from '@open-mercato/ui/backend/conflicts'
import { deleteCrud, fetchCrudList } from '@open-mercato/ui/backend/utils/crud'
import { withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { Button } from '@open-mercato/ui/primitives/button'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { useOrganizationScopeVersion } from '@open-mercato/shared/lib/frontend/useOrganizationScope'
import { RENTER_CATEGORIES } from '../lib/rates'
import { ALL_PLACES, ListEmptyState, PlaceSelect } from './FacilitiesControls'
import {
  RATES_API,
  RATES_HREF,
  editHref,
  errorMessage,
  minorToAmount,
  placeLabel,
  useFacilitiesManage,
  usePlaceOptions,
  validityLabel,
  type RateRow,
  type TableColumns,
  type Translate,
} from './facilities-client'

const PAGE_SIZE = 50
const QUERY_KEY = 'facilities-rates'

function buildColumns(t: Translate, names: Map<string, string>): TableColumns<RateRow> {
  return [
    {
      id: 'place',
      header: t('facilities.fields.place'),
      enableSorting: false,
      meta: { priority: 1 },
      cell: ({ row }) => <span className="font-medium">{placeLabel(t, names, row.original.placeId)}</span>,
    },
    {
      accessorKey: 'renterCategory',
      header: t('facilities.rates.fields.category'),
      enableSorting: false,
      meta: { priority: 1 },
      cell: ({ row }) =>
        row.original.renterCategory
          ? t(`facilities.rates.category.${row.original.renterCategory}`)
          : t('facilities.common.empty'),
    },
    {
      accessorKey: 'pricePer90',
      header: t('facilities.rates.columns.price'),
      enableSorting: false,
      meta: { priority: 1 },
      cell: ({ row }) => <span className="tabular-nums">{minorToAmount(row.original.pricePer90)}</span>,
    },
    {
      id: 'season',
      header: t('facilities.rates.columns.season'),
      enableSorting: false,
      meta: { priority: 3 },
      cell: ({ row }) =>
        row.original.seasonFrom && row.original.seasonTo
          ? `${row.original.seasonFrom} – ${row.original.seasonTo}`
          : t('facilities.rates.season.allYear'),
    },
    {
      accessorKey: 'includesLighting',
      header: t('facilities.rates.fields.includesLighting'),
      enableSorting: false,
      meta: { priority: 4 },
      cell: ({ row }) => (row.original.includesLighting ? t('facilities.common.yes') : t('facilities.common.no')),
    },
    {
      id: 'validity',
      header: t('facilities.columns.validity'),
      enableSorting: false,
      meta: { priority: 3 },
      cell: ({ row }) => validityLabel(t, row.original.validFrom, row.original.validTo),
    },
  ]
}

function filterParams(values: FilterValues): Record<string, string> {
  const category: unknown = values.renterCategory
  return typeof category === 'string' && category ? { renterCategory: category } : {}
}

export function RatesTable() {
  const t = useT()
  const router = useRouter()
  const queryClient = useQueryClient()
  const manage = useFacilitiesManage()
  const scopeVersion = useOrganizationScopeVersion()
  const places = usePlaceOptions()
  const { confirm, ConfirmDialogElement } = useConfirmDialog()
  const [placeId, setPlaceId] = React.useState(ALL_PLACES)
  const [filters, setFilters] = React.useState<FilterValues>({})
  const [page, setPage] = React.useState(1)
  const selectedPlace = placeId === ALL_PLACES ? null : placeId

  const { data, isLoading, error } = useQuery({
    queryKey: [QUERY_KEY, selectedPlace, filters, page, scopeVersion],
    queryFn: () =>
      fetchCrudList<RateRow>(RATES_API, {
        page,
        pageSize: PAGE_SIZE,
        sortField: 'renterCategory',
        sortDir: 'asc',
        ...(selectedPlace ? { placeId: selectedPlace } : {}),
        ...filterParams(filters),
      }),
  })

  const columns = React.useMemo(() => buildColumns(t, places.names), [t, places.names])
  const filterDefs = React.useMemo<FilterDef[]>(
    () => [
      {
        id: 'renterCategory',
        label: t('facilities.rates.fields.category'),
        type: 'select',
        options: RENTER_CATEGORIES.map((category) => ({
          value: category,
          label: t(`facilities.rates.category.${category}`),
        })),
      },
    ],
    [t],
  )

  const remove = async (row: RateRow) => {
    const confirmed = await confirm({
      title: t('facilities.rates.confirm.delete'),
      text: t('facilities.rates.confirm.deleteText'),
      confirmText: t('facilities.common.delete'),
      cancelText: t('facilities.common.cancel'),
      variant: 'destructive',
    })
    if (!confirmed) return
    try {
      await withScopedApiRequestHeaders(buildOptimisticLockHeader(row.updatedAt), () => deleteCrud(RATES_API, row.id))
      flash(t('facilities.rates.flash.deleted'), 'success')
    } catch (err: unknown) {
      if (!surfaceRecordConflict(err, t)) flash(errorMessage(err, t('facilities.rates.errors.delete')), 'error')
    }
    await queryClient.invalidateQueries({ queryKey: [QUERY_KEY] })
  }

  const createAction = manage ? (
    <Button asChild>
      <Link href={`${RATES_HREF}/create`}>{t('facilities.rates.actions.create')}</Link>
    </Button>
  ) : null
  const filtered = Object.keys(filterParams(filters)).length > 0
  const empty = !isLoading && !error && (data?.items.length ?? 0) === 0

  return (
    <div className="flex flex-col gap-6">
      <p className="text-muted-foreground text-sm">{t('facilities.rates.description')}</p>
      <PlaceSelect
        options={places.options}
        value={placeId}
        allowAll
        onChange={(next) => {
          setPlaceId(next)
          setPage(1)
        }}
        testId="facilities-rates-place"
      />
      {empty ? (
        <ListEmptyState
          title={t('facilities.rates.title')}
          message={t('facilities.rates.empty')}
          actions={createAction}
          testId="facilities-rates-empty"
          onClearFilters={
            filtered
              ? () => {
                  setFilters({})
                  setPage(1)
                }
              : undefined
          }
        />
      ) : (
        <DataTable<RateRow>
          title={t('facilities.rates.title')}
          titleHeadingLevel={1}
          entityId="facilities:rental_rate"
          extensionTableId="facilities.rental_rates"
          actions={createAction}
          columns={columns}
          data={data?.items ?? []}
          isLoading={isLoading}
          error={error ? errorMessage(error, t('facilities.rates.errors.load')) : null}
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
          rowActions={(row: RateRow) =>
            manage ? (
              <RowActions
                items={[
                  { id: 'edit', label: t('facilities.common.edit'), href: editHref(RATES_HREF, row.id) },
                  {
                    id: 'delete',
                    label: t('facilities.common.delete'),
                    destructive: true,
                    onSelect: () => {
                      void remove(row)
                    },
                  },
                ]}
              />
            ) : null
          }
          onRowClick={
            manage
              ? (row: RateRow) => {
                  router.push(editHref(RATES_HREF, row.id))
                }
              : undefined
          }
          pagination={{
            page,
            pageSize: PAGE_SIZE,
            total: data?.total ?? 0,
            totalPages: data?.totalPages ?? 0,
            onPageChange: setPage,
          }}
        />
      )}
      {ConfirmDialogElement}
    </div>
  )
}
