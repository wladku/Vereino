'use client'
// `/backend/payments/bank` — B-29 "Bank statement" (UX concept README B-29; payments spec REQ-030, TEST-042; issue
// #113): import a statement, then work the queue by perspective — To confirm (the default), Unmatched, Recorded,
// Skipped and All, each with its count. Each transfer shows the day, the amount, the sender and title, the payer with
// their code, the charges it pays (oldest first) and why it was matched; its actions are Confirm, Change or Assign,
// Skip, Restore (a skipped one) and Undo (a recorded one). The import history lists the latest imports with counts.
import * as React from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { RowActions } from '@open-mercato/ui/backend/RowActions'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useConfirmDialog } from '@open-mercato/ui/backend/confirm-dialog'
import { surfaceRecordConflict } from '@open-mercato/ui/backend/conflicts'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@open-mercato/ui/primitives/tabs'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import {
  BANK_PERSPECTIVES,
  DEFAULT_BANK_PERSPECTIVE,
  actionsFor,
  type BankAction,
  type BankPerspective,
} from '../../lib/bank-matching'
import { errorMessage, formatMoney, personName, type TableColumns, type Translate } from '../client-helpers'
import { BankAssignDialog, BankSkipDialog } from './BankDecisionDialogs'
import { BankImportPanel } from './BankImportPanel'
import {
  BANK_PAGE_SIZE,
  BANK_QUERY_KEY,
  decide,
  useBankImports,
  useBankTransfers,
  type BankTransfer,
} from './bank-client'

const STATUS_VARIANTS: Record<BankTransfer['status'], 'success' | 'warning' | 'info' | 'neutral'> = {
  booked: 'success',
  suggested: 'warning',
  unmatched: 'info',
  ignored: 'neutral',
}

function reasonText(row: BankTransfer, t: Translate): string {
  if (row.status === 'ignored' && row.skipReason) {
    const reason = t(`payments.bank.skipReasons.${row.skipReason}`)
    return row.skipNote ? `${reason}: ${row.skipNote}` : reason
  }
  return t(`payments.bank.reasons.${row.matchReason}`)
}

function buildColumns(t: Translate, locale: string): TableColumns<BankTransfer> {
  const dash = <span className="text-muted-foreground">—</span>
  return [
    {
      accessorKey: 'bookedOn',
      header: t('payments.bank.columns.date'),
      enableSorting: false,
      meta: { priority: 2 },
    },
    {
      accessorKey: 'amount',
      header: t('payments.bank.columns.amount'),
      enableSorting: false,
      meta: { priority: 1 },
      cell: ({ row }) => <span className="font-medium">{formatMoney(row.original.amount, locale)}</span>,
    },
    {
      id: 'transfer',
      header: t('payments.bank.columns.transfer'),
      enableSorting: false,
      meta: { priority: 1 },
      cell: ({ row }) => (
        <span className="flex flex-col">
          <span>{row.original.counterpartyName || dash}</span>
          <span className="text-muted-foreground text-xs" data-testid="bank-transfer-title">
            {row.original.title}
          </span>
        </span>
      ),
    },
    {
      id: 'payer',
      header: t('payments.bank.columns.payer'),
      enableSorting: false,
      meta: { priority: 2 },
      cell: ({ row }) =>
        row.original.payer ? (
          <span className="flex flex-col" data-testid="bank-transfer-payer">
            <span>{personName(row.original.payer)}</span>
            {row.original.payerCode ? (
              <span className="text-muted-foreground font-mono text-xs">{row.original.payerCode}</span>
            ) : null}
          </span>
        ) : (
          dash
        ),
    },
    {
      id: 'allocation',
      header: t('payments.bank.columns.allocation'),
      enableSorting: false,
      meta: { priority: 3 },
      cell: ({ row }) =>
        row.original.allocation.length === 0 ? (
          dash
        ) : (
          <ul className="flex flex-col text-xs">
            {row.original.allocation.map((line) => (
              <li key={line.chargeId}>
                {line.description ?? t('payments.bank.chargeUnknown')} — {formatMoney(line.amount, locale)}
              </li>
            ))}
            {row.original.unallocated > 0 ? (
              <li className="text-status-warning-text">
                {t('payments.bank.unallocated', { amount: formatMoney(row.original.unallocated, locale) })}
              </li>
            ) : null}
          </ul>
        ),
    },
    {
      id: 'reason',
      header: t('payments.bank.columns.reason'),
      enableSorting: false,
      meta: { priority: 3 },
      cell: ({ row }) => (
        <span className="text-sm" data-testid="bank-transfer-reason">
          {reasonText(row.original, t)}
        </span>
      ),
    },
    {
      accessorKey: 'status',
      header: t('payments.bank.columns.status'),
      enableSorting: false,
      meta: { priority: 2 },
      cell: ({ row }) => (
        <span data-testid={`bank-status-${row.original.status}`}>
          <StatusBadge variant={STATUS_VARIANTS[row.original.status]} dot>
            {t(`payments.bank.status.${row.original.status}`)}
          </StatusBadge>
        </span>
      ),
    },
  ]
}

export function BankStatementPage() {
  const t = useT()
  const locale = useLocale()
  const queryClient = useQueryClient()
  const { confirm, ConfirmDialogElement } = useConfirmDialog()
  const [perspective, setPerspective] = React.useState<BankPerspective>(DEFAULT_BANK_PERSPECTIVE)
  const [page, setPage] = React.useState(1)
  const [assigning, setAssigning] = React.useState<BankTransfer | null>(null)
  const [skipping, setSkipping] = React.useState<BankTransfer | null>(null)
  const transfers = useBankTransfers(perspective, page)
  const imports = useBankImports()
  const columns = React.useMemo(() => buildColumns(t, locale), [t, locale])
  const counts = transfers.data?.counts

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: [BANK_QUERY_KEY] })
    await queryClient.invalidateQueries({ queryKey: ['payments-charges'] })
  }

  const act = async (row: BankTransfer, action: BankAction) => {
    if (action === 'assign') {
      setAssigning(row)
      return
    }
    if (action === 'ignore') {
      setSkipping(row)
      return
    }
    if (action === 'undo') {
      const confirmed = await confirm({
        title: t('payments.bank.undo.title'),
        text: t('payments.bank.undo.help'),
        variant: 'destructive',
      })
      if (!confirmed) return
    }
    try {
      await decide(row, action, null, t('payments.bank.errors.decide'))
      flash(t(`payments.bank.flash.${action}`), 'success')
      await refresh()
    } catch (error: unknown) {
      if (!surfaceRecordConflict(error, t, { onRefresh: () => void refresh() })) {
        flash(errorMessage(error, t('payments.bank.errors.decide')), 'error')
      }
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <BankImportPanel
        onImported={() => {
          setPerspective(DEFAULT_BANK_PERSPECTIVE)
          setPage(1)
        }}
      />
      <Tabs
        value={perspective}
        variant="underline"
        onValueChange={(value: string) => {
          setPerspective(value as BankPerspective)
          setPage(1)
        }}
      >
        <div className="overflow-x-auto">
          <TabsList aria-label={t('payments.bank.perspectives.label')}>
            {BANK_PERSPECTIVES.map((value) => (
              <TabsTrigger key={value} value={value}>
                {t(`payments.bank.perspectives.${value}`)}
                {counts ? <span className="text-muted-foreground ml-1 text-xs">({counts[value]})</span> : null}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <TabsContent value={perspective} className="pt-2">
          <DataTable<BankTransfer>
            title={t('payments.bank.title')}
            titleHeadingLevel={1}
            entityId="payments:bank_transaction"
            extensionTableId="payments.bank_transactions"
            columns={columns}
            data={transfers.data?.items ?? []}
            isLoading={transfers.isLoading}
            error={transfers.error ? errorMessage(transfers.error, t('payments.bank.errors.load')) : null}
            emptyState={
              <p className="text-muted-foreground text-sm" data-testid="bank-empty">
                {t(`payments.bank.empty.${perspective}`)}
              </p>
            }
            rowActions={(row: BankTransfer) => {
              const actions = actionsFor(row.status, row.payerPersonId !== null)
              return (
                <RowActions
                  items={actions.map((action) => ({
                    id: action,
                    label: t(
                      action === 'assign' && row.payerPersonId
                        ? 'payments.bank.actions.change'
                        : `payments.bank.actions.${action}`,
                    ),
                    destructive: action === 'undo',
                    onSelect: () => {
                      void act(row, action)
                    },
                  }))}
                />
              )
            }}
            pagination={{
              page,
              pageSize: BANK_PAGE_SIZE,
              total: transfers.data?.total ?? 0,
              totalPages: transfers.data?.totalPages ?? 0,
              onPageChange: setPage,
            }}
          />
        </TabsContent>
      </Tabs>
      <section className="flex flex-col gap-2" aria-labelledby="bank-history-heading">
        <h2 id="bank-history-heading" className="text-base font-semibold">
          {t('payments.bank.history.title')}
        </h2>
        {imports.isLoading ? (
          <p className="text-muted-foreground text-sm" role="status">
            {t('payments.bank.loading')}
          </p>
        ) : imports.error ? (
          <p className="text-destructive text-sm" role="alert">
            {errorMessage(imports.error, t('payments.bank.errors.history'))}
          </p>
        ) : (imports.data?.items.length ?? 0) === 0 ? (
          <p className="text-muted-foreground text-sm">{t('payments.bank.history.empty')}</p>
        ) : (
          <ul className="flex flex-col divide-y rounded-md border" data-testid="bank-history">
            {imports.data?.items.map((row) => (
              <li key={row.id} className="flex flex-col gap-1 p-3 text-sm sm:flex-row sm:justify-between">
                <span>
                  <span className="font-medium">{row.fileName}</span>{' '}
                  <span className="text-muted-foreground">
                    {new Date(row.createdAt).toLocaleString(locale)}
                    {row.importedBy ? ` · ${personName(row.importedBy)}` : ''}
                  </span>
                </span>
                <span className="text-muted-foreground">
                  {t('payments.bank.import.summary', {
                    total: row.total,
                    booked: row.booked,
                    suggested: row.suggested,
                    unmatched: row.unmatched,
                    skipped: row.skipped,
                  })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <BankAssignDialog
        transfer={assigning}
        onClose={() => {
          setAssigning(null)
        }}
        onDone={refresh}
      />
      <BankSkipDialog
        transfer={skipping}
        onClose={() => {
          setSkipping(null)
        }}
        onDone={refresh}
      />
      {ConfirmDialogElement}
    </div>
  )
}
