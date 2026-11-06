'use client'
// `/backend/facilities/zones` (facilities spec B-26; REQ-013; #121): the weekly zone rules of the club's places — the
// place, days, times, zone, priority, source and validity — with a place selector and the week preview of the chosen
// place. Read with `facilities.view`; add, edit and delete for `facilities.manage`.
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
import { ZONES, ZONE_SOURCES } from '../lib/zones'
import { ALL_PLACES, ListEmptyState, PlaceSelect } from './FacilitiesControls'
import { WeekZonePreview } from './WeekZonePreview'
import {
  ZONES_HREF,
  ZONE_RULES_API,
  ZONE_RULES_KEY,
  editHref,
  errorMessage,
  placeLabel,
  useFacilitiesManage,
  usePlaceOptions,
  usePlaceZoneRules,
  validityLabel,
  weekdaysLabel,
  zoneLabel,
  type TableColumns,
  type Translate,
  type ZoneRuleRow,
} from './facilities-client'

const PAGE_SIZE = 50

function buildColumns(t: Translate, names: Map<string, string>): TableColumns<ZoneRuleRow> {
  return [
    {
      id: 'place',
      header: t('facilities.fields.place'),
      enableSorting: false,
      meta: { priority: 1 },
      cell: ({ row }) => <span className="font-medium">{placeLabel(t, names, row.original.placeId)}</span>,
    },
    {
      id: 'weekdays',
      header: t('facilities.zones.columns.weekdays'),
      enableSorting: false,
      meta: { priority: 2 },
      cell: ({ row }) => weekdaysLabel(t, row.original.weekdays),
    },
    {
      id: 'times',
      header: t('facilities.zones.columns.times'),
      enableSorting: false,
      meta: { priority: 2 },
      cell: ({ row }) => `${row.original.timeFrom}–${row.original.timeTo}`,
    },
    {
      accessorKey: 'zone',
      header: t('facilities.zones.columns.zone'),
      enableSorting: false,
      meta: { priority: 1 },
      cell: ({ row }) => zoneLabel(t, row.original.zone),
    },
    {
      accessorKey: 'priority',
      header: t('facilities.zones.columns.priority'),
      enableSorting: false,
      meta: { priority: 3 },
    },
    {
      accessorKey: 'source',
      header: t('facilities.zones.columns.source'),
      enableSorting: false,
      meta: { priority: 4 },
      cell: ({ row }) =>
        row.original.source ? t(`facilities.zones.source.${row.original.source}`) : t('facilities.common.empty'),
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
  const params: Record<string, string> = {}
  const zone: unknown = values.zone
  const source: unknown = values.source
  if (typeof zone === 'string' && zone) params.zone = zone
  if (typeof source === 'string' && source) params.source = source
  return params
}

export function ZonesTable() {
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
    queryKey: [ZONE_RULES_KEY, 'list', selectedPlace, filters, page, scopeVersion],
    queryFn: () =>
      fetchCrudList<ZoneRuleRow>(ZONE_RULES_API, {
        page,
        pageSize: PAGE_SIZE,
        sortField: 'priority',
        sortDir: 'asc',
        ...(selectedPlace ? { placeId: selectedPlace } : {}),
        ...filterParams(filters),
      }),
  })
  const preview = usePlaceZoneRules(selectedPlace)

  const columns = React.useMemo(() => buildColumns(t, places.names), [t, places.names])
  const filterDefs = React.useMemo<FilterDef[]>(
    () => [
      {
        id: 'zone',
        label: t('facilities.zones.columns.zone'),
        type: 'select',
        options: ZONES.map((zone) => ({ value: zone, label: zoneLabel(t, zone) })),
      },
      {
        id: 'source',
        label: t('facilities.zones.columns.source'),
        type: 'select',
        options: ZONE_SOURCES.map((source) => ({ value: source, label: t(`facilities.zones.source.${source}`) })),
      },
    ],
    [t],
  )

  const remove = async (row: ZoneRuleRow) => {
    const confirmed = await confirm({
      title: t('facilities.zones.confirm.delete'),
      text: t('facilities.zones.confirm.deleteText'),
      confirmText: t('facilities.common.delete'),
      cancelText: t('facilities.common.cancel'),
      variant: 'destructive',
    })
    if (!confirmed) return
    try {
      await withScopedApiRequestHeaders(buildOptimisticLockHeader(row.updatedAt), () =>
        deleteCrud(ZONE_RULES_API, row.id),
      )
      flash(t('facilities.zones.flash.deleted'), 'success')
    } catch (err: unknown) {
      if (!surfaceRecordConflict(err, t)) flash(errorMessage(err, t('facilities.zones.errors.delete')), 'error')
    }
    await queryClient.invalidateQueries({ queryKey: [ZONE_RULES_KEY] })
  }

  const createAction = manage ? (
    <Button asChild>
      <Link href={`${ZONES_HREF}/create`}>{t('facilities.zones.actions.create')}</Link>
    </Button>
  ) : null
  const filtered = Object.keys(filterParams(filters)).length > 0
  const empty = !isLoading && !error && (data?.items.length ?? 0) === 0

  return (
    <div className="flex flex-col gap-6">
      <p className="text-muted-foreground text-sm">{t('facilities.zones.description')}</p>
      <PlaceSelect
        options={places.options}
        value={placeId}
        allowAll
        onChange={(next) => {
          setPlaceId(next)
          setPage(1)
        }}
        testId="facilities-zones-place"
      />
      {empty ? (
        <ListEmptyState
          title={t('facilities.zones.title')}
          message={t('facilities.zones.empty')}
          actions={createAction}
          testId="facilities-zones-empty"
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
        <DataTable<ZoneRuleRow>
          title={t('facilities.zones.title')}
          titleHeadingLevel={1}
          entityId="facilities:zone_rule"
          extensionTableId="facilities.zone_rules"
          actions={createAction}
          columns={columns}
          data={data?.items ?? []}
          isLoading={isLoading}
          error={error ? errorMessage(error, t('facilities.zones.errors.load')) : null}
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
          rowActions={(row: ZoneRuleRow) =>
            manage ? (
              <RowActions
                items={[
                  { id: 'edit', label: t('facilities.common.edit'), href: editHref(ZONES_HREF, row.id) },
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
              ? (row: ZoneRuleRow) => {
                  router.push(editHref(ZONES_HREF, row.id))
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
      {selectedPlace ? (
        preview.error ? (
          <p className="text-destructive text-sm" role="alert">
            {errorMessage(preview.error, t('facilities.zones.errors.load'))}
          </p>
        ) : preview.isLoading ? (
          <p className="text-muted-foreground text-sm" role="status">
            {t('facilities.preview.loading')}
          </p>
        ) : (
          <WeekZonePreview rows={preview.data?.items ?? []} />
        )
      ) : (
        <p className="text-muted-foreground text-sm">{t('facilities.preview.choosePlace')}</p>
      )}
      {ConfirmDialogElement}
    </div>
  )
}
