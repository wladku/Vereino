'use client'
// `/backend/groups/seasons` — the "Seasons" tab of the groups list (club spec UI table, REQ-019): the club-wide seasons
// of `team` groups, newest first; add, edit and delete for `groups.manage` (a season used by a group answers 409).
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
import { GroupsNav } from './GroupsNav'
import { SEASONS_HREF, errorMessage, type SeasonRow, type TableColumns, type Translate } from './client-helpers'
import { useCanManageGroups } from './useCanManageGroups'

const PAGE_SIZE = 50

function buildColumns(t: Translate): TableColumns<SeasonRow> {
  const dash = <span className="text-muted-foreground">—</span>
  return [
    { accessorKey: 'name', header: t('groups.seasons.columns.name'), enableSorting: false, meta: { priority: 1 } },
    {
      accessorKey: 'startsOn',
      header: t('groups.seasons.columns.startsOn'),
      enableSorting: false,
      meta: { priority: 2 },
      cell: ({ row }) => row.original.startsOn ?? dash,
    },
    {
      accessorKey: 'endsOn',
      header: t('groups.seasons.columns.endsOn'),
      enableSorting: false,
      meta: { priority: 3 },
      cell: ({ row }) => row.original.endsOn ?? dash,
    },
  ]
}

export function SeasonsTable() {
  const t = useT()
  const router = useRouter()
  const queryClient = useQueryClient()
  const canManage = useCanManageGroups()
  const scopeVersion = useOrganizationScopeVersion()
  const { confirm, ConfirmDialogElement } = useConfirmDialog()
  const [search, setSearch] = React.useState('')
  const [page, setPage] = React.useState(1)

  const { data, isLoading, error } = useQuery({
    queryKey: ['groups-seasons', search, page, scopeVersion],
    queryFn: () =>
      fetchCrudList<SeasonRow>('groups/seasons', {
        page,
        pageSize: PAGE_SIZE,
        sortField: 'startsOn',
        sortDir: 'desc',
        ...(search ? { search } : {}),
      }),
  })

  const columns = React.useMemo(() => buildColumns(t), [t])

  const remove = async (row: SeasonRow) => {
    const confirmed = await confirm({ title: t('groups.seasons.confirm.delete'), variant: 'destructive' })
    if (!confirmed) return
    try {
      await withScopedApiRequestHeaders(buildOptimisticLockHeader(row.updatedAt), () =>
        deleteCrud('groups/seasons', row.id),
      )
      flash(t('groups.seasons.flash.deleted'), 'success')
    } catch (err: unknown) {
      if (!surfaceRecordConflict(err, t)) flash(errorMessage(err, t('groups.seasons.errors.delete')), 'error')
    }
    await queryClient.invalidateQueries({ queryKey: ['groups-seasons'] })
  }

  return (
    <>
      <GroupsNav current="seasons">
        <DataTable<SeasonRow>
          title={t('groups.seasons.title')}
          titleHeadingLevel={1}
          entityId="groups:season"
          extensionTableId="groups.seasons"
          actions={
            canManage ? (
              <Button asChild>
                <Link href={`${SEASONS_HREF}/create`}>{t('groups.seasons.actions.create')}</Link>
              </Button>
            ) : null
          }
          columns={columns}
          data={data?.items ?? []}
          isLoading={isLoading}
          error={error ? errorMessage(error, t('groups.seasons.errors.load')) : null}
          emptyState={<p className="text-muted-foreground text-sm">{t('groups.seasons.empty')}</p>}
          searchValue={search}
          searchPlaceholder={t('groups.seasons.search')}
          onSearchChange={(value: string) => {
            setSearch(value)
            setPage(1)
          }}
          rowActions={(row: SeasonRow) =>
            canManage ? (
              <RowActions
                items={[
                  { id: 'edit', label: t('groups.common.edit'), href: `${SEASONS_HREF}/${row.id}/edit` },
                  {
                    id: 'delete',
                    label: t('groups.common.delete'),
                    destructive: true,
                    onSelect: () => {
                      void remove(row)
                    },
                  },
                ]}
              />
            ) : null
          }
          onRowClick={
            canManage
              ? (row: SeasonRow) => {
                  router.push(`${SEASONS_HREF}/${row.id}/edit`)
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
      </GroupsNav>
      {ConfirmDialogElement}
    </>
  )
}
