'use client'
// `/backend/club/contracts` (club spec UI table; README B-07; #96): the club's contracts with persons and institutions,
// their period and — for a coach — the rates in złoty; filtered by kind.
import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import type { FilterDef, FilterValues } from '@open-mercato/ui/backend/FilterOverlay'
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
import { COACH_TERM_FIELDS, CONTRACT_KINDS } from '../lib/contracts'
import { errorMessage, type TableColumns, type Translate } from './client-helpers'
import { ratesSummary, type ContractRow } from './contracts-shared'

const LIST_HREF = '/backend/club/contracts'
const PAGE_SIZE = 50

function buildColumns(t: Translate, locale: string): TableColumns<ContractRow> {
  const dash = <span className="text-muted-foreground">—</span>
  return [
    {
      accessorKey: 'partyName',
      header: t('club_core.contracts.columns.party'),
      enableSorting: false,
      meta: { priority: 1 },
      cell: ({ row }) =>
        row.original.partyName ?? (
          <span className="text-muted-foreground">{t('club_core.contracts.deletedParty')}</span>
        ),
    },
    {
      accessorKey: 'kind',
      header: t('club_core.contracts.columns.kind'),
      meta: { priority: 2 },
      cell: ({ row }) => (row.original.kind ? t(`club_core.contracts.kind.${row.original.kind}`) : dash),
    },
    {
      accessorKey: 'validFrom',
      header: t('club_core.contracts.columns.period'),
      meta: { priority: 3 },
      cell: ({ row }) => (
        <span className="whitespace-nowrap">
          {t('club_core.contracts.period', {
            from: row.original.validFrom ?? '—',
            to: row.original.validTo ?? t('club_core.contracts.periodOpen'),
          })}
        </span>
      ),
    },
    {
      accessorKey: 'terms',
      header: t('club_core.contracts.columns.rates'),
      enableSorting: false,
      meta: { priority: 4 },
      cell: ({ row }) =>
        row.original.kind === 'coach' ? ratesSummary(row.original.terms, COACH_TERM_FIELDS, locale, t) || dash : dash,
    },
    {
      accessorKey: 'updatedAt',
      header: t('club_core.contracts.columns.updated'),
      meta: { priority: 5 },
      cell: ({ row }) =>
        row.original.updatedAt ? (
          <span className="whitespace-nowrap">{new Date(row.original.updatedAt).toLocaleString(locale)}</span>
        ) : (
          dash
        ),
    },
  ]
}

/** The list query parameters of the applied filters (`GET /api/club_core/contracts?kind=`). */
function filterParams(values: FilterValues): Record<string, string> {
  const kind: unknown = values.kind
  return typeof kind === 'string' && kind ? { kind } : {}
}

export function ContractsTable() {
  const t = useT()
  const locale = useLocale()
  const router = useRouter()
  const queryClient = useQueryClient()
  const scopeVersion = useOrganizationScopeVersion()
  const { confirm, ConfirmDialogElement } = useConfirmDialog()
  const [page, setPage] = React.useState(1)
  const [filters, setFilters] = React.useState<FilterValues>({})

  const { data, isLoading, error } = useQuery({
    queryKey: ['club_core-contracts', filters, page, scopeVersion],
    queryFn: () =>
      fetchCrudList<ContractRow>('club_core/contracts', {
        page,
        pageSize: PAGE_SIZE,
        sortField: 'validFrom',
        sortDir: 'desc',
        ...filterParams(filters),
      }),
  })

  const columns = React.useMemo(() => buildColumns(t, locale), [t, locale])
  const filterDefs = React.useMemo<FilterDef[]>(
    () => [
      {
        id: 'kind',
        label: t('club_core.contracts.filters.kind'),
        type: 'select',
        options: CONTRACT_KINDS.map((kind) => ({ value: kind, label: t(`club_core.contracts.kind.${kind}`) })),
      },
    ],
    [t],
  )

  const remove = async (row: ContractRow) => {
    const confirmed = await confirm({ title: t('club_core.contracts.confirm.delete'), variant: 'destructive' })
    if (!confirmed) return
    try {
      await withScopedApiRequestHeaders(buildOptimisticLockHeader(row.updatedAt), () =>
        deleteCrud('club_core/contracts', row.id),
      )
      flash(t('club_core.contracts.flash.deleted'), 'success')
    } catch (err: unknown) {
      if (!surfaceRecordConflict(err, t)) {
        flash(errorMessage(err, t('club_core.contracts.errors.delete')), 'error')
      }
    }
    await queryClient.invalidateQueries({ queryKey: ['club_core-contracts'] })
  }

  return (
    <>
      <DataTable<ContractRow>
        title={t('club_core.contracts.title')}
        titleHeadingLevel={1}
        entityId="club_core:contract"
        extensionTableId="club_core.contracts"
        actions={
          <Button asChild>
            <Link href={`${LIST_HREF}/create`}>{t('club_core.contracts.actions.create')}</Link>
          </Button>
        }
        columns={columns}
        data={data?.items ?? []}
        isLoading={isLoading}
        error={error ? errorMessage(error, t('club_core.contracts.errors.load')) : null}
        emptyState={<p className="text-muted-foreground text-sm">{t('club_core.contracts.empty')}</p>}
        filters={filterDefs}
        filterValues={filters}
        onFiltersApply={(values: FilterValues) => {
          setFilters(values)
          setPage(1)
        }}
        onFiltersClear={() => {
          setFilters({})
          setPage(1)
        }}
        rowActions={(row: ContractRow) => (
          <RowActions
            items={[
              { id: 'edit', label: t('club_core.common.edit'), href: `${LIST_HREF}/${row.id}/edit` },
              {
                id: 'delete',
                label: t('club_core.common.delete'),
                destructive: true,
                onSelect: () => {
                  void remove(row)
                },
              },
            ]}
          />
        )}
        onRowClick={(row: ContractRow) => {
          router.push(`${LIST_HREF}/${row.id}/edit`)
        }}
        pagination={{
          page,
          pageSize: PAGE_SIZE,
          total: data?.total ?? 0,
          totalPages: data?.totalPages ?? 0,
          onPageChange: setPage,
        }}
      />
      {ConfirmDialogElement}
    </>
  )
}
