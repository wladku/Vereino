'use client'
// `/backend/payments/fees` — the "Fees" tab of B-20 (UX concept README B-20; payments spec REQ-011, REQ-018; issue
// #108): the club's fee schedules with their group or activity, period, amount, payment day and validity; add, edit
// and delete.
import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { RowActions } from '@open-mercato/ui/backend/RowActions'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useConfirmDialog } from '@open-mercato/ui/backend/confirm-dialog'
import { surfaceRecordConflict } from '@open-mercato/ui/backend/conflicts'
import { deleteCrud, fetchCrudList } from '@open-mercato/ui/backend/utils/crud'
import { withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { Button } from '@open-mercato/ui/primitives/button'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { useOrganizationScopeVersion } from '@open-mercato/shared/lib/frontend/useOrganizationScope'
import { PaymentsNav } from './PaymentsNav'
import { FEES_HREF, errorMessage, formatMoney, type FeeRow, type TableColumns, type Translate } from './client-helpers'

const PAGE_SIZE = 50

function buildColumns(t: Translate, locale: string): TableColumns<FeeRow> {
  const dash = <span className="text-muted-foreground">—</span>
  return [
    { accessorKey: 'name', header: t('payments.fees.columns.name'), enableSorting: false, meta: { priority: 1 } },
    {
      accessorKey: 'targetName',
      header: t('payments.fees.columns.target'),
      enableSorting: false,
      meta: { priority: 2 },
      cell: ({ row }) =>
        row.original.targetName ? (
          <span>
            {row.original.targetName}{' '}
            <span className="text-muted-foreground text-xs">
              ({t(row.original.groupId ? 'payments.fees.target.group' : 'payments.fees.target.activity')})
            </span>
          </span>
        ) : (
          dash
        ),
    },
    {
      accessorKey: 'period',
      header: t('payments.fees.columns.period'),
      enableSorting: false,
      meta: { priority: 3 },
      cell: ({ row }) => (row.original.period ? t(`payments.fees.period.${row.original.period}`) : dash),
    },
    {
      accessorKey: 'amount',
      header: t('payments.fees.columns.amount'),
      enableSorting: false,
      meta: { priority: 1 },
      cell: ({ row }) => formatMoney(row.original.amount, locale),
    },
    {
      accessorKey: 'dueDay',
      header: t('payments.fees.columns.dueDay'),
      enableSorting: false,
      meta: { priority: 4 },
      cell: ({ row }) => row.original.dueDay ?? dash,
    },
    {
      accessorKey: 'validFrom',
      header: t('payments.fees.columns.validity'),
      enableSorting: false,
      meta: { priority: 5 },
      cell: ({ row }) =>
        row.original.validTo
          ? t('payments.common.period.closed', { from: row.original.validFrom ?? '', to: row.original.validTo })
          : t('payments.common.period.open', { from: row.original.validFrom ?? '' }),
    },
  ]
}

export function FeesTable() {
  const t = useT()
  const locale = useLocale()
  const router = useRouter()
  const queryClient = useQueryClient()
  const scopeVersion = useOrganizationScopeVersion()
  const { confirm, ConfirmDialogElement } = useConfirmDialog()
  const [search, setSearch] = React.useState('')
  const [page, setPage] = React.useState(1)

  const { data, isLoading, error } = useQuery({
    queryKey: ['payments-fees', search, page, scopeVersion],
    queryFn: () =>
      fetchCrudList<FeeRow>('payments/fees', {
        page,
        pageSize: PAGE_SIZE,
        sortField: 'name',
        sortDir: 'asc',
        ...(search ? { search } : {}),
      }),
  })

  const columns = React.useMemo(() => buildColumns(t, locale), [t, locale])

  const remove = async (row: FeeRow) => {
    const confirmed = await confirm({ title: t('payments.fees.confirm.delete'), variant: 'destructive' })
    if (!confirmed) return
    try {
      await withScopedApiRequestHeaders(buildOptimisticLockHeader(row.updatedAt), () =>
        deleteCrud('payments/fees', row.id),
      )
      flash(t('payments.fees.flash.deleted'), 'success')
    } catch (err: unknown) {
      if (!surfaceRecordConflict(err, t)) flash(errorMessage(err, t('payments.fees.errors.delete')), 'error')
    }
    await queryClient.invalidateQueries({ queryKey: ['payments-fees'] })
  }

  return (
    <>
      <PaymentsNav current="fees">
        <DataTable<FeeRow>
          title={t('payments.fees.title')}
          titleHeadingLevel={1}
          entityId="payments:fee"
          extensionTableId="payments.fees"
          actions={
            <Button asChild>
              <Link href={`${FEES_HREF}/create`}>{t('payments.fees.actions.create')}</Link>
            </Button>
          }
          columns={columns}
          data={data?.items ?? []}
          isLoading={isLoading}
          error={error ? errorMessage(error, t('payments.fees.errors.load')) : null}
          emptyState={<p className="text-muted-foreground text-sm">{t('payments.fees.empty')}</p>}
          searchValue={search}
          searchPlaceholder={t('payments.fees.search')}
          onSearchChange={(value: string) => {
            setSearch(value)
            setPage(1)
          }}
          rowActions={(row: FeeRow) => (
            <RowActions
              items={[
                { id: 'edit', label: t('payments.common.edit'), href: `${FEES_HREF}/${row.id}/edit` },
                {
                  id: 'delete',
                  label: t('payments.common.delete'),
                  destructive: true,
                  onSelect: () => {
                    void remove(row)
                  },
                },
              ]}
            />
          )}
          onRowClick={(row: FeeRow) => {
            router.push(`${FEES_HREF}/${row.id}/edit`)
          }}
          pagination={{
            page,
            pageSize: PAGE_SIZE,
            total: data?.total ?? 0,
            totalPages: data?.totalPages ?? 0,
            onPageChange: setPage,
          }}
        />
      </PaymentsNav>
      {ConfirmDialogElement}
    </>
  )
}
