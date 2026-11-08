'use client'
// `/backend/payments/orders` — B-30 Order campaigns (UX concept README B-30; payments spec REQ-032; issue #115): the
// club's campaigns with their section and groups, orders deadline, stage, orders out of children, value, paid and
// handed over. An empty club gets the "New order form" call to action.
import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { fetchCrudList } from '@open-mercato/ui/backend/utils/crud'
import { Button } from '@open-mercato/ui/primitives/button'
import { EmptyState } from '@open-mercato/ui/primitives/empty-state'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { useOrganizationScopeVersion } from '@open-mercato/shared/lib/frontend/useOrganizationScope'
import type { CampaignStatus } from '../../lib/order-campaigns'
import { errorMessage, formatMoney, type TableColumns, type Translate } from '../client-helpers'
import { ORDERS_HREF, STAGE_VARIANTS, campaignHref, type CampaignRow } from './orders-client'

const PAGE_SIZE = 50

export function CampaignStageBadge({ status, t }: { status: CampaignStatus | null; t: Translate }) {
  if (!status) return null
  return (
    <StatusBadge variant={STAGE_VARIANTS[status]} dot>
      {t(`payments.orders.stage.${status}`)}
    </StatusBadge>
  )
}

function buildColumns(t: Translate, locale: string): TableColumns<CampaignRow> {
  const dash = <span className="text-muted-foreground">—</span>
  return [
    { accessorKey: 'name', header: t('payments.orders.columns.name'), enableSorting: false, meta: { priority: 1 } },
    {
      accessorKey: 'sectionName',
      header: t('payments.orders.columns.sectionGroups'),
      enableSorting: false,
      meta: { priority: 3, truncate: true, maxWidth: '18rem' },
      cell: ({ row }) => (
        <span>
          {row.original.sectionName ?? '—'}
          {row.original.groupNames?.length ? (
            <span className="text-muted-foreground text-xs"> · {row.original.groupNames.join(', ')}</span>
          ) : null}
        </span>
      ),
    },
    {
      accessorKey: 'closesOn',
      header: t('payments.orders.columns.deadline'),
      enableSorting: false,
      meta: { priority: 2 },
      cell: ({ row }) => row.original.closesOn ?? dash,
    },
    {
      accessorKey: 'status',
      header: t('payments.orders.columns.stage'),
      enableSorting: false,
      meta: { priority: 1 },
      cell: ({ row }) => <CampaignStageBadge status={row.original.status} t={t} />,
    },
    {
      id: 'orders',
      header: t('payments.orders.columns.orders'),
      enableSorting: false,
      meta: { priority: 2 },
      cell: ({ row }) =>
        row.original.kpis
          ? t('payments.orders.kpi.ordersOf', {
              orders: row.original.kpis.orders,
              children: row.original.kpis.children,
            })
          : dash,
    },
    {
      id: 'value',
      header: t('payments.orders.columns.value'),
      enableSorting: false,
      meta: { priority: 4 },
      cell: ({ row }) => (row.original.kpis ? formatMoney(row.original.kpis.value, locale) : dash),
    },
    {
      id: 'paid',
      header: t('payments.orders.columns.paid'),
      enableSorting: false,
      meta: { priority: 4 },
      cell: ({ row }) => (row.original.kpis ? formatMoney(row.original.kpis.paid, locale) : dash),
    },
    {
      id: 'handedOver',
      header: t('payments.orders.columns.handedOver'),
      enableSorting: false,
      meta: { priority: 5 },
      cell: ({ row }) => row.original.kpis?.handedOver ?? dash,
    },
  ]
}

export function OrderCampaignsTable() {
  const t = useT()
  const locale = useLocale()
  const router = useRouter()
  const scopeVersion = useOrganizationScopeVersion()
  const [search, setSearch] = React.useState('')
  const [page, setPage] = React.useState(1)

  const { data, isLoading, error } = useQuery({
    queryKey: ['payments-order-campaigns', search, page, scopeVersion],
    queryFn: () =>
      fetchCrudList<CampaignRow>('payments/order-campaigns', {
        page,
        pageSize: PAGE_SIZE,
        sortField: 'createdAt',
        sortDir: 'desc',
        ...(search ? { search } : {}),
      }),
  })

  const columns = React.useMemo(() => buildColumns(t, locale), [t, locale])
  const createAction = (
    <Button asChild>
      <Link href={`${ORDERS_HREF}/create`} data-testid="order-campaign-create">
        {t('payments.orders.actions.create')}
      </Link>
    </Button>
  )

  return (
    <DataTable<CampaignRow>
      title={t('payments.orders.title')}
      titleHeadingLevel={1}
      entityId="payments:order_campaign"
      extensionTableId="payments.order-campaigns"
      actions={createAction}
      columns={columns}
      data={data?.items ?? []}
      isLoading={isLoading}
      error={error ? errorMessage(error, t('payments.orders.errors.load')) : null}
      emptyState={
        <EmptyState
          title={t('payments.orders.empty.title')}
          description={t('payments.orders.empty.description')}
          actions={
            <Button asChild>
              <Link href={`${ORDERS_HREF}/create`} data-testid="order-campaign-empty-create">
                {t('payments.orders.actions.create')}
              </Link>
            </Button>
          }
        />
      }
      searchValue={search}
      searchPlaceholder={t('payments.orders.search')}
      onSearchChange={(value: string) => {
        setSearch(value)
        setPage(1)
      }}
      onRowClick={(row: CampaignRow) => {
        router.push(campaignHref(row.id))
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
