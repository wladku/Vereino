'use client'
// `/backend/club/institutions` (club spec UI table): institutions the club works with.
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
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { useOrganizationScopeVersion } from '@open-mercato/shared/lib/frontend/useOrganizationScope'
import { errorMessage, type TableColumns, type Translate } from './client-helpers'
import type { InstitutionRow } from './places-shared'

const LIST_HREF = '/backend/club/institutions'
const PAGE_SIZE = 50

function buildColumns(t: Translate): TableColumns<InstitutionRow> {
  const dash = <span className="text-muted-foreground">—</span>
  return [
    { accessorKey: 'name', header: t('club_core.institutions.columns.name'), meta: { priority: 1 } },
    {
      accessorKey: 'type',
      header: t('club_core.institutions.columns.type'),
      meta: { priority: 2 },
      cell: ({ row }) => (row.original.type ? t(`club_core.institutions.type.${row.original.type}`) : dash),
    },
    {
      accessorKey: 'contactName',
      header: t('club_core.institutions.columns.contact'),
      enableSorting: false,
      meta: { priority: 3 },
      cell: ({ row }) => row.original.contactName ?? dash,
    },
    {
      accessorKey: 'contactPhone',
      header: t('club_core.institutions.columns.phone'),
      enableSorting: false,
      meta: { priority: 4 },
      cell: ({ row }) => row.original.contactPhone ?? dash,
    },
  ]
}

export function InstitutionsTable() {
  const t = useT()
  const router = useRouter()
  const queryClient = useQueryClient()
  const scopeVersion = useOrganizationScopeVersion()
  const { confirm, ConfirmDialogElement } = useConfirmDialog()
  const [search, setSearch] = React.useState('')
  const [page, setPage] = React.useState(1)

  const { data, isLoading, error } = useQuery({
    queryKey: ['club_core-institutions', search, page, scopeVersion],
    queryFn: () =>
      fetchCrudList<InstitutionRow>('club_core/institutions', {
        page,
        pageSize: PAGE_SIZE,
        sortField: 'name',
        sortDir: 'asc',
        ...(search ? { search } : {}),
      }),
  })

  const columns = React.useMemo(() => buildColumns(t), [t])

  const remove = async (row: InstitutionRow) => {
    const confirmed = await confirm({ title: t('club_core.institutions.confirm.delete'), variant: 'destructive' })
    if (!confirmed) return
    try {
      await withScopedApiRequestHeaders(buildOptimisticLockHeader(row.updatedAt), () =>
        deleteCrud('club_core/institutions', row.id),
      )
      flash(t('club_core.institutions.flash.deleted'), 'success')
    } catch (err: unknown) {
      if (!surfaceRecordConflict(err, t)) {
        flash(errorMessage(err, t('club_core.institutions.errors.delete')), 'error')
      }
    }
    await queryClient.invalidateQueries({ queryKey: ['club_core-institutions'] })
  }

  return (
    <>
      <DataTable<InstitutionRow>
        title={t('club_core.institutions.title')}
        titleHeadingLevel={1}
        entityId="club_core:institution"
        extensionTableId="club_core.institutions"
        actions={
          <Button asChild>
            <Link href={`${LIST_HREF}/create`}>{t('club_core.institutions.actions.create')}</Link>
          </Button>
        }
        columns={columns}
        data={data?.items ?? []}
        isLoading={isLoading}
        error={error ? errorMessage(error, t('club_core.institutions.errors.load')) : null}
        emptyState={<p className="text-muted-foreground text-sm">{t('club_core.institutions.empty')}</p>}
        searchValue={search}
        searchPlaceholder={t('club_core.institutions.search')}
        onSearchChange={(value: string) => {
          setSearch(value)
          setPage(1)
        }}
        rowActions={(row: InstitutionRow) => (
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
        onRowClick={(row: InstitutionRow) => {
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
