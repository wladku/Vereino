'use client'
// `/backend/club/places` (club spec UI table): the place hierarchy as a list with a parent column (names, never ids).
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
import type { PlaceRow } from './places-shared'

const LIST_HREF = '/backend/club/places'
const PAGE_SIZE = 50

type PlaceTableRow = PlaceRow & { parentName: string | null }

function buildColumns(t: Translate): TableColumns<PlaceTableRow> {
  return [
    { accessorKey: 'name', header: t('club_core.places.columns.name'), meta: { priority: 1 } },
    {
      accessorKey: 'kind',
      header: t('club_core.places.columns.kind'),
      meta: { priority: 2 },
      cell: ({ row }) => (row.original.kind ? t(`club_core.places.kind.${row.original.kind}`) : '—'),
    },
    {
      accessorKey: 'parentName',
      header: t('club_core.places.columns.parent'),
      enableSorting: false,
      meta: { priority: 3 },
      cell: ({ row }) => row.original.parentName ?? <span className="text-muted-foreground">—</span>,
    },
    {
      accessorKey: 'capacityGroups',
      header: t('club_core.places.columns.capacityGroups'),
      enableSorting: false,
      meta: { priority: 5 },
    },
    {
      accessorKey: 'isActive',
      header: t('club_core.places.columns.status'),
      enableSorting: false,
      meta: { priority: 4 },
      cell: ({ row }) => (
        <StatusBadge variant={row.original.isActive ? 'success' : 'neutral'}>
          {row.original.isActive ? t('club_core.common.active') : t('club_core.common.inactive')}
        </StatusBadge>
      ),
    },
  ]
}

export function PlacesTable() {
  const t = useT()
  const router = useRouter()
  const queryClient = useQueryClient()
  const scopeVersion = useOrganizationScopeVersion()
  const { confirm, ConfirmDialogElement } = useConfirmDialog()
  const [search, setSearch] = React.useState('')
  const [page, setPage] = React.useState(1)

  const { data, isLoading, error } = useQuery({
    queryKey: ['club_core-places', search, page, scopeVersion],
    queryFn: async () => {
      const list = await fetchCrudList<PlaceRow>('club_core/places', {
        page,
        pageSize: PAGE_SIZE,
        sortField: 'name',
        sortDir: 'asc',
        ...(search ? { search } : {}),
      })
      const parentIds = [...new Set(list.items.map((item) => item.parentPlaceId).filter((id): id is string => !!id))]
      const parents =
        parentIds.length > 0
          ? await fetchCrudList<PlaceRow>('club_core/places', { ids: parentIds.join(','), pageSize: 100 })
          : { items: [] as PlaceRow[] }
      const names = new Map(parents.items.map((parent) => [parent.id, parent.name]))
      return {
        ...list,
        items: list.items.map((item) => ({
          ...item,
          parentName: item.parentPlaceId ? (names.get(item.parentPlaceId) ?? null) : null,
        })),
      }
    },
  })

  const columns = React.useMemo(() => buildColumns(t), [t])

  const remove = async (row: PlaceTableRow) => {
    const confirmed = await confirm({ title: t('club_core.places.confirm.delete'), variant: 'destructive' })
    if (!confirmed) return
    try {
      await withScopedApiRequestHeaders(buildOptimisticLockHeader(row.updatedAt), () =>
        deleteCrud('club_core/places', row.id),
      )
      flash(t('club_core.places.flash.deleted'), 'success')
    } catch (err: unknown) {
      if (!surfaceRecordConflict(err, t)) flash(errorMessage(err, t('club_core.places.errors.delete')), 'error')
    }
    await queryClient.invalidateQueries({ queryKey: ['club_core-places'] })
  }

  return (
    <>
      <DataTable<PlaceTableRow>
        title={t('club_core.places.title')}
        titleHeadingLevel={1}
        entityId="club_core:place"
        extensionTableId="club_core.places"
        actions={
          <Button asChild>
            <Link href={`${LIST_HREF}/create`}>{t('club_core.places.actions.create')}</Link>
          </Button>
        }
        columns={columns}
        data={data?.items ?? []}
        isLoading={isLoading}
        error={error ? errorMessage(error, t('club_core.places.errors.load')) : null}
        emptyState={<p className="text-muted-foreground text-sm">{t('club_core.places.empty')}</p>}
        searchValue={search}
        searchPlaceholder={t('club_core.places.search')}
        onSearchChange={(value: string) => {
          setSearch(value)
          setPage(1)
        }}
        rowActions={(row: PlaceTableRow) => (
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
        onRowClick={(row: PlaceTableRow) => {
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
