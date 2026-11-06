'use client'
// `/backend/facilities/rentals` — "Rentals" (facilities spec B-24; E08-S02 #122): the external rentals of the club's
// places with the tabs Active (requested and confirmed, the default) / Awaiting approval / All, filters for the place,
// the status (All) and "to be moved", and per row the slot, place, renter with contact, how it was taken, the amount
// and the status. A requested rental is confirmed, cancelled, moved or recorded as a no-show from its row; a confirmed
// one is cancelled, moved or recorded as a no-show. "New rental" opens the rental dialog. Everything here needs
// `facilities.rentals.manage`.
import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import type { FilterDef, FilterValues } from '@open-mercato/ui/backend/FilterOverlay'
import { RowActions, type RowActionItem } from '@open-mercato/ui/backend/RowActions'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useConfirmDialog } from '@open-mercato/ui/backend/confirm-dialog'
import { surfaceRecordConflict } from '@open-mercato/ui/backend/conflicts'
import { fetchCrudList } from '@open-mercato/ui/backend/utils/crud'
import { Button } from '@open-mercato/ui/primitives/button'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@open-mercato/ui/primitives/tabs'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { useOrganizationScopeVersion } from '@open-mercato/shared/lib/frontend/useOrganizationScope'
import { errorCodeOf } from '@vereino/core'
import { RENTAL_STATUSES } from '../lib/rentals'
import { ListEmptyState } from './FacilitiesControls'
import { CancelRentalDialog, MoveRentalDialog } from './RentalActionDialogs'
import { RentalDialog } from './RentalDialog'
import {
  codedMessage,
  errorMessage,
  minorToAmount,
  placeLabel,
  usePlaceOptions,
  type TableColumns,
  type Translate,
} from './facilities-client'
import {
  RENTALS_API,
  RENTALS_KEY,
  rentalActions,
  rentalStatusLabel,
  rentalStatusVariant,
  runRentalAction,
  slotLabel,
  type RentalAction,
  type RentalRow,
} from './rentals-client'

const PAGE_SIZE = 50

export const RENTAL_LIST_TABS = ['active', 'awaiting_approval', 'all'] as const
export type RentalListTab = (typeof RENTAL_LIST_TABS)[number]

/** The status badge and the "to be moved" flag of a rental. */
export function RentalBadges({ row, t }: { row: Pick<RentalRow, 'status' | 'needsReschedule'>; t: Translate }) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      <StatusBadge variant={rentalStatusVariant(row.status)}>{rentalStatusLabel(t, row.status)}</StatusBadge>
      {row.needsReschedule ? (
        <StatusBadge variant="warning">{t('facilities.rentals.flags.needsReschedule')}</StatusBadge>
      ) : null}
    </span>
  )
}

function buildColumns(t: Translate, names: Map<string, string>): TableColumns<RentalRow> {
  const empty = t('facilities.common.empty')
  return [
    {
      id: 'slot',
      header: t('facilities.rentals.columns.slot'),
      enableSorting: false,
      meta: { priority: 1 },
      cell: ({ row }) => (
        <span className="flex flex-col">
          <span className="font-medium whitespace-nowrap tabular-nums">
            {slotLabel(row.original.startsAt, row.original.endsAt)}
          </span>
          <span className="text-muted-foreground text-xs">
            {t('facilities.rentals.units.label', { units: row.original.units, minutes: row.original.units * 90 })}
          </span>
        </span>
      ),
    },
    {
      id: 'place',
      header: t('facilities.fields.place'),
      enableSorting: false,
      meta: { priority: 2 },
      cell: ({ row }) => placeLabel(t, names, row.original.placeId),
    },
    {
      id: 'renter',
      header: t('facilities.rentals.columns.renter'),
      enableSorting: false,
      meta: { priority: 1 },
      cell: ({ row }) => {
        const contact = [row.original.contactName, row.original.contactPhone, row.original.contactEmail]
          .filter(Boolean)
          .join(' · ')
        return (
          <span className="flex flex-col">
            <span className="font-medium">{row.original.renterDisplayName ?? empty}</span>
            {contact ? <span className="text-muted-foreground text-xs">{contact}</span> : null}
          </span>
        )
      },
    },
    {
      id: 'requestedVia',
      header: t('facilities.rentals.columns.source'),
      enableSorting: false,
      meta: { priority: 4 },
      cell: ({ row }) =>
        row.original.requestedVia ? t(`facilities.rentals.requestedVia.${row.original.requestedVia}`) : empty,
    },
    {
      id: 'amount',
      header: t('facilities.rentals.columns.amount'),
      enableSorting: false,
      meta: { priority: 3 },
      cell: ({ row }) => (
        <span className="tabular-nums">
          {row.original.amount === null ? empty : minorToAmount(row.original.amount)}
        </span>
      ),
    },
    {
      id: 'status',
      header: t('facilities.rentals.columns.status'),
      enableSorting: false,
      meta: { priority: 1 },
      cell: ({ row }) => <RentalBadges row={row.original} t={t} />,
    },
  ]
}

function filterParams(values: FilterValues, tab: RentalListTab): Record<string, string> {
  const params: Record<string, string> = {}
  const placeId: unknown = values.placeId
  if (typeof placeId === 'string' && placeId) params.placeId = placeId
  const status: unknown = values.status
  if (tab === 'all' && typeof status === 'string' && status) params.status = status
  if (values.needsReschedule === true) params.needsReschedule = 'true'
  return params
}

type ActionDialog = { kind: 'cancel' | 'move'; row: RentalRow } | null

function RentalsList({ tab, onCreate }: { tab: RentalListTab; onCreate: () => void }) {
  const t = useT()
  const queryClient = useQueryClient()
  const scopeVersion = useOrganizationScopeVersion()
  const places = usePlaceOptions()
  const { confirm, ConfirmDialogElement } = useConfirmDialog()
  const [filters, setFilters] = React.useState<FilterValues>({})
  const [page, setPage] = React.useState(1)
  const [dialog, setDialog] = React.useState<ActionDialog>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: [RENTALS_KEY, 'list', tab, filters, page, scopeVersion],
    queryFn: () =>
      fetchCrudList<RentalRow>(RENTALS_API, {
        page,
        pageSize: PAGE_SIZE,
        sortField: 'startsAt',
        sortDir: tab === 'all' ? 'desc' : 'asc',
        ...(tab === 'all' ? {} : { tab }),
        ...filterParams(filters, tab),
      }),
  })

  const refresh = React.useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: [RENTALS_KEY] })
  }, [queryClient])

  const columns = React.useMemo(() => buildColumns(t, places.names), [t, places.names])
  const filterDefs = React.useMemo<FilterDef[]>(
    () => [
      {
        id: 'placeId',
        label: t('facilities.fields.place'),
        type: 'select',
        options: places.options,
      },
      ...(tab === 'all'
        ? [
            {
              id: 'status',
              label: t('facilities.rentals.columns.status'),
              type: 'select',
              options: RENTAL_STATUSES.map((value) => ({ value, label: rentalStatusLabel(t, value) })),
            } satisfies FilterDef,
          ]
        : []),
      { id: 'needsReschedule', label: t('facilities.rentals.filters.needsReschedule'), type: 'checkbox' },
    ],
    [t, tab, places.options],
  )

  const simpleAction = async (row: RentalRow, action: 'confirm' | 'noShow') => {
    const confirmed = await confirm({
      title: t(`facilities.rentals.${action}.title`),
      text: t(`facilities.rentals.${action}.text`, { slot: slotLabel(row.startsAt, row.endsAt) }),
      confirmText: t(`facilities.rentals.actions.${action}`),
      cancelText: t('facilities.rentals.actions.back'),
      variant: action === 'noShow' ? 'destructive' : 'default',
    })
    if (!confirmed) return
    const fallback = t(`facilities.rentals.errors.${action}`)
    try {
      await runRentalAction(row, action, {}, fallback)
      flash(t(`facilities.rentals.flash.${action}`), 'success')
    } catch (err: unknown) {
      if (!surfaceRecordConflict(err, t, { onRefresh: () => void refresh() })) {
        flash(
          errorCodeOf(err) === 'invalid_transition'
            ? t('facilities.rentals.errors.invalid_transition')
            : (codedMessage(err, t) ?? errorMessage(err, fallback)),
          'error',
        )
      }
    }
    await refresh()
  }

  const actionItem = (row: RentalRow, action: RentalAction): RowActionItem => {
    const label = t(`facilities.rentals.actions.${action}`)
    if (action === 'cancel' || action === 'move') {
      return {
        id: action,
        label,
        destructive: action === 'cancel',
        onSelect: () => {
          setDialog({ kind: action, row })
        },
      }
    }
    return {
      id: action,
      label,
      destructive: action === 'noShow',
      onSelect: () => {
        void simpleAction(row, action)
      },
    }
  }

  const createAction = (
    <Button type="button" data-testid="facilities-rentals-create" onClick={onCreate}>
      {t('facilities.rentals.actions.create')}
    </Button>
  )
  const filtered = Object.keys(filterParams(filters, tab)).length > 0
  const empty = !isLoading && !error && (data?.items.length ?? 0) === 0

  return (
    <div className="flex flex-col gap-6">
      {empty ? (
        <ListEmptyState
          title={t('facilities.rentals.title')}
          message={t(`facilities.rentals.empty.${tab}`)}
          actions={createAction}
          testId={`facilities-rentals-empty-${tab}`}
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
        <div data-testid="facilities-rentals-table">
          <DataTable<RentalRow>
            title={t('facilities.rentals.title')}
            titleHeadingLevel={1}
            entityId="facilities:rental"
            extensionTableId="facilities.rentals"
            actions={createAction}
            columns={columns}
            data={data?.items ?? []}
            isLoading={isLoading}
            error={error ? errorMessage(error, t('facilities.rentals.errors.load')) : null}
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
            rowActions={(row: RentalRow) => {
              const items = rentalActions(row.status).map((action) => actionItem(row, action))
              return items.length > 0 ? (
                <span data-testid={`facilities-rental-actions-${row.id}`}>
                  <RowActions items={items} />
                </span>
              ) : null
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
      )}
      {dialog?.kind === 'cancel' ? (
        <CancelRentalDialog
          key={`cancel-${dialog.row.id}`}
          row={dialog.row}
          placeName={placeLabel(t, places.names, dialog.row.placeId)}
          open
          onOpenChange={(open) => {
            if (!open) setDialog(null)
          }}
          onDone={refresh}
        />
      ) : null}
      {dialog?.kind === 'move' ? (
        <MoveRentalDialog
          key={`move-${dialog.row.id}`}
          row={dialog.row}
          placeName={placeLabel(t, places.names, dialog.row.placeId)}
          places={places.options}
          open
          onOpenChange={(open) => {
            if (!open) setDialog(null)
          }}
          onDone={refresh}
        />
      ) : null}
      {ConfirmDialogElement}
    </div>
  )
}

export function RentalsTable() {
  const t = useT()
  const queryClient = useQueryClient()
  const places = usePlaceOptions()
  const [tab, setTab] = React.useState<RentalListTab>('active')
  const [createOpen, setCreateOpen] = React.useState(false)
  // A new key per opening starts the dialog fresh.
  const [createKey, setCreateKey] = React.useState(0)

  return (
    <>
      <Tabs
        value={tab}
        onValueChange={(value: string) => {
          setTab(RENTAL_LIST_TABS.find((entry) => entry === value) ?? 'active')
        }}
      >
        {/* The platform tabs primitives drop `data-testid`; the wrapper carries it, and tests pick a tab by role. */}
        <div className="overflow-x-auto" data-testid="facilities-rentals-tabs">
          <TabsList aria-label={t('facilities.rentals.tabs.label')}>
            {RENTAL_LIST_TABS.map((value) => (
              <TabsTrigger key={value} value={value}>
                {t(`facilities.rentals.tabs.${value}`)}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <TabsContent value={tab} className="pt-4">
          <RentalsList
            key={tab}
            tab={tab}
            onCreate={() => {
              setCreateKey((current) => current + 1)
              setCreateOpen(true)
            }}
          />
        </TabsContent>
      </Tabs>
      <RentalDialog
        key={createKey}
        open={createOpen}
        onOpenChange={setCreateOpen}
        places={places.options}
        preset={{ placeId: places.options.length === 1 ? (places.options[0]?.value ?? null) : null }}
        onSaved={async () => {
          await queryClient.invalidateQueries({ queryKey: [RENTALS_KEY] })
        }}
      />
    </>
  )
}
