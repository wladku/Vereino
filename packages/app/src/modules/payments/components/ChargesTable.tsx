'use client'
// `/backend/payments/charges` — B-21 Charges, the generation part (UX concept README B-21, flow F-07; payments spec
// REQ-011; issue #108): the club's charges of a period with the debtor, the payer (or "Without payer"), the amount,
// the discount with the rule's name, the amount due, the due date and the status; "Generate period" creates all
// charges of a month at once and shows the summary. The perspectives, payment recording and cash arrive with E07-S02.
import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { fetchCrudList } from '@open-mercato/ui/backend/utils/crud'
import { Button } from '@open-mercato/ui/primitives/button'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { useOrganizationScopeVersion } from '@open-mercato/shared/lib/frontend/useOrganizationScope'
import { GeneratePeriodDialog } from './GeneratePeriodDialog'
import {
  errorMessage,
  formatMoney,
  localMonth,
  personName,
  type ChargeRow,
  type GenerationSummary,
  type TableColumns,
  type Translate,
} from './client-helpers'

const PAGE_SIZE = 50

function buildColumns(t: Translate, locale: string): TableColumns<ChargeRow> {
  const dash = <span className="text-muted-foreground">—</span>
  return [
    {
      id: 'person',
      header: t('payments.charges.columns.person'),
      enableSorting: false,
      meta: { priority: 1 },
      cell: ({ row }) => personName(row.original.person) || dash,
    },
    {
      accessorKey: 'description',
      header: t('payments.charges.columns.description'),
      enableSorting: false,
      meta: { priority: 2 },
      cell: ({ row }) => (
        <span>
          {row.original.description}{' '}
          <span className="text-muted-foreground text-xs">
            {row.original.periodLabel === 'one_off'
              ? t('payments.fees.period.one_off')
              : (row.original.periodLabel ?? '')}
          </span>
        </span>
      ),
    },
    {
      id: 'payer',
      header: t('payments.charges.columns.payer'),
      enableSorting: false,
      meta: { priority: 3 },
      cell: ({ row }) =>
        row.original.payerMissing ? (
          <span className="text-status-warning-text font-medium" data-testid="charge-payer-missing">
            {t('payments.charges.payerMissing')}
          </span>
        ) : (
          personName(row.original.payer) || dash
        ),
    },
    {
      accessorKey: 'amount',
      header: t('payments.charges.columns.amount'),
      enableSorting: false,
      meta: { priority: 4 },
      cell: ({ row }) => formatMoney(row.original.amount, locale),
    },
    {
      accessorKey: 'discountAmount',
      header: t('payments.charges.columns.discount'),
      enableSorting: false,
      meta: { priority: 3 },
      cell: ({ row }) =>
        row.original.discountAmount > 0 ? (
          <span>
            −{formatMoney(row.original.discountAmount, locale)}{' '}
            <span className="text-muted-foreground text-xs">{row.original.discountRuleName ?? ''}</span>
          </span>
        ) : (
          dash
        ),
    },
    {
      accessorKey: 'amountDue',
      header: t('payments.charges.columns.amountDue'),
      enableSorting: false,
      meta: { priority: 1 },
      cell: ({ row }) => formatMoney(row.original.amountDue, locale),
    },
    {
      accessorKey: 'dueDate',
      header: t('payments.charges.columns.dueDate'),
      enableSorting: false,
      meta: { priority: 5 },
      cell: ({ row }) => row.original.dueDate ?? dash,
    },
    {
      accessorKey: 'status',
      header: t('payments.charges.columns.status'),
      enableSorting: false,
      meta: { priority: 4 },
      cell: ({ row }) => (row.original.status ? t(`payments.charges.status.${row.original.status}`) : dash),
    },
  ]
}

export function ChargesTable() {
  const t = useT()
  const locale = useLocale()
  const queryClient = useQueryClient()
  const scopeVersion = useOrganizationScopeVersion()
  const [period, setPeriod] = React.useState(localMonth)
  const [page, setPage] = React.useState(1)
  const [generating, setGenerating] = React.useState(false)
  const [summary, setSummary] = React.useState<GenerationSummary | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['payments-charges', period, page, scopeVersion],
    queryFn: () =>
      fetchCrudList<ChargeRow>('payments/charges', {
        page,
        pageSize: PAGE_SIZE,
        sortField: 'dueDate',
        sortDir: 'asc',
        ...(period ? { period } : {}),
      }),
  })

  const columns = React.useMemo(() => buildColumns(t, locale), [t, locale])

  return (
    <div className="flex flex-col gap-4">
      {summary ? (
        <div
          role="status"
          data-testid="generation-summary"
          className="border-status-success-border bg-status-success-bg text-status-success-text rounded-md border p-3 text-sm"
        >
          {t('payments.charges.generate.summary', {
            period: summary.period,
            created: summary.created,
            skipped: summary.skipped,
            payerMissing: summary.payerMissing,
          })}
        </div>
      ) : null}
      <DataTable<ChargeRow>
        title={t('payments.charges.title')}
        titleHeadingLevel={1}
        entityId="payments:charge"
        extensionTableId="payments.charges"
        actions={
          <Button
            type="button"
            data-testid="generate-period-open"
            onClick={() => {
              setGenerating(true)
            }}
          >
            {t('payments.charges.actions.generate')}
          </Button>
        }
        filters={[
          {
            id: 'period',
            label: t('payments.charges.filters.period'),
            type: 'text',
          },
        ]}
        filterValues={{ period }}
        onFiltersApply={(values: Record<string, unknown>) => {
          setPeriod(typeof values.period === 'string' ? values.period.trim() : '')
          setPage(1)
        }}
        onFiltersClear={() => {
          setPeriod('')
          setPage(1)
        }}
        columns={columns}
        data={data?.items ?? []}
        isLoading={isLoading}
        error={error ? errorMessage(error, t('payments.charges.errors.load')) : null}
        emptyState={<p className="text-muted-foreground text-sm">{t('payments.charges.empty')}</p>}
        pagination={{
          page,
          pageSize: PAGE_SIZE,
          total: data?.total ?? 0,
          totalPages: data?.totalPages ?? 0,
          onPageChange: setPage,
        }}
      />
      <GeneratePeriodDialog
        open={generating}
        onOpenChange={setGenerating}
        onGenerated={async (result) => {
          setSummary(result)
          setPeriod(result.period)
          setPage(1)
          flash(t('payments.charges.generate.done'), 'success')
          await queryClient.invalidateQueries({ queryKey: ['payments-charges'] })
        }}
      />
    </div>
  )
}
