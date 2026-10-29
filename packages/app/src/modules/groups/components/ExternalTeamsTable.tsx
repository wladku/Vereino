'use client'
// `/backend/groups/external-teams` — the "External teams" tab of the groups list (club spec UI table, REQ-020): the
// club-wide opponents and tournament guests; add, edit and delete for `groups.manage`.
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
import {
  EXTERNAL_TEAMS_HREF,
  errorMessage,
  type ExternalTeamRow,
  type TableColumns,
  type Translate,
} from './client-helpers'
import { useCanManageGroups } from './useCanManageGroups'

const PAGE_SIZE = 50

function buildColumns(t: Translate): TableColumns<ExternalTeamRow> {
  const dash = <span className="text-muted-foreground">—</span>
  return [
    {
      accessorKey: 'name',
      header: t('groups.externalTeams.columns.name'),
      enableSorting: false,
      meta: { priority: 1 },
    },
    {
      accessorKey: 'clubName',
      header: t('groups.externalTeams.columns.clubName'),
      enableSorting: false,
      meta: { priority: 2 },
      cell: ({ row }) => row.original.clubName ?? dash,
    },
    {
      accessorKey: 'contact',
      header: t('groups.externalTeams.columns.contact'),
      enableSorting: false,
      meta: { priority: 3 },
      cell: ({ row }) => row.original.contact ?? dash,
    },
  ]
}

export function ExternalTeamsTable() {
  const t = useT()
  const router = useRouter()
  const queryClient = useQueryClient()
  const canManage = useCanManageGroups()
  const scopeVersion = useOrganizationScopeVersion()
  const { confirm, ConfirmDialogElement } = useConfirmDialog()
  const [search, setSearch] = React.useState('')
  const [page, setPage] = React.useState(1)

  const { data, isLoading, error } = useQuery({
    queryKey: ['groups-external-teams', search, page, scopeVersion],
    queryFn: () =>
      fetchCrudList<ExternalTeamRow>('groups/external-teams', {
        page,
        pageSize: PAGE_SIZE,
        sortField: 'name',
        sortDir: 'asc',
        ...(search ? { search } : {}),
      }),
  })

  const columns = React.useMemo(() => buildColumns(t), [t])

  const remove = async (row: ExternalTeamRow) => {
    const confirmed = await confirm({ title: t('groups.externalTeams.confirm.delete'), variant: 'destructive' })
    if (!confirmed) return
    try {
      await withScopedApiRequestHeaders(buildOptimisticLockHeader(row.updatedAt), () =>
        deleteCrud('groups/external-teams', row.id),
      )
      flash(t('groups.externalTeams.flash.deleted'), 'success')
    } catch (err: unknown) {
      if (!surfaceRecordConflict(err, t)) flash(errorMessage(err, t('groups.externalTeams.errors.delete')), 'error')
    }
    await queryClient.invalidateQueries({ queryKey: ['groups-external-teams'] })
  }

  return (
    <>
      <GroupsNav current="external-teams">
        <DataTable<ExternalTeamRow>
          title={t('groups.externalTeams.title')}
          titleHeadingLevel={1}
          entityId="groups:external_team"
          extensionTableId="groups.external_teams"
          actions={
            canManage ? (
              <Button asChild>
                <Link href={`${EXTERNAL_TEAMS_HREF}/create`}>{t('groups.externalTeams.actions.create')}</Link>
              </Button>
            ) : null
          }
          columns={columns}
          data={data?.items ?? []}
          isLoading={isLoading}
          error={error ? errorMessage(error, t('groups.externalTeams.errors.load')) : null}
          emptyState={<p className="text-muted-foreground text-sm">{t('groups.externalTeams.empty')}</p>}
          searchValue={search}
          searchPlaceholder={t('groups.externalTeams.search')}
          onSearchChange={(value: string) => {
            setSearch(value)
            setPage(1)
          }}
          rowActions={(row: ExternalTeamRow) =>
            canManage ? (
              <RowActions
                items={[
                  { id: 'edit', label: t('groups.common.edit'), href: `${EXTERNAL_TEAMS_HREF}/${row.id}/edit` },
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
              ? (row: ExternalTeamRow) => {
                  router.push(`${EXTERNAL_TEAMS_HREF}/${row.id}/edit`)
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
