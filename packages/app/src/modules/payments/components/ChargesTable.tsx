'use client'
// `/backend/payments/charges` — B-21 Charges (UX concept README B-21, flow F-07; payments spec REQ-011, REQ-012;
// issues #108, #109): the club's charges by perspective — membership fees (the default), all, overdue, without payer,
// cash payments, orders (and rentals once `facilities` is enabled) — searchable by surname and exportable to CSV. Each
// row shows the charge and its period, the payer (or "Without payer"), the amount with the discount, what remains,
// the due date with the overdue marker, the payee and the status, and opens the charge (B-22). "Generate period"
// creates all charges of a month at once and shows the summary. "Accept cash" (#114) takes cash for a payer's selected
// charges with a numbered receipt.
import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { fetchCrudList } from '@open-mercato/ui/backend/utils/crud'
import { Button } from '@open-mercato/ui/primitives/button'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@open-mercato/ui/primitives/tabs'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { useOrganizationScopeVersion } from '@open-mercato/shared/lib/frontend/useOrganizationScope'
import {
  chargePerspectiveOf,
  perspectiveQuery,
  toCsv,
  visiblePerspectives,
  type ChargePerspective,
} from '../lib/charge-ledger'
import { AcceptCashDialog } from './AcceptCashDialog'
import { GeneratePeriodDialog } from './GeneratePeriodDialog'
import {
  chargeHref,
  errorMessage,
  formatMoney,
  personName,
  type ChargeRow,
  type GenerationSummary,
  type TableColumns,
  type Translate,
} from './client-helpers'

const PAGE_SIZE = 50
const EXPORT_PAGE_SIZE = 100
const EXPORT_MAX_PAGES = 50

/** `facilities` is not part of this deployment yet; its rentals perspective appears with it (payments spec D-028). */
const FACILITIES_ENABLED = false

const STATUS_VARIANTS: Record<string, 'success' | 'warning' | 'error' | 'info' | 'neutral'> = {
  open: 'info',
  partially_paid: 'warning',
  paid: 'success',
  cancelled: 'neutral',
  forfeited: 'error',
}

export function ChargeStatusBadge({ status, t }: { status: string | null; t: Translate }) {
  if (!status) return null
  return (
    <StatusBadge variant={STATUS_VARIANTS[status] ?? 'neutral'} dot>
      {t(`payments.charges.status.${status}`)}
    </StatusBadge>
  )
}

export function OverdueBadge({ t }: { t: Translate }) {
  return (
    <span data-testid="charge-overdue">
      <StatusBadge variant="error">{t('payments.charges.overdue')}</StatusBadge>
    </span>
  )
}

function periodLabel(row: ChargeRow, t: Translate): string {
  return row.periodLabel === 'one_off' ? t('payments.fees.period.one_off') : (row.periodLabel ?? '')
}

function payeeLabel(payee: string | null, t: Translate): string {
  return t(`payments.charges.payee.${payee ?? 'club'}`)
}

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
      // A link, so the charge opens from the keyboard too (the row click is a mouse shortcut).
      cell: ({ row }) => (
        <Link
          href={chargeHref(row.original.id)}
          className="font-medium underline-offset-2 hover:underline"
          data-testid="charge-open"
          onClick={(event) => {
            event.stopPropagation()
          }}
        >
          {row.original.description}
        </Link>
      ),
    },
    {
      accessorKey: 'periodLabel',
      header: t('payments.charges.columns.period'),
      enableSorting: false,
      meta: { priority: 4 },
      cell: ({ row }) => periodLabel(row.original, t) || dash,
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
      accessorKey: 'amountDue',
      header: t('payments.charges.columns.amountDue'),
      enableSorting: false,
      meta: { priority: 1 },
      cell: ({ row }) => (
        <span className="flex flex-col">
          <span>{formatMoney(row.original.amountDue, locale)}</span>
          {row.original.discountAmount > 0 ? (
            <span className="text-muted-foreground text-xs">
              {formatMoney(row.original.amount, locale)} −{formatMoney(row.original.discountAmount, locale)}{' '}
              {row.original.discountRuleName ?? ''}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      accessorKey: 'remaining',
      header: t('payments.charges.columns.remaining'),
      enableSorting: false,
      meta: { priority: 2 },
      cell: ({ row }) => formatMoney(row.original.remaining ?? 0, locale),
    },
    {
      accessorKey: 'dueDate',
      header: t('payments.charges.columns.dueDate'),
      enableSorting: false,
      meta: { priority: 3 },
      cell: ({ row }) => (
        <span className="flex flex-wrap items-center gap-1">
          {row.original.dueDate ?? dash}
          {row.original.overdue ? <OverdueBadge t={t} /> : null}
        </span>
      ),
    },
    {
      accessorKey: 'payee',
      header: t('payments.charges.columns.payee'),
      enableSorting: false,
      meta: { priority: 5 },
      cell: ({ row }) => payeeLabel(row.original.payee, t),
    },
    {
      accessorKey: 'status',
      header: t('payments.charges.columns.status'),
      enableSorting: false,
      meta: { priority: 2 },
      cell: ({ row }) => <ChargeStatusBadge status={row.original.status} t={t} />,
    },
  ]
}

function csvRows(rows: readonly ChargeRow[], t: Translate): (string | number | null)[][] {
  const header = [
    t('payments.charges.columns.person'),
    t('payments.charges.columns.description'),
    t('payments.charges.columns.period'),
    t('payments.charges.columns.payer'),
    t('payments.charges.export.amount'),
    t('payments.charges.export.discount'),
    t('payments.charges.columns.amountDue'),
    t('payments.charges.columns.remaining'),
    t('payments.charges.columns.dueDate'),
    t('payments.charges.overdue'),
    t('payments.charges.columns.payee'),
    t('payments.charges.columns.status'),
  ]
  const money = (grosz: number) => (grosz / 100).toFixed(2)
  return [
    header,
    ...rows.map((row) => [
      personName(row.person),
      row.description,
      periodLabel(row, t),
      row.payerMissing ? t('payments.charges.payerMissing') : personName(row.payer),
      money(row.amount),
      money(row.discountAmount),
      money(row.amountDue),
      money(row.remaining ?? 0),
      row.dueDate,
      row.overdue ? t('payments.common.yes') : '',
      payeeLabel(row.payee, t),
      row.status ? t(`payments.charges.status.${row.status}`) : '',
    ]),
  ]
}

function download(name: string, text: string) {
  // The byte-order mark makes a spreadsheet read the file as UTF-8 (Polish letters).
  const url = URL.createObjectURL(new Blob(['﻿', text], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  URL.revokeObjectURL(url)
}

export function ChargesTable() {
  const t = useT()
  const locale = useLocale()
  const router = useRouter()
  const queryClient = useQueryClient()
  const scopeVersion = useOrganizationScopeVersion()
  const searchParams = useSearchParams()
  // A B-01 widget opens the list in its perspective (`?perspective=overdue`, #111); later tab changes stay local.
  const [perspective, setPerspective] = React.useState<ChargePerspective>(() =>
    chargePerspectiveOf(searchParams.get('perspective'), visiblePerspectives(FACILITIES_ENABLED)),
  )
  const [period, setPeriod] = React.useState('')
  const [search, setSearch] = React.useState('')
  const [page, setPage] = React.useState(1)
  const [generating, setGenerating] = React.useState(false)
  const [acceptingCash, setAcceptingCash] = React.useState(false)
  const [exporting, setExporting] = React.useState(false)
  const [summary, setSummary] = React.useState<GenerationSummary | null>(null)

  const filters = React.useMemo(
    () => ({
      ...perspectiveQuery(perspective),
      ...(period ? { period } : {}),
      ...(search.trim() ? { search: search.trim() } : {}),
    }),
    [perspective, period, search],
  )

  const { data, isLoading, error } = useQuery({
    queryKey: ['payments-charges', filters, page, scopeVersion],
    queryFn: () =>
      fetchCrudList<ChargeRow>('payments/charges', {
        page,
        pageSize: PAGE_SIZE,
        sortField: 'dueDate',
        sortDir: 'asc',
        ...filters,
      }),
  })

  const columns = React.useMemo(() => buildColumns(t, locale), [t, locale])

  const exportCsv = async () => {
    setExporting(true)
    try {
      const rows: ChargeRow[] = []
      for (let next = 1; next <= EXPORT_MAX_PAGES; next += 1) {
        const batch = await fetchCrudList<ChargeRow>('payments/charges', {
          page: next,
          pageSize: EXPORT_PAGE_SIZE,
          sortField: 'dueDate',
          sortDir: 'asc',
          ...filters,
        })
        rows.push(...batch.items)
        if (next >= batch.totalPages) break
      }
      download(`charges-${perspective}.csv`, toCsv(csvRows(rows, t)))
    } catch (failure: unknown) {
      flash(errorMessage(failure, t('payments.charges.export.error')), 'error')
    } finally {
      setExporting(false)
    }
  }

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
      <Tabs
        value={perspective}
        variant="underline"
        onValueChange={(value: string) => {
          setPerspective(value as ChargePerspective)
          setPage(1)
        }}
      >
        <div className="overflow-x-auto">
          <TabsList aria-label={t('payments.charges.perspectives.label')}>
            {visiblePerspectives(FACILITIES_ENABLED).map((value) => (
              <TabsTrigger key={value} value={value}>
                {t(`payments.charges.perspectives.${value}`)}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        {/* The active perspective's panel: every tab controls the one list (aria-controls must resolve). */}
        <TabsContent value={perspective} className="pt-2">
          <DataTable<ChargeRow>
            title={t('payments.charges.title')}
            titleHeadingLevel={1}
            entityId="payments:charge"
            extensionTableId="payments.charges"
            actions={
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  data-testid="charges-export"
                  disabled={exporting}
                  onClick={() => {
                    void exportCsv()
                  }}
                >
                  {exporting ? t('payments.charges.export.pending') : t('payments.charges.export.action')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  data-testid="accept-cash-open"
                  onClick={() => {
                    setAcceptingCash(true)
                  }}
                >
                  {t('payments.cash.action')}
                </Button>
                <Button
                  type="button"
                  data-testid="generate-period-open"
                  onClick={() => {
                    setGenerating(true)
                  }}
                >
                  {t('payments.charges.actions.generate')}
                </Button>
              </div>
            }
            searchValue={search}
            onSearchChange={(value: string) => {
              setSearch(value)
              setPage(1)
            }}
            searchPlaceholder={t('payments.charges.search')}
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
            onRowClick={(row: ChargeRow) => {
              router.push(chargeHref(row.id))
            }}
            pagination={{
              page,
              pageSize: PAGE_SIZE,
              total: data?.total ?? 0,
              totalPages: data?.totalPages ?? 0,
              onPageChange: setPage,
            }}
          />
        </TabsContent>
      </Tabs>
      <AcceptCashDialog
        open={acceptingCash}
        onOpenChange={setAcceptingCash}
        onDone={async () => {
          await queryClient.invalidateQueries({ queryKey: ['payments-charges'] })
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
