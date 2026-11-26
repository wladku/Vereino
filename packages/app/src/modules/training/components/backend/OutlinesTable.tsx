'use client'
// `/backend/training/outlines` — the administrator's view of the club's training outlines (training outlines spec
// *UI architecture*: "the back office gets the same data in `DataTable`/`CrudForm`", M-O5; #847): topic, kind, age
// category, duration, group, author, session day and the last change, with the views of the member list (all, own,
// sessions, series), the age category and the part filter, and a topic search. A row opens the back-office form; the
// row actions open the member editor (exercises and images), the printout, and delete with the version (409 shows the
// conflict). Writing a new outline stays on the member editor, which knows the author's person.
import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { SortingState } from '@tanstack/react-table'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { EmptyState } from '@open-mercato/ui/backend/EmptyState'
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
import { StatusTag, TableLoadError } from '@vereino/ui'
import { OUTLINE_PARTS } from '../../lib/outline'
import { newOutlineHref, outlineHref, outlinePrintHref, type OutlineListItem } from '../club/club-client'
import {
  BACKEND_OUTLINES_API,
  backendOutlineHref,
  outlineErrorMessage,
  outlineListParams,
  type OutlineTableColumns,
  type Translate,
} from './backend-client'

const PAGE_SIZE = 50
const QUERY_KEY = 'training-backend-outlines'
const VIEWS = ['all', 'mine', 'sessions', 'series'] as const

function KindTag({ item, t }: { item: OutlineListItem; t: Translate }) {
  if (item.occurrenceId) return <StatusTag status="info">{t('training.list.kind.session')}</StatusTag>
  if (item.activityId) return <StatusTag status="info">{t('training.list.kind.series')}</StatusTag>
  return <StatusTag status="neutral">{t('training.backend.kind.own')}</StatusTag>
}

function buildColumns(t: Translate, locale: string): OutlineTableColumns {
  const day = (value: string | null, withTime = false) => {
    if (!value) return ''
    const date = new Date(withTime ? value : `${value}T12:00:00`)
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(locale)
  }
  return [
    {
      accessorKey: 'topic',
      header: t('training.outline.fields.topic'),
      meta: { priority: 1, truncate: true, maxWidth: '24rem' },
      cell: ({ row }) => <span className="font-medium">{row.original.topic}</span>,
    },
    {
      id: 'kind',
      header: t('training.backend.columns.kind'),
      enableSorting: false,
      meta: { priority: 2 },
      cell: ({ row }) => <KindTag item={row.original} t={t} />,
    },
    {
      accessorKey: 'ageCategory',
      header: t('training.outline.fields.ageCategory'),
      enableSorting: false,
      meta: { priority: 2 },
    },
    {
      accessorKey: 'durationMinutes',
      header: t('training.backend.columns.duration'),
      enableSorting: false,
      meta: { priority: 3 },
      cell: ({ row }) => (
        <span className="tabular-nums">
          {t('training.outline.minutesShort', { minutes: row.original.durationMinutes })}
        </span>
      ),
    },
    {
      accessorKey: 'groupName',
      header: t('training.backend.columns.group'),
      enableSorting: false,
      meta: { priority: 3 },
      cell: ({ row }) => row.original.groupName ?? '',
    },
    {
      accessorKey: 'authorName',
      header: t('training.backend.columns.author'),
      enableSorting: false,
      meta: { priority: 4 },
      cell: ({ row }) => row.original.authorName ?? '',
    },
    {
      accessorKey: 'sessionDate',
      header: t('training.backend.columns.session'),
      enableSorting: false,
      meta: { priority: 4 },
      cell: ({ row }) => <span className="whitespace-nowrap">{day(row.original.sessionDate)}</span>,
    },
    {
      accessorKey: 'updatedAt',
      header: t('training.backend.columns.updatedAt'),
      meta: { priority: 5 },
      cell: ({ row }) => <span className="whitespace-nowrap">{day(row.original.updatedAt, true)}</span>,
    },
  ]
}

export function OutlinesTable() {
  const t = useT()
  const locale = useLocale()
  const router = useRouter()
  const queryClient = useQueryClient()
  const scopeVersion = useOrganizationScopeVersion()
  const { confirm, ConfirmDialogElement } = useConfirmDialog()
  const [search, setSearch] = React.useState('')
  const [filters, setFilters] = React.useState<FilterValues>({})
  const [page, setPage] = React.useState(1)
  const [sorting, setSorting] = React.useState<SortingState>([{ id: 'updatedAt', desc: true }])
  const sort = sorting[0] ?? { id: 'updatedAt', desc: true }

  const params = outlineListParams(filters, search)
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [QUERY_KEY, params, page, sort, scopeVersion],
    queryFn: () =>
      fetchCrudList<OutlineListItem>(BACKEND_OUTLINES_API, {
        page,
        pageSize: PAGE_SIZE,
        sortField: sort.id === 'topic' ? 'topic' : 'updatedAt',
        sortDir: sort.desc ? 'desc' : 'asc',
        ...params,
      }),
  })

  const columns = React.useMemo(() => buildColumns(t, locale), [t, locale])
  const filterDefs = React.useMemo<FilterDef[]>(
    () => [
      {
        id: 'view',
        label: t('training.backend.filters.view'),
        type: 'select',
        options: VIEWS.map((view) => ({ value: view, label: t(`training.list.view.${view}`) })),
      },
      { id: 'ageCategory', label: t('training.outline.fields.ageCategory'), type: 'text' },
      {
        id: 'part',
        label: t('training.library.part'),
        type: 'select',
        options: OUTLINE_PARTS.map((part) => ({ value: part, label: t(`training.outline.parts.${part}`) })),
      },
    ],
    [t],
  )

  const remove = async (row: OutlineListItem) => {
    const confirmed = await confirm({
      title: t('training.editor.confirmDelete'),
      text: t('training.editor.confirmDeleteText'),
      confirmText: t('training.editor.delete'),
      cancelText: t('training.editor.cancel'),
      variant: 'destructive',
    })
    if (!confirmed) return
    try {
      await withScopedApiRequestHeaders(buildOptimisticLockHeader(row.updatedAt), () =>
        deleteCrud(BACKEND_OUTLINES_API, row.id),
      )
      flash(t('training.editor.deleted'), 'success')
    } catch (err: unknown) {
      if (!surfaceRecordConflict(err, t)) flash(outlineErrorMessage(err, t, 'training.editor.errors.delete'), 'error')
    }
    await queryClient.invalidateQueries({ queryKey: [QUERY_KEY] })
  }

  const filtered = Object.keys(params).length > 0
  const createAction = (
    <Button asChild variant="outline">
      <Link href={newOutlineHref()} data-testid="training-backend-outline-new">
        {t('training.list.new')}
      </Link>
    </Button>
  )

  return (
    <div className="flex flex-col gap-4" data-testid="training-backend-outlines">
      <p className="text-muted-foreground text-sm">{t('training.backend.description')}</p>
      <DataTable<OutlineListItem>
        title={t('training.list.title')}
        titleHeadingLevel={1}
        entityId="training:outline"
        extensionTableId="training.outlines"
        actions={createAction}
        columns={columns}
        data={data?.items ?? []}
        isLoading={isLoading}
        error={
          error ? (
            <TableLoadError
              message={t('training.list.errors.load')}
              retryLabel={t('training.club.actions.retry')}
              onRetry={() => void refetch()}
            />
          ) : null
        }
        emptyState={
          <div data-testid="training-backend-outlines-empty">
            <EmptyState
              title={t('training.list.title')}
              description={t(filtered ? 'training.list.emptyFiltered' : 'training.list.empty.all')}
            />
          </div>
        }
        searchValue={search}
        searchPlaceholder={t('training.list.search')}
        onSearchChange={(value: string) => {
          setSearch(value)
          setPage(1)
        }}
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
        sortable
        manualSorting
        sorting={sorting}
        onSortingChange={(next: SortingState) => {
          setSorting(next)
          setPage(1)
        }}
        rowActions={(row: OutlineListItem) => (
          <RowActions
            items={[
              { id: 'edit', label: t('training.backend.actions.edit'), href: backendOutlineHref(row.id) },
              { id: 'exercises', label: t('training.backend.actions.exercises'), href: outlineHref(row.id) },
              { id: 'print', label: t('training.actions.pdf'), href: outlinePrintHref(row.id) },
              {
                id: 'delete',
                label: t('training.editor.delete'),
                destructive: true,
                onSelect: () => {
                  void remove(row)
                },
              },
            ]}
          />
        )}
        onRowClick={(row: OutlineListItem) => {
          router.push(backendOutlineHref(row.id))
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
    </div>
  )
}
