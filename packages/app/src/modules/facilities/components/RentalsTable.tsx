'use client'
// `/backend/facilities/rentals?status=&view=&place=&page=` — "Rentals" (facilities spec B-24; E08-S02 #122; facilities
// parity spec REQ-R04, #279): the external rentals of the club's places with the tabs Active (requested and confirmed,
// the default) / Awaiting approval / All and the perspectives "To be moved" and "Unpaid after the deadline", all kept in
// the address (precedent DD-U03) so a reload or a shared link restores them. Each row shows the slot, the place, the
// renter with contact and phone, how it was taken, the amount with its payee and charge state, and the status; it
// opens the rental page. "Confirm payment" and "Cancel" are buttons on the row, a pending request links to the
// decision queue (B-25), Move and No-show sit in the row menu. "New rental" opens the slot dialog with the rental kind
// and no preset slot (#277, DD-R05). Everything here needs `facilities.rentals.manage`.
import * as React from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import type { FilterDef, FilterValues } from '@open-mercato/ui/backend/FilterOverlay'
import { RowActions, type RowActionItem } from '@open-mercato/ui/backend/RowActions'
import { fetchCrudList } from '@open-mercato/ui/backend/utils/crud'
import { Button } from '@open-mercato/ui/primitives/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@open-mercato/ui/primitives/tabs'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { useOrganizationScopeVersion } from '@open-mercato/shared/lib/frontend/useOrganizationScope'
import {
  RENTAL_LIST_STATUSES,
  RENTAL_VIEWS,
  readRentalListUrl,
  rentalListQuery,
  rentalListUrlParams,
  type RentalListStatus,
  type RentalListUrlState,
} from '../lib/rental-record'
import { ListEmptyState } from './FacilitiesControls'
import { useRentalActions } from './RentalRowActions'
import { SlotDialog } from './slot/SlotDialog'
import {
  minorToAmount,
  placeLabel,
  usePlaceOptions,
  errorMessage,
  type TableColumns,
  type Translate,
} from './facilities-client'
import {
  REQUESTS_HREF,
  RENTALS_API,
  RENTALS_KEY,
  VISIBLE_RENTAL_ACTIONS,
  chargeAwaitingPayment,
  chargeHref,
  chargeStateVariant,
  payeeLabel,
  rentalActions,
  rentalHref,
  rentalStatusLabel,
  rentalStatusVariant,
  slotLabel,
  useRentalTimeZone,
  type RentalAction,
  type RentalRow,
} from './rentals-client'
import { StatusTag } from '@vereino/ui'

const PAGE_SIZE = 50

/** The catalog key of a tab (the API and the catalog name the pending tab `awaiting_approval`). */
const TAB_KEYS: Record<RentalListStatus, string> = {
  active: 'active',
  pending_approval: 'awaiting_approval',
  all: 'all',
}

/** The status badge and the "to be moved" flag of a rental. */
export function RentalBadges({ row, t }: { row: Pick<RentalRow, 'status' | 'needsReschedule'>; t: Translate }) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      <StatusTag status={rentalStatusVariant(row.status)}>{rentalStatusLabel(t, row.status)}</StatusTag>
      {row.needsReschedule ? (
        <StatusTag status="warning">{t('facilities.rentals.flags.needsReschedule')}</StatusTag>
      ) : null}
    </span>
  )
}

/** The amount with its payee and the charge state ("rental register" for a rental without a charge, DD-R09). */
export function RentalAmount({ row, t }: { row: RentalRow; t: Translate }) {
  return (
    <span className="flex flex-col items-start gap-1">
      <span className="tabular-nums">
        {row.amount === null ? t('facilities.common.empty') : minorToAmount(row.amount)}
      </span>
      <span className="text-muted-foreground text-xs">{payeeLabel(t, row.payee)}</span>
      <StatusTag status={chargeStateVariant(row.chargeState)}>
        {t(`facilities.rentals.chargeState.${row.chargeState}`)}
      </StatusTag>
    </span>
  )
}

function buildColumns(
  t: Translate,
  names: Map<string, string>,
  timeZone: string,
  buttons: (row: RentalRow) => React.ReactNode,
): TableColumns<RentalRow> {
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
            {slotLabel(row.original.startsAt, row.original.endsAt, timeZone)}
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
        const contact = [row.original.contactName, row.original.contactPhone].filter(Boolean).join(' · ')
        return (
          <span className="flex flex-col">
            {/* A link, so the rental opens from the keyboard too (the row click is a mouse shortcut). */}
            <Link
              href={rentalHref(row.original.id)}
              className="font-medium underline-offset-2 hover:underline"
              data-testid={`facilities-rental-open-${row.original.id}`}
              onClick={(event) => {
                event.stopPropagation()
              }}
            >
              {row.original.renterDisplayName ?? empty}
            </Link>
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
      cell: ({ row }) => <RentalAmount row={row.original} t={t} />,
    },
    {
      id: 'status',
      header: t('facilities.rentals.columns.status'),
      enableSorting: false,
      meta: { priority: 1 },
      cell: ({ row }) => <RentalBadges row={row.original} t={t} />,
    },
    {
      id: 'buttons',
      header: t('facilities.rentals.columns.actions'),
      enableSorting: false,
      meta: { priority: 2 },
      cell: ({ row }) => buttons(row.original),
    },
  ]
}

export function RentalsTable() {
  const t = useT()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const timeZone = useRentalTimeZone()
  const queryClient = useQueryClient()
  const scopeVersion = useOrganizationScopeVersion()
  const places = usePlaceOptions()
  const state = React.useMemo(() => readRentalListUrl((key) => searchParams.get(key)), [searchParams])
  const navigate = React.useCallback(
    (change: Partial<RentalListUrlState>) => {
      const query = new URLSearchParams(rentalListUrlParams({ ...state, page: 1, ...change })).toString()
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
    },
    [pathname, router, state],
  )
  const [createOpen, setCreateOpen] = React.useState(false)
  // A new key per opening starts the dialog fresh.
  const [createKey, setCreateKey] = React.useState(0)

  const query = rentalListQuery(state)
  const { data, isLoading, error } = useQuery({
    queryKey: [RENTALS_KEY, 'list', query, state.page, scopeVersion],
    queryFn: () =>
      fetchCrudList<RentalRow>(RENTALS_API, {
        page: state.page,
        pageSize: PAGE_SIZE,
        sortField: 'startsAt',
        sortDir: state.status === 'all' ? 'desc' : 'asc',
        ...query,
      }),
  })

  const refresh = React.useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: [RENTALS_KEY] })
  }, [queryClient])
  const actions = useRentalActions({ places, onDone: refresh })

  const buttons = React.useCallback(
    (row: RentalRow) => {
      if (row.status === 'pending_approval') {
        return (
          <Button asChild size="sm" variant="outline">
            <Link
              href={REQUESTS_HREF}
              data-testid={`facilities-rental-decision-${row.id}`}
              onClick={(event) => {
                event.stopPropagation()
              }}
            >
              {t('facilities.rentals.list.decision')}
            </Link>
          </Button>
        )
      }
      const visible = rentalActions(row.status).filter((action) => VISIBLE_RENTAL_ACTIONS.includes(action))
      if (visible.length === 0) return null
      return (
        <span className="flex flex-wrap gap-2">
          {visible.map((action) => {
            const chargeId = action === 'confirm' ? chargeAwaitingPayment(row) : null
            // A rental with an unpaid charge is confirmed by its payment: the button opens the charge (DD-R09).
            return chargeId ? (
              <Button key={action} asChild size="sm" variant="outline">
                <Link
                  href={chargeHref(chargeId)}
                  data-testid={`facilities-rental-${action}-${row.id}`}
                  onClick={(event) => {
                    event.stopPropagation()
                  }}
                >
                  {t(`facilities.rentals.list.${action}`)}
                </Link>
              </Button>
            ) : (
              <Button
                key={action}
                type="button"
                size="sm"
                variant={action === 'cancel' ? 'destructive-outline' : 'outline'}
                data-testid={`facilities-rental-${action}-${row.id}`}
                onClick={(event) => {
                  event.stopPropagation()
                  actions.run(row, action)
                }}
              >
                {t(`facilities.rentals.list.${action}`)}
              </Button>
            )
          })}
        </span>
      )
    },
    [actions, t],
  )

  const columns = React.useMemo(
    () => buildColumns(t, places.names, timeZone, buttons),
    [t, places.names, timeZone, buttons],
  )
  const filterDefs = React.useMemo<FilterDef[]>(
    () => [{ id: 'placeId', label: t('facilities.fields.place'), type: 'select', options: places.options }],
    [t, places.options],
  )

  const menuItem = (row: RentalRow, action: RentalAction): RowActionItem => ({
    id: action,
    label: t(`facilities.rentals.actions.${action}`),
    destructive: action === 'noShow',
    onSelect: () => {
      actions.run(row, action)
    },
  })

  const createAction = (
    <Button
      type="button"
      data-testid="facilities-rentals-create"
      onClick={() => {
        setCreateKey((current) => current + 1)
        setCreateOpen(true)
      }}
    >
      {t('facilities.rentals.actions.create')}
    </Button>
  )
  const filtered = Boolean(state.view || state.placeId)
  const empty = !isLoading && !error && (data?.items.length ?? 0) === 0

  return (
    <div className="flex flex-col gap-4">
      <Tabs
        value={state.status}
        variant="underline"
        onValueChange={(value: string) => {
          navigate({ status: RENTAL_LIST_STATUSES.find((entry) => entry === value) ?? 'active' })
        }}
      >
        {/* The platform tabs primitives drop `data-testid`; the wrapper carries it, and tests pick a tab by role. */}
        <div className="overflow-x-auto" data-testid="facilities-rentals-tabs">
          <TabsList aria-label={t('facilities.rentals.tabs.label')}>
            {RENTAL_LIST_STATUSES.map((value) => (
              <TabsTrigger key={value} value={value}>
                {t(`facilities.rentals.tabs.${TAB_KEYS[value]}`)}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <TabsContent value={state.status} className="flex flex-col gap-4 pt-4">
          <div
            role="group"
            aria-label={t('facilities.rentals.views.label')}
            className="flex flex-wrap items-center gap-2"
            data-testid="facilities-rentals-views"
          >
            <span className="text-muted-foreground text-sm">{t('facilities.rentals.views.label')}</span>
            {RENTAL_VIEWS.map((view) => (
              <Button
                key={view}
                type="button"
                size="sm"
                variant={state.view === view ? 'default' : 'outline'}
                aria-pressed={state.view === view}
                data-testid={`facilities-rentals-view-${view}`}
                onClick={() => {
                  navigate({ view: state.view === view ? '' : view })
                }}
              >
                {t(`facilities.rentals.views.${view}`)}
              </Button>
            ))}
          </div>
          {empty ? (
            <ListEmptyState
              title={t('facilities.rentals.emptyTitle')}
              message={
                state.view
                  ? t(`facilities.rentals.views.empty.${state.view}`)
                  : t(`facilities.rentals.empty.${TAB_KEYS[state.status]}`)
              }
              actions={createAction}
              testId={`facilities-rentals-empty-${state.status}`}
              onClearFilters={
                filtered
                  ? () => {
                      navigate({ view: '', placeId: '' })
                    }
                  : undefined
              }
            />
          ) : (
            <div className="relative max-w-full min-w-0 overflow-x-auto" data-testid="facilities-rentals-table">
              {/* The table and its footer scroll inside this region at 320 px (the Polish footer line is wider). */}
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
                filterValues={{ placeId: state.placeId }}
                onFiltersApply={(values: FilterValues) => {
                  const placeId: unknown = values.placeId
                  navigate({ placeId: typeof placeId === 'string' ? placeId : '' })
                }}
                onFiltersClear={() => {
                  navigate({ placeId: '' })
                }}
                onRowClick={(row: RentalRow) => {
                  router.push(rentalHref(row.id))
                }}
                rowActions={(row: RentalRow) => {
                  const items = rentalActions(row.status)
                    .filter((action) => !VISIBLE_RENTAL_ACTIONS.includes(action))
                    .map((action) => menuItem(row, action))
                  return items.length > 0 ? (
                    <span data-testid={`facilities-rental-actions-${row.id}`}>
                      <RowActions items={items} />
                    </span>
                  ) : null
                }}
                pagination={{
                  page: state.page,
                  pageSize: PAGE_SIZE,
                  total: data?.total ?? 0,
                  totalPages: data?.totalPages ?? 0,
                  onPageChange: (page: number) => {
                    navigate({ page })
                  },
                }}
              />
            </div>
          )}
        </TabsContent>
      </Tabs>
      {actions.element}
      {/* B-24 "New rental" is the slot dialog with the rental kind and no preset slot (DD-R05). */}
      <SlotDialog
        key={createKey}
        open={createOpen}
        onOpenChange={setCreateOpen}
        kinds={['rental']}
        groups={[]}
        preset={null}
        places={places.options}
        onSaved={refresh}
      />
    </div>
  )
}
