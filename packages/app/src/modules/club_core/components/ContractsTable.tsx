'use client'
// `/backend/club/contracts` (club spec UI table; README B-07; #96): the club's contracts with persons and institutions,
// their period and — for a coach — the rates in złoty; filtered by kind. Navigation spec REQ-N12 (B-07; #262): the
// mockup's columns From, Base, Per unit and Match; `?institutionId=` (the link of an institution row) lists that
// institution's contracts, with a way back to the institutions and to all contracts.
import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
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
import { TableLoadError } from '@vereino/ui'
import { CONTRACT_KINDS, contractRateColumns } from '../lib/contracts'
import { errorMessage, type TableColumns, type Translate } from './client-helpers'
import { formatRate, type ContractRow } from './contracts-shared'
import type { InstitutionRow } from './places-shared'

const LIST_HREF = '/backend/club/contracts'
const INSTITUTIONS_HREF = '/backend/club/institutions'
const RATE_COLUMNS = ['base', 'perUnit', 'match'] as const
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
      header: t('club_core.contracts.columns.from'),
      meta: { priority: 3 },
      cell: ({ row }) => <span className="whitespace-nowrap">{row.original.validFrom ?? '—'}</span>,
    },
    {
      accessorKey: 'validTo',
      header: t('club_core.contracts.columns.until'),
      meta: { priority: 6 },
      cell: ({ row }) => (
        <span className="whitespace-nowrap">{row.original.validTo ?? t('club_core.contracts.periodOpen')}</span>
      ),
    },
    ...RATE_COLUMNS.map<TableColumns<ContractRow>[number]>((column, index) => ({
      id: `rate_${column}`,
      header: t(`club_core.contracts.columns.${column}`),
      enableSorting: false,
      meta: { priority: 4 + Math.min(index, 1) },
      cell: ({ row }) => {
        const rate = row.original.kind === 'coach' ? contractRateColumns(row.original.terms)[column] : null
        return rate === null ? dash : <span className="whitespace-nowrap tabular-nums">{formatRate(rate, locale)}</span>
      },
    })),
    {
      accessorKey: 'updatedAt',
      header: t('club_core.contracts.columns.updated'),
      meta: { priority: 7 },
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
  const institutionId = useSearchParams().get('institutionId')
  // Following an institution link (or "All contracts") starts the list from its first page (state adjusted during
  // render, React's pattern for a value derived from a changed input).
  const [pagedInstitution, setPagedInstitution] = React.useState(institutionId)
  if (pagedInstitution !== institutionId) {
    setPagedInstitution(institutionId)
    setPage(1)
  }

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['club_core-contracts', filters, page, scopeVersion, institutionId],
    queryFn: () =>
      fetchCrudList<ContractRow>('club_core/contracts', {
        page,
        pageSize: PAGE_SIZE,
        sortField: 'validFrom',
        sortDir: 'desc',
        ...filterParams(filters),
        ...(institutionId ? { institutionId } : {}),
      }),
  })
  const institution = useQuery({
    queryKey: ['club_core-contracts-institution', institutionId, scopeVersion],
    queryFn: async () => {
      const list = await fetchCrudList<InstitutionRow>('club_core/institutions', { ids: institutionId, pageSize: 1 })
      return list.items[0] ?? null
    },
    enabled: Boolean(institutionId),
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
      {institutionId ? (
        <div
          className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm"
          data-testid="contracts-institution-filter"
        >
          <span>
            {t('club_core.contracts.institutionFilter', {
              name: institution.data?.name ?? t('club_core.contracts.institutionFilter.unknown'),
            })}
          </span>
          <Link className="underline underline-offset-4" href={INSTITUTIONS_HREF}>
            {t('club_core.contracts.institutionFilter.back')}
          </Link>
          <Link className="underline underline-offset-4" href={LIST_HREF}>
            {t('club_core.contracts.institutionFilter.all')}
          </Link>
        </div>
      ) : null}
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
        error={
          error ? (
            <TableLoadError
              message={t('club_core.contracts.errors.load')}
              retryLabel={t('club_core.common.retry')}
              onRetry={() => void refetch()}
            />
          ) : null
        }
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
