'use client'
// `/backend/payments/discounts` — the "Discounts" tab of B-20 (UX concept README B-20; payments spec REQ-011, R12,
// Q-006; issue #108): sibling rules (a percent, who pays the full rate, which fee periods) and custom rules (a percent
// or an amount for named persons); add, edit and delete.
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
import {
  DISCOUNTS_HREF,
  errorMessage,
  formatMoney,
  personName,
  type DiscountRuleRow,
  type TableColumns,
  type Translate,
} from './client-helpers'

const PAGE_SIZE = 50

/** "30 %, the oldest pays in full; monthly" or "PLN 20.00; Ola Nowak". */
function ruleSummary(t: Translate, locale: string, row: DiscountRuleRow): string {
  const value =
    row.percent !== null
      ? t('payments.discounts.value.percent', { percent: row.percent })
      : formatMoney(row.amount, locale)
  const periods = row.conditions.feePeriods.map((period) => t(`payments.fees.period.${period}`)).join(', ')
  const who =
    row.kind === 'sibling'
      ? t(`payments.discounts.fullRate.${row.conditions.fullRate ?? 'oldest'}`)
      : (row.persons ?? []).map((person) => personName(person)).join(', ')
  return [value, who, periods].filter(Boolean).join('; ')
}

function buildColumns(t: Translate, locale: string): TableColumns<DiscountRuleRow> {
  return [
    { accessorKey: 'name', header: t('payments.discounts.columns.name'), enableSorting: false, meta: { priority: 1 } },
    {
      accessorKey: 'kind',
      header: t('payments.discounts.columns.kind'),
      enableSorting: false,
      meta: { priority: 2 },
      cell: ({ row }) => (row.original.kind ? t(`payments.discounts.kind.${row.original.kind}`) : ''),
    },
    {
      id: 'rule',
      header: t('payments.discounts.columns.rule'),
      enableSorting: false,
      meta: { priority: 1 },
      cell: ({ row }) => ruleSummary(t, locale, row.original),
    },
    {
      accessorKey: 'validFrom',
      header: t('payments.discounts.columns.validity'),
      enableSorting: false,
      meta: { priority: 4 },
      cell: ({ row }) =>
        row.original.validTo
          ? t('payments.common.period.closed', { from: row.original.validFrom ?? '', to: row.original.validTo })
          : t('payments.common.period.open', { from: row.original.validFrom ?? '' }),
    },
  ]
}

export function DiscountRulesTable() {
  const t = useT()
  const locale = useLocale()
  const router = useRouter()
  const queryClient = useQueryClient()
  const scopeVersion = useOrganizationScopeVersion()
  const { confirm, ConfirmDialogElement } = useConfirmDialog()
  const [page, setPage] = React.useState(1)

  const { data, isLoading, error } = useQuery({
    queryKey: ['payments-discounts', page, scopeVersion],
    queryFn: () =>
      fetchCrudList<DiscountRuleRow>('payments/discount-rules', {
        page,
        pageSize: PAGE_SIZE,
        sortField: 'name',
        sortDir: 'asc',
      }),
  })

  const columns = React.useMemo(() => buildColumns(t, locale), [t, locale])

  const remove = async (row: DiscountRuleRow) => {
    const confirmed = await confirm({ title: t('payments.discounts.confirm.delete'), variant: 'destructive' })
    if (!confirmed) return
    try {
      await withScopedApiRequestHeaders(buildOptimisticLockHeader(row.updatedAt), () =>
        deleteCrud('payments/discount-rules', row.id),
      )
      flash(t('payments.discounts.flash.deleted'), 'success')
    } catch (err: unknown) {
      if (!surfaceRecordConflict(err, t)) flash(errorMessage(err, t('payments.discounts.errors.delete')), 'error')
    }
    await queryClient.invalidateQueries({ queryKey: ['payments-discounts'] })
  }

  return (
    <>
      <PaymentsNav current="discounts">
        <DataTable<DiscountRuleRow>
          title={t('payments.discounts.title')}
          titleHeadingLevel={1}
          entityId="payments:discount_rule"
          extensionTableId="payments.discounts"
          actions={
            <Button asChild>
              <Link href={`${DISCOUNTS_HREF}/create`}>{t('payments.discounts.actions.create')}</Link>
            </Button>
          }
          columns={columns}
          data={data?.items ?? []}
          isLoading={isLoading}
          error={error ? errorMessage(error, t('payments.discounts.errors.load')) : null}
          emptyState={<p className="text-muted-foreground text-sm">{t('payments.discounts.empty')}</p>}
          rowActions={(row: DiscountRuleRow) => (
            <RowActions
              items={[
                { id: 'edit', label: t('payments.common.edit'), href: `${DISCOUNTS_HREF}/${row.id}/edit` },
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
          onRowClick={(row: DiscountRuleRow) => {
            router.push(`${DISCOUNTS_HREF}/${row.id}/edit`)
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
