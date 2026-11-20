'use client'
// `/backend/payments/charges` — B-21 Charges (UX concept README B-21, flow F-07; payments spec REQ-011, REQ-012;
// issues #108, #109): the club's charges by perspective — membership fees (the default), all, overdue, without payer,
// cash payments, orders and "Rentals (municipality)" when the list response allows it (DD-C02, #291) — filtered by
// period and payee, searchable by surname and exportable to CSV. Each row shows the charge and its period, the payer
// (an institution, a person or a renter's name; or "Without payer"), the amount with the discount, what remains, the
// due date with the overdue marker, the payee and the status, and opens the charge (B-22). "Generate period"
// creates all charges of a month at once and shows the summary; "Generations" lists the runs with their undo (#403).
// "Accept cash" (#114) takes cash for a payer's selected charges with a numbered receipt; "Import statement" opens B-29. The perspectives follow the mockup's order, the
// perspective, filters, search and page live in the URL (restored on reload; precedent DD-U03), rows come in the list's
// default order — the newest period first, then the due date — and Remaining reads "—" once nothing is owed (#292).
// "Add charge" enters a charge by hand (#295); the person record's "Charges" tab reuses the columns. "To refund" lists
// the charges holding an online overpayment not refunded yet, shown only when it is not empty (DD-C10, #296).
import * as React from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { fetchCrudList } from '@open-mercato/ui/backend/utils/crud'
import { Button } from '@open-mercato/ui/primitives/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@open-mercato/ui/primitives/tabs'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { useOrganizationScopeVersion } from '@open-mercato/shared/lib/frontend/useOrganizationScope'
import { TableLoadError } from '@vereino/ui'
import {
  DEFAULT_CHARGE_PERSPECTIVE,
  PAYEES,
  chargeListUrlParams,
  payerDisplayName,
  perspectiveQuery,
  readChargeListUrl,
  remainingShown,
  toCsv,
  visiblePerspectives,
  type ChargeListUrlState,
  type ChargePerspective,
} from '../lib/charge-ledger'
import { AcceptCashButton } from './AcceptCashButton'
import { AddChargeDialog } from './AddChargeDialog'
import { GeneratePeriodDialog } from './GeneratePeriodDialog'
import {
  BANK_HREF,
  GENERATIONS_HREF,
  chargeHref,
  errorMessage,
  formatMoney,
  personName,
  type ChargeRow,
  type GenerationSummary,
  type TableColumns,
  type Translate,
} from './client-helpers'
import { StatusTag } from '@vereino/ui'

const PAGE_SIZE = 50
const EXPORT_PAGE_SIZE = 100
const EXPORT_MAX_PAGES = 50

const STATUS_VARIANTS: Record<string, 'success' | 'warning' | 'error' | 'info' | 'neutral'> = {
  open: 'info',
  partially_paid: 'warning',
  paid: 'success',
  cancelled: 'neutral',
  forfeited: 'error',
}

export function ChargeStatusBadge({ status, t }: { status: string | null; t: Translate }) {
  if (!status) return null
  return <StatusTag status={STATUS_VARIANTS[status] ?? 'neutral'}>{t(`payments.charges.status.${status}`)}</StatusTag>
}

export function OverdueBadge({ t }: { t: Translate }) {
  return (
    <span data-testid="charge-overdue">
      <StatusTag status="error">{t('payments.charges.overdue')}</StatusTag>
    </span>
  )
}

function periodLabel(row: ChargeRow, t: Translate): string {
  return row.periodLabel === 'one_off' ? t('payments.fees.period.one_off') : (row.periodLabel ?? '')
}

/** The payee: the club, or the owner institution's name when the charge names one, else "Municipality". */
function payeeLabel(row: Pick<ChargeRow, 'payee' | 'payeeInstitution'>, t: Translate): string {
  if (row.payee === 'owner_institution' && row.payeeInstitution?.name) return row.payeeInstitution.name
  return t(`payments.charges.payee.${row.payee ?? 'club'}`)
}

type ChargeList = Awaited<ReturnType<typeof fetchCrudList<ChargeRow>>> & {
  meta?: { rentalsPerspective?: boolean; toRefundCount?: number }
}

/** The B-21 columns; the person record's "Charges" tab shows the same (#295). */
export function chargeColumns(t: Translate, locale: string): TableColumns<ChargeRow> {
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
          payerDisplayName(row.original) || dash
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
      cell: ({ row }) =>
        remainingShown(row.original.status) ? formatMoney(row.original.remaining ?? 0, locale) : dash,
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
      cell: ({ row }) => payeeLabel(row.original, t),
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
      row.payerMissing ? t('payments.charges.payerMissing') : (payerDisplayName(row) ?? ''),
      money(row.amount),
      money(row.discountAmount),
      money(row.amountDue),
      remainingShown(row.status) ? money(row.remaining ?? 0) : '',
      row.dueDate,
      row.overdue ? t('payments.common.yes') : '',
      payeeLabel(row, t),
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
  const pathname = usePathname()
  const queryClient = useQueryClient()
  const scopeVersion = useOrganizationScopeVersion()
  const searchParams = useSearchParams()
  // The URL holds the perspective, the filters, the search and the page, so a reload or a shared link restores them;
  // a B-01 widget's `?perspective=overdue` link (#111) is the same state. Changes replace the URL without a reload.
  const state = React.useMemo(() => readChargeListUrl((key) => searchParams.get(key)), [searchParams])
  const { perspective, period, payee, page } = state
  // The search box is local while typing; the URL follows it. A search changed from outside is adopted during render.
  const [search, setSearch] = React.useState(state.search)
  const [urlSearch, setUrlSearch] = React.useState(state.search)
  if (urlSearch !== state.search) {
    setUrlSearch(state.search)
    setSearch(state.search)
  }
  const navigate = React.useCallback(
    (change: Partial<ChargeListUrlState>) => {
      const query = new URLSearchParams(chargeListUrlParams({ ...state, page: 1, ...change })).toString()
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
    },
    [pathname, router, state],
  )
  const [generating, setGenerating] = React.useState(false)
  const [adding, setAdding] = React.useState(false)
  const [exporting, setExporting] = React.useState(false)
  const [summary, setSummary] = React.useState<GenerationSummary | null>(null)

  const filters = React.useMemo(
    () => ({
      ...perspectiveQuery(perspective),
      ...(period ? { period } : {}),
      ...(payee ? { payee } : {}),
      ...(state.search.trim() ? { search: state.search.trim() } : {}),
    }),
    [perspective, period, payee, state.search],
  )

  const { data, isLoading, error, refetch } = useQuery<ChargeList>({
    queryKey: ['payments-charges', filters, page, scopeVersion],
    queryFn: () => fetchCrudList<ChargeRow>('payments/charges', { page, pageSize: PAGE_SIZE, ...filters }),
  })

  const columns = React.useMemo(() => chargeColumns(t, locale), [t, locale])

  // DD-C02: the response says whether the club shows "Rentals (municipality)"; a link that opens it keeps its tab.
  // DD-C10: "To refund" shows only while an overpayment waits; a link that opens it keeps its tab until the list loads.
  const toRefundCount = data?.meta?.toRefundCount
  const perspectives = visiblePerspectives({
    rentals: data?.meta?.rentalsPerspective === true || perspective === 'rentals',
    toRefund: (toRefundCount ?? 0) > 0 || (perspective === 'to_refund' && toRefundCount === undefined),
  })
  // Once the last overpayment is refunded, the empty "To refund" perspective goes and the default one opens.
  React.useEffect(() => {
    if (perspective === 'to_refund' && toRefundCount === 0) navigate({ perspective: DEFAULT_CHARGE_PERSPECTIVE })
  }, [navigate, perspective, toRefundCount])

  const exportCsv = async () => {
    setExporting(true)
    try {
      const rows: ChargeRow[] = []
      for (let next = 1; next <= EXPORT_MAX_PAGES; next += 1) {
        const batch = await fetchCrudList<ChargeRow>('payments/charges', {
          page: next,
          pageSize: EXPORT_PAGE_SIZE,
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
          navigate({ perspective: value as ChargePerspective })
        }}
      >
        <div className="overflow-x-auto">
          <TabsList aria-label={t('payments.charges.perspectives.label')}>
            {perspectives.map((value) => (
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
                <AcceptCashButton
                  origin="charges"
                  onDone={async () => {
                    await queryClient.invalidateQueries({ queryKey: ['payments-charges'] })
                  }}
                />
                <Button asChild variant="outline">
                  <Link href={BANK_HREF} data-testid="charges-import-statement">
                    {t('payments.charges.actions.importStatement')}
                  </Link>
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  data-testid="add-charge-open"
                  onClick={() => {
                    setAdding(true)
                  }}
                >
                  {t('payments.manual.action')}
                </Button>
                <Button asChild variant="outline">
                  <Link href={GENERATIONS_HREF} data-testid="charges-generations">
                    {t('payments.charges.actions.generations')}
                  </Link>
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
              setUrlSearch(value)
              navigate({ search: value })
            }}
            searchPlaceholder={t('payments.charges.search')}
            filters={[
              {
                id: 'period',
                label: t('payments.charges.filters.period'),
                type: 'text',
              },
              {
                id: 'payee',
                label: t('payments.charges.filters.payee'),
                type: 'select',
                options: PAYEES.map((value) => ({ value, label: t(`payments.charges.payee.${value}`) })),
              },
            ]}
            filterValues={{ period, payee }}
            onFiltersApply={(values: Record<string, unknown>) => {
              navigate({
                period: typeof values.period === 'string' ? values.period.trim() : '',
                payee:
                  typeof values.payee === 'string' && (PAYEES as readonly string[]).includes(values.payee)
                    ? (values.payee as ChargeListUrlState['payee'])
                    : '',
              })
            }}
            onFiltersClear={() => {
              navigate({ period: '', payee: '' })
            }}
            columns={columns}
            data={data?.items ?? []}
            isLoading={isLoading}
            error={
              error ? (
                <TableLoadError
                  message={t('payments.charges.errors.load')}
                  retryLabel={t('payments.common.retry')}
                  onRetry={() => void refetch()}
                />
              ) : null
            }
            emptyState={<p className="text-muted-foreground text-sm">{t('payments.charges.empty')}</p>}
            onRowClick={(row: ChargeRow) => {
              router.push(chargeHref(row.id))
            }}
            pagination={{
              page,
              pageSize: PAGE_SIZE,
              total: data?.total ?? 0,
              totalPages: data?.totalPages ?? 0,
              onPageChange: (next: number) => {
                navigate({ page: next })
              },
            }}
          />
        </TabsContent>
      </Tabs>
      {adding ? (
        <AddChargeDialog
          open={adding}
          onOpenChange={setAdding}
          onCreated={async () => {
            await queryClient.invalidateQueries({ queryKey: ['payments-charges'] })
          }}
        />
      ) : null}
      <GeneratePeriodDialog
        open={generating}
        onOpenChange={setGenerating}
        onGenerated={async (result) => {
          setSummary(result)
          navigate({ period: result.period })
          flash(t('payments.charges.generate.done'), 'success')
          await queryClient.invalidateQueries({ queryKey: ['payments-charges'] })
        }}
      />
    </div>
  )
}
