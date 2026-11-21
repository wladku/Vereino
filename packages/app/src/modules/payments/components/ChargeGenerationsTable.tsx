'use client'
// The generation list (owner decision (a) on #403; payments parity spec risk row "Automatic generation creates charges
// the club did not expect"): every charge generation of the club, by hand or by the daily job, newest first — month,
// when, created, skipped, without payer, still open and the status — with the row action Undo on a run not undone yet.
// The confirmation names the open charges it cancels; the undo sends the run's lock token and a stale row surfaces the
// conflict.
import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { RowActions } from '@open-mercato/ui/backend/RowActions'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useConfirmDialog } from '@open-mercato/ui/backend/confirm-dialog'
import { surfaceRecordConflict } from '@open-mercato/ui/backend/conflicts'
import { apiCallOrThrow, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { useOrganizationScopeVersion } from '@open-mercato/shared/lib/frontend/useOrganizationScope'
import { errorCode, errorMessage, type TableColumns, type Translate } from './client-helpers'
import { StatusTag } from '@vereino/ui'

const PAGE_SIZE = 20

export type ChargeGenerationRow = {
  id: string
  period: string
  created: number
  skipped: number
  payerMissing: number
  open: number
  cancelled: number | null
  undoneAt: string | null
  createdAt: string
  updatedAt: string
}

type GenerationList = { items: ChargeGenerationRow[]; total: number; totalPages: number }

const COUNT_COLUMNS = ['created', 'skipped', 'payerMissing', 'open'] as const

function buildColumns(t: Translate, locale: string): TableColumns<ChargeGenerationRow> {
  return [
    {
      accessorKey: 'period',
      header: t('payments.generations.columns.period'),
      enableSorting: false,
      meta: { priority: 1 },
      cell: ({ row }) => <span className="font-medium tabular-nums">{row.original.period}</span>,
    },
    {
      accessorKey: 'createdAt',
      header: t('payments.generations.columns.when'),
      enableSorting: false,
      meta: { priority: 2 },
      cell: ({ row }) => new Date(row.original.createdAt).toLocaleString(locale),
    },
    ...COUNT_COLUMNS.map((key): TableColumns<ChargeGenerationRow>[number] => ({
      accessorKey: key,
      header: t(`payments.generations.columns.${key}`),
      enableSorting: false,
      meta: { priority: key === 'created' || key === 'open' ? 2 : 3 },
      cell: ({ row }) => <span className="tabular-nums">{row.original[key]}</span>,
    })),
    {
      id: 'status',
      header: t('payments.generations.columns.status'),
      enableSorting: false,
      meta: { priority: 1 },
      cell: ({ row }) =>
        row.original.undoneAt ? (
          <StatusTag status="neutral">
            {t('payments.generations.status.undone', { cancelled: row.original.cancelled ?? 0 })}
          </StatusTag>
        ) : (
          <StatusTag status="success">{t('payments.generations.status.active')}</StatusTag>
        ),
    },
  ]
}

async function undoGeneration(row: ChargeGenerationRow, failure: string): Promise<{ cancelled: number }> {
  const call = await withScopedApiRequestHeaders(buildOptimisticLockHeader(row.updatedAt), () =>
    apiCallOrThrow<{ cancelled: number }>(
      `/api/payments/charge-generations/${encodeURIComponent(row.id)}/undo`,
      { method: 'POST' },
      { errorMessage: failure },
    ),
  )
  return { cancelled: call.result?.cancelled ?? 0 }
}

export function ChargeGenerationsTable() {
  const t = useT()
  const locale = useLocale()
  const queryClient = useQueryClient()
  const scopeVersion = useOrganizationScopeVersion()
  const { confirm, ConfirmDialogElement } = useConfirmDialog()
  const [page, setPage] = React.useState(1)
  const columns = React.useMemo(() => buildColumns(t, locale), [t, locale])

  const { data, isLoading, error } = useQuery<GenerationList>({
    queryKey: ['payments-charge-generations', page, scopeVersion],
    queryFn: async () => {
      const call = await apiCallOrThrow<GenerationList>(
        `/api/payments/charge-generations?page=${String(page)}&pageSize=${String(PAGE_SIZE)}`,
      )
      return call.result ?? { items: [], total: 0, totalPages: 0 }
    },
  })

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['payments-charge-generations'] }),
      queryClient.invalidateQueries({ queryKey: ['payments-charges'] }),
    ])
  }

  const undo = async (row: ChargeGenerationRow) => {
    const confirmed = await confirm({
      title: t('payments.generations.undo.title', { period: row.period }),
      text: t('payments.generations.undo.help', { open: row.open }),
      confirmText: t('payments.generations.undo.action'),
      variant: 'destructive',
    })
    if (!confirmed) return
    try {
      const { cancelled } = await undoGeneration(row, t('payments.generations.errors.undo'))
      flash(t('payments.generations.undo.done', { period: row.period, cancelled }), 'success')
      await refresh()
    } catch (failure: unknown) {
      if (surfaceRecordConflict(failure, t, { onRefresh: () => void refresh() })) return
      const code = errorCode(failure)
      flash(
        code === 'generation_in_progress' || code === 'generation_already_undone'
          ? t(`payments.errors.${code}`)
          : errorMessage(failure, t('payments.generations.errors.undo')),
        'error',
      )
      if (code === 'generation_already_undone') await refresh()
    }
  }

  return (
    <section data-testid="charge-generations" className="flex flex-col gap-2">
      <p data-testid="charge-generations-help" className="text-muted-foreground text-sm">
        {t('payments.generations.help')}
      </p>
      <DataTable<ChargeGenerationRow>
        title={t('payments.generations.title')}
        titleHeadingLevel={1}
        columns={columns}
        data={data?.items ?? []}
        isLoading={isLoading}
        error={error ? errorMessage(error, t('payments.generations.errors.list')) : null}
        emptyState={<p className="text-muted-foreground text-sm">{t('payments.generations.empty')}</p>}
        rowActions={(row: ChargeGenerationRow) =>
          row.undoneAt ? null : (
            <RowActions
              items={[
                {
                  id: 'undo',
                  label: t('payments.generations.undo.action'),
                  destructive: true,
                  onSelect: () => {
                    void undo(row)
                  },
                },
              ]}
            />
          )
        }
        pagination={{
          page,
          pageSize: PAGE_SIZE,
          total: data?.total ?? 0,
          totalPages: data?.totalPages ?? 0,
          onPageChange: (next: number) => {
            setPage(next)
          },
        }}
      />
      {ConfirmDialogElement}
    </section>
  )
}
