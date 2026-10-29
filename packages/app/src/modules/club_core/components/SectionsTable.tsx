'use client'
// `/backend/club/sections` (club spec UI table): sections in the caller's scope with their coordinators (added by
// the `people` response enricher) and a "no coordinator" warning on an active section without one — a warning, the
// section still works.
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
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { useOrganizationScopeVersion } from '@open-mercato/shared/lib/frontend/useOrganizationScope'
import { errorMessage, type TableColumns, type Translate } from './client-helpers'
import { coordinatorName, type SectionRow } from './sections-shared'
import { useCanManageClub } from './useCanManageClub'

const LIST_HREF = '/backend/club/sections'
const PAGE_SIZE = 50

function buildColumns(t: Translate): TableColumns<SectionRow> {
  return [
    { accessorKey: 'name', header: t('club_core.sections.columns.name'), meta: { priority: 1 } },
    {
      id: 'coordinators',
      header: t('club_core.sections.columns.coordinators'),
      enableSorting: false,
      meta: { priority: 2 },
      cell: ({ row }) => {
        const enrichment = row.original._people
        if (!enrichment) return <span className="text-muted-foreground">—</span>
        const active = enrichment.coordinators.filter((coordinator) => coordinator.active)
        return (
          <span className="flex flex-wrap items-center gap-1">
            {active.map((coordinator) => (
              <span key={coordinator.assignmentId}>{coordinatorName(coordinator)}</span>
            ))}
            {enrichment.coordinatorMissing ? (
              <StatusBadge variant="warning" dot>
                {t('club_core.sections.noCoordinator')}
              </StatusBadge>
            ) : null}
          </span>
        )
      },
    },
    {
      accessorKey: 'isActive',
      header: t('club_core.sections.columns.status'),
      meta: { priority: 3 },
      cell: ({ row }) => (
        <StatusBadge variant={row.original.isActive ? 'success' : 'neutral'}>
          {row.original.isActive ? t('club_core.common.active') : t('club_core.common.inactive')}
        </StatusBadge>
      ),
    },
  ]
}

export function SectionsTable() {
  const t = useT()
  const canManage = useCanManageClub()
  const router = useRouter()
  const queryClient = useQueryClient()
  const scopeVersion = useOrganizationScopeVersion()
  const { confirm, ConfirmDialogElement } = useConfirmDialog()
  const [search, setSearch] = React.useState('')
  const [page, setPage] = React.useState(1)

  const { data, isLoading, error } = useQuery({
    queryKey: ['club_core-sections', search, page, scopeVersion],
    queryFn: () =>
      fetchCrudList<SectionRow>('club_core/sections', {
        page,
        pageSize: PAGE_SIZE,
        sortField: 'name',
        sortDir: 'asc',
        ...(search ? { search } : {}),
      }),
  })

  const columns = React.useMemo(() => buildColumns(t), [t])

  const remove = async (row: SectionRow) => {
    const confirmed = await confirm({ title: t('club_core.sections.confirm.delete'), variant: 'destructive' })
    if (!confirmed) return
    try {
      await withScopedApiRequestHeaders(buildOptimisticLockHeader(row.updatedAt), () =>
        deleteCrud('club_core/sections', row.id),
      )
      flash(t('club_core.sections.flash.deleted'), 'success')
    } catch (err: unknown) {
      if (!surfaceRecordConflict(err, t)) flash(errorMessage(err, t('club_core.sections.errors.delete')), 'error')
    }
    await queryClient.invalidateQueries({ queryKey: ['club_core-sections'] })
  }

  return (
    <>
      <DataTable<SectionRow>
        title={t('club_core.sections.title')}
        titleHeadingLevel={1}
        entityId="club_core:section"
        extensionTableId="club_core.sections"
        actions={
          canManage ? (
            <Button asChild>
              <Link href={`${LIST_HREF}/create`}>{t('club_core.sections.actions.create')}</Link>
            </Button>
          ) : null
        }
        columns={columns}
        data={data?.items ?? []}
        isLoading={isLoading}
        error={error ? errorMessage(error, t('club_core.sections.errors.load')) : null}
        emptyState={<p className="text-muted-foreground text-sm">{t('club_core.sections.empty')}</p>}
        searchValue={search}
        searchPlaceholder={t('club_core.sections.search')}
        onSearchChange={(value: string) => {
          setSearch(value)
          setPage(1)
        }}
        rowActions={
          canManage
            ? (row: SectionRow) => (
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
              )
            : undefined
        }
        onRowClick={
          canManage
            ? (row: SectionRow) => {
                router.push(`${LIST_HREF}/${row.id}/edit`)
              }
            : undefined
        }
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
