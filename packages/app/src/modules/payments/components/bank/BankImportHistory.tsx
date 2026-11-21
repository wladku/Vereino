'use client'
// The import history of B-29 (payments parity spec REQ-C04, DD-C13; issue #294): the latest imports as a table — file,
// when, who, items, recorded automatically, to confirm, unmatched, skipped — with the row action Delete on an import
// from which nothing was ever booked. The confirmation names the counts and says that skips and assignments are lost.
import * as React from 'react'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { RowActions } from '@open-mercato/ui/backend/RowActions'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useConfirmDialog } from '@open-mercato/ui/backend/confirm-dialog'
import { surfaceRecordConflict } from '@open-mercato/ui/backend/conflicts'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { TableLoadError } from '@vereino/ui'
import { errorMessage, personName, type TableColumns, type Translate } from '../client-helpers'
import { deleteImport, useBankImports, type BankImportRow } from './bank-client'

const COUNT_COLUMNS = [
  ['total', 'items'],
  ['booked', 'automatic'],
  ['suggested', 'toConfirm'],
  ['unmatched', 'unmatched'],
  ['skipped', 'skipped'],
] as const

function buildColumns(t: Translate, locale: string): TableColumns<BankImportRow> {
  return [
    {
      accessorKey: 'fileName',
      header: t('payments.bank.history.columns.file'),
      enableSorting: false,
      meta: { priority: 1 },
      cell: ({ row }) => <span className="font-medium break-all">{row.original.fileName}</span>,
    },
    {
      accessorKey: 'createdAt',
      header: t('payments.bank.history.columns.when'),
      enableSorting: false,
      meta: { priority: 1 },
      cell: ({ row }) => new Date(row.original.createdAt).toLocaleString(locale),
    },
    {
      id: 'importedBy',
      header: t('payments.bank.history.columns.who'),
      enableSorting: false,
      meta: { priority: 3 },
      cell: ({ row }) =>
        row.original.importedBy ? (
          personName(row.original.importedBy)
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    ...COUNT_COLUMNS.map(([key, label]): TableColumns<BankImportRow>[number] => ({
      accessorKey: key,
      header: t(`payments.bank.history.columns.${label}`),
      enableSorting: false,
      meta: { priority: key === 'total' ? 2 : 3 },
      cell: ({ row }) => <span className="tabular-nums">{row.original[key]}</span>,
    })),
  ]
}

export function BankImportHistory({ onDeleted }: { onDeleted: () => Promise<void> }) {
  const t = useT()
  const locale = useLocale()
  const { confirm, ConfirmDialogElement } = useConfirmDialog()
  const imports = useBankImports()
  const columns = React.useMemo(() => buildColumns(t, locale), [t, locale])

  const remove = async (row: BankImportRow) => {
    const confirmed = await confirm({
      title: t('payments.bank.history.delete.title', { file: row.fileName }),
      text: t('payments.bank.history.delete.help', {
        total: row.total,
        booked: row.booked,
        suggested: row.suggested,
        unmatched: row.unmatched,
        skipped: row.skipped,
      }),
      confirmText: t('payments.bank.history.delete.action'),
      variant: 'destructive',
    })
    if (!confirmed) return
    try {
      await deleteImport(row, t('payments.bank.errors.deleteImport'))
      flash(t('payments.bank.history.delete.done'), 'success')
      await onDeleted()
    } catch (error: unknown) {
      if (!surfaceRecordConflict(error, t, { onRefresh: () => void onDeleted() })) {
        flash(errorMessage(error, t('payments.bank.errors.deleteImport')), 'error')
      }
    }
  }

  return (
    <section data-testid="bank-history">
      <DataTable<BankImportRow>
        title={t('payments.bank.history.title')}
        titleHeadingLevel={2}
        columns={columns}
        data={imports.data?.items ?? []}
        isLoading={imports.isLoading}
        error={
          imports.error ? (
            <TableLoadError
              message={t('payments.bank.errors.history')}
              retryLabel={t('payments.common.retry')}
              onRetry={() => void imports.refetch()}
            />
          ) : null
        }
        emptyState={<p className="text-muted-foreground text-sm">{t('payments.bank.history.empty')}</p>}
        rowActions={(row: BankImportRow) =>
          row.deletable ? (
            <RowActions
              items={[
                {
                  id: 'delete',
                  label: t('payments.bank.history.delete.action'),
                  destructive: true,
                  onSelect: () => {
                    void remove(row)
                  },
                },
              ]}
            />
          ) : null
        }
      />
      {ConfirmDialogElement}
    </section>
  )
}
