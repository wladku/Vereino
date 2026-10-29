'use client'
// `/backend/groups/groups` (club spec UI table, REQ-004): the groups of both kinds in the caller's record scope — a
// coach's groups, a coordinator's sections, the whole club for the administrator — with section, season and status;
// the add action and the delete row action for `groups.manage` (a group with memberships answers 409: deactivate it).
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
import { GroupsNav } from './GroupsNav'
import {
  GROUPS_HREF,
  errorMessage,
  kindLabel,
  type GroupRow,
  type TableColumns,
  type Translate,
} from './client-helpers'
import { useCanManageGroups } from './useCanManageGroups'

const PAGE_SIZE = 50

function buildColumns(t: Translate): TableColumns<GroupRow> {
  const dash = <span className="text-muted-foreground">—</span>
  return [
    {
      id: 'name',
      header: t('groups.groups.columns.name'),
      enableSorting: false,
      meta: { priority: 1 },
      cell: ({ row }) => (
        <Link className="font-medium underline-offset-4 hover:underline" href={`${GROUPS_HREF}/${row.original.id}`}>
          {row.original.name ?? t('groups.common.empty')}
        </Link>
      ),
    },
    {
      accessorKey: 'kind',
      header: t('groups.groups.columns.kind'),
      enableSorting: false,
      meta: { priority: 2 },
      cell: ({ row }) => kindLabel(t, row.original.kind),
    },
    {
      accessorKey: 'sectionName',
      header: t('groups.groups.columns.section'),
      enableSorting: false,
      meta: { priority: 3 },
      cell: ({ row }) => row.original.sectionName ?? dash,
    },
    {
      accessorKey: 'seasonName',
      header: t('groups.groups.columns.season'),
      enableSorting: false,
      meta: { priority: 5 },
      cell: ({ row }) => row.original.seasonName ?? dash,
    },
    {
      accessorKey: 'isActive',
      header: t('groups.groups.columns.status'),
      enableSorting: false,
      meta: { priority: 4 },
      cell: ({ row }) => (
        <StatusBadge variant={row.original.isActive ? 'success' : 'neutral'}>
          {row.original.isActive ? t('groups.common.active') : t('groups.common.inactive')}
        </StatusBadge>
      ),
    },
  ]
}

export function GroupsTable() {
  const t = useT()
  const router = useRouter()
  const queryClient = useQueryClient()
  const canManage = useCanManageGroups()
  const scopeVersion = useOrganizationScopeVersion()
  const { confirm, ConfirmDialogElement } = useConfirmDialog()
  const [search, setSearch] = React.useState('')
  const [page, setPage] = React.useState(1)

  const { data, isLoading, error } = useQuery({
    queryKey: ['groups-groups', search, page, scopeVersion],
    queryFn: () =>
      fetchCrudList<GroupRow>('groups/groups', {
        page,
        pageSize: PAGE_SIZE,
        sortField: 'name',
        sortDir: 'asc',
        ...(search ? { search } : {}),
      }),
  })

  const columns = React.useMemo(() => buildColumns(t), [t])

  const remove = async (row: GroupRow) => {
    const confirmed = await confirm({ title: t('groups.groups.confirm.delete'), variant: 'destructive' })
    if (!confirmed) return
    try {
      await withScopedApiRequestHeaders(buildOptimisticLockHeader(row.updatedAt), () =>
        deleteCrud('groups/groups', row.id),
      )
      flash(t('groups.groups.flash.deleted'), 'success')
    } catch (err: unknown) {
      if (!surfaceRecordConflict(err, t)) flash(errorMessage(err, t('groups.groups.errors.delete')), 'error')
    }
    await queryClient.invalidateQueries({ queryKey: ['groups-groups'] })
  }

  return (
    <>
      <GroupsNav current="groups">
        <DataTable<GroupRow>
          title={t('groups.groups.title')}
          titleHeadingLevel={1}
          entityId="groups:group"
          extensionTableId="groups.groups"
          actions={
            canManage ? (
              <Button asChild>
                <Link href={`${GROUPS_HREF}/create`}>{t('groups.groups.actions.create')}</Link>
              </Button>
            ) : null
          }
          columns={columns}
          data={data?.items ?? []}
          isLoading={isLoading}
          error={error ? errorMessage(error, t('groups.groups.errors.load')) : null}
          emptyState={<p className="text-muted-foreground text-sm">{t('groups.groups.empty')}</p>}
          searchValue={search}
          searchPlaceholder={t('groups.groups.search')}
          onSearchChange={(value: string) => {
            setSearch(value)
            setPage(1)
          }}
          rowActions={(row: GroupRow) => (
            <RowActions
              items={[
                { id: 'open', label: t('groups.common.open'), href: `${GROUPS_HREF}/${row.id}` },
                ...(canManage
                  ? [
                      {
                        id: 'delete',
                        label: t('groups.common.delete'),
                        destructive: true,
                        onSelect: () => {
                          void remove(row)
                        },
                      },
                    ]
                  : []),
              ]}
            />
          )}
          onRowClick={(row: GroupRow) => {
            router.push(`${GROUPS_HREF}/${row.id}`)
          }}
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
