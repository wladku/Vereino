'use client'
// `/backend/facilities/closures` (facilities spec B-26, DD-22; #121): the closures of the club's places — place,
// from–to, reason and note — with a place selector and a reason filter. Read with `facilities.view`; add, edit and
// delete for `facilities.manage`.
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
import { CLOSURE_REASONS } from '../lib/closures'
import { ALL_PLACES, ListEmptyState, PlaceSelect } from './FacilitiesControls'
import {
  CLOSURES_API,
  CLOSURES_HREF,
  editHref,
  errorMessage,
  instantLabel,
  placeLabel,
  useFacilitiesManage,
  usePlaceOptions,
  type ClosureRow,
  type TableColumns,
  type Translate,
} from './facilities-client'

const PAGE_SIZE = 50
const QUERY_KEY = 'facilities-closures'

function buildColumns(t: Translate, names: Map<string, string>): TableColumns<ClosureRow> {
  return [
    {
      id: 'place',
      header: t('facilities.fields.place'),
      enableSorting: false,
      meta: { priority: 1 },
      cell: ({ row }) => <span className="font-medium">{placeLabel(t, names, row.original.placeId)}</span>,
    },
    {
      id: 'startsAt',
      header: t('facilities.closures.fields.startsAt'),
      enableSorting: false,
      meta: { priority: 1 },
      cell: ({ row }) => <span className="tabular-nums">{instantLabel(row.original.startsAt)}</span>,
    },
    {
      id: 'endsAt',
      header: t('facilities.closures.fields.endsAt'),
      enableSorting: false,
      meta: { priority: 2 },
      cell: ({ row }) => <span className="tabular-nums">{instantLabel(row.original.endsAt)}</span>,
    },
    {
      accessorKey: 'reason',
      header: t('facilities.closures.fields.reason'),
      enableSorting: false,
      meta: { priority: 2 },
      cell: ({ row }) =>
        row.original.reason ? t(`facilities.closures.reason.${row.original.reason}`) : t('facilities.common.empty'),
    },
    {
      accessorKey: 'note',
      header: t('facilities.closures.fields.note'),
      enableSorting: false,
      meta: { priority: 4, truncate: true, maxWidth: '20rem' },
      cell: ({ row }) => row.original.note ?? '',
    },
  ]
}

function filterParams(values: FilterValues, now: string): Record<string, string> {
  const params: Record<string, string> = {}
  const reason: unknown = values.reason
  if (typeof reason === 'string' && reason) params.reason = reason
  if (values.upcoming === true) params.endsAfter = now
  return params
}

export function ClosuresTable() {
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
  const [now] = React.useState(() => new Date().toISOString())
  const selectedPlace = placeId === ALL_PLACES ? null : placeId

  const { data, isLoading, error } = useQuery({
    queryKey: [QUERY_KEY, selectedPlace, filters, page, scopeVersion],
    queryFn: () =>
      fetchCrudList<ClosureRow>(CLOSURES_API, {
        page,
        pageSize: PAGE_SIZE,
        sortField: 'startsAt',
        sortDir: 'desc',
        ...(selectedPlace ? { placeId: selectedPlace } : {}),
        ...filterParams(filters, now),
      }),
  })

  const columns = React.useMemo(() => buildColumns(t, places.names), [t, places.names])
  const filterDefs = React.useMemo<FilterDef[]>(
    () => [
      {
        id: 'reason',
        label: t('facilities.closures.fields.reason'),
        type: 'select',
        options: CLOSURE_REASONS.map((reason) => ({ value: reason, label: t(`facilities.closures.reason.${reason}`) })),
      },
      { id: 'upcoming', label: t('facilities.closures.filters.upcoming'), type: 'checkbox' },
    ],
    [t],
  )

  const remove = async (row: ClosureRow) => {
    const confirmed = await confirm({
      title: t('facilities.closures.confirm.delete'),
      text: t('facilities.closures.confirm.deleteText'),
      confirmText: t('facilities.common.delete'),
      cancelText: t('facilities.common.cancel'),
      variant: 'destructive',
    })
    if (!confirmed) return
    try {
      await withScopedApiRequestHeaders(buildOptimisticLockHeader(row.updatedAt), () =>
        deleteCrud(CLOSURES_API, row.id),
      )
      flash(t('facilities.closures.flash.deleted'), 'success')
    } catch (err: unknown) {
      if (!surfaceRecordConflict(err, t)) flash(errorMessage(err, t('facilities.closures.errors.delete')), 'error')
    }
    await queryClient.invalidateQueries({ queryKey: [QUERY_KEY] })
  }

  const createAction = manage ? (
    <Button asChild>
      <Link href={`${CLOSURES_HREF}/create`}>{t('facilities.closures.actions.create')}</Link>
    </Button>
  ) : null
  const filtered = Object.keys(filterParams(filters, now)).length > 0
  const empty = !isLoading && !error && (data?.items.length ?? 0) === 0

  return (
    <div className="flex flex-col gap-6">
      <p className="text-muted-foreground text-sm">{t('facilities.closures.description')}</p>
      <PlaceSelect
        options={places.options}
        value={placeId}
        allowAll
        onChange={(next) => {
          setPlaceId(next)
          setPage(1)
        }}
        testId="facilities-closures-place"
      />
      {empty ? (
        <ListEmptyState
          title={t('facilities.closures.title')}
          message={t('facilities.closures.empty')}
          actions={createAction}
          testId="facilities-closures-empty"
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
        <DataTable<ClosureRow>
          title={t('facilities.closures.title')}
          titleHeadingLevel={1}
          entityId="facilities:closure"
          extensionTableId="facilities.closures"
          actions={createAction}
          columns={columns}
          data={data?.items ?? []}
          isLoading={isLoading}
          error={error ? errorMessage(error, t('facilities.closures.errors.load')) : null}
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
          rowActions={(row: ClosureRow) =>
            manage ? (
              <RowActions
                items={[
                  { id: 'edit', label: t('facilities.common.edit'), href: editHref(CLOSURES_HREF, row.id) },
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
              ? (row: ClosureRow) => {
                  router.push(editHref(CLOSURES_HREF, row.id))
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
