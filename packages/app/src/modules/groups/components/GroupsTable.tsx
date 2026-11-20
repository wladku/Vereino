'use client'
// `/backend/groups/groups` (club spec UI table, REQ-004; README B-11, E06-S08 #90): the groups of both kinds in the
// caller's record scope — a coach's groups, a coordinator's sections, the whole club for the administrator — with
// section, kind badge, "Category / level" (the age category, or a class group's level), season, coaches, active
// participants, status and public visibility (parity spec REQ-A01, #266). The perspectives All / Teams / Class groups
// and the section, kind, season, age category, status and public filters live in the URL (`?kind=…&sectionId=…`), so a filtered list is shareable
// and survives a reload and the back button; the server applies them inside the record scope. The add action and the
// delete row action for `groups.manage` (a group with memberships answers 409: deactivate it); the "Activities" row
// action opens the activities list filtered to the group, for those who read activities.
import * as React from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import type { FilterDef, FilterValues } from '@open-mercato/ui/backend/FilterOverlay'
import { RowActions } from '@open-mercato/ui/backend/RowActions'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useConfirmDialog } from '@open-mercato/ui/backend/confirm-dialog'
import { surfaceRecordConflict } from '@open-mercato/ui/backend/conflicts'
import { LoadingMessage } from '@open-mercato/ui/backend/detail'
import { deleteCrud, fetchCrudList } from '@open-mercato/ui/backend/utils/crud'
import { withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { Button } from '@open-mercato/ui/primitives/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@open-mercato/ui/primitives/tabs'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { useOrganizationScopeVersion } from '@open-mercato/shared/lib/frontend/useOrganizationScope'
import {
  GROUP_PERSPECTIVES,
  categoryOrLevel,
  groupListQuery,
  hasGroupFilters,
  parseGroupListState,
  perspectiveOf,
  withPerspective,
  type GroupListState,
  type GroupPerspective,
} from '../lib/group-list'
import { GROUP_KINDS } from '../lib/groups-rules'
import { GroupsNav } from './GroupsNav'
import {
  GROUPS_HREF,
  ageCategoryOptions,
  errorMessage,
  groupActivitiesHref,
  kindLabel,
  personName,
  seasonOptions,
  sectionOptions,
  tolerant,
  type GroupListRow,
  type TableColumns,
  type Translate,
} from './client-helpers'
import { useCanManageGroups, useHasFeature } from './useCanManageGroups'
import { StatusTag } from '@vereino/ui'

const PAGE_SIZE = 50

function buildColumns(t: Translate): TableColumns<GroupListRow> {
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
      accessorKey: 'sectionName',
      header: t('groups.groups.columns.section'),
      enableSorting: false,
      meta: { priority: 3 },
      cell: ({ row }) => row.original.sectionName ?? dash,
    },
    {
      accessorKey: 'kind',
      header: t('groups.groups.columns.kind'),
      enableSorting: false,
      meta: { priority: 5 },
      cell: ({ row }) => (
        <StatusTag status={row.original.kind === 'team' ? 'info' : 'neutral'}>
          {kindLabel(t, row.original.kind)}
        </StatusTag>
      ),
    },
    {
      id: 'categoryLevel',
      header: t('groups.groups.columns.categoryLevel'),
      enableSorting: false,
      meta: { priority: 8 },
      cell: ({ row }) => categoryOrLevel(row.original) ?? dash,
    },
    {
      id: 'coaches',
      header: t('groups.groups.columns.coaches'),
      enableSorting: false,
      meta: { priority: 4 },
      cell: ({ row }) => {
        const names = (row.original.coaches ?? []).map(personName).filter(Boolean)
        return names.length > 0 ? names.join(', ') : dash
      },
    },
    {
      id: 'participantCount',
      header: () => <span className="block text-right">{t('groups.groups.columns.participants')}</span>,
      enableSorting: false,
      meta: { priority: 2 },
      cell: ({ row }) => (
        <span className="block text-right tabular-nums" data-testid="group-participant-count">
          {row.original.participantCount ?? 0}
        </span>
      ),
    },
    {
      accessorKey: 'seasonName',
      header: t('groups.groups.columns.season'),
      enableSorting: false,
      meta: { priority: 7 },
      cell: ({ row }) => row.original.seasonName ?? dash,
    },
    {
      accessorKey: 'isActive',
      header: t('groups.groups.columns.status'),
      enableSorting: false,
      meta: { priority: 6 },
      cell: ({ row }) => (
        <StatusTag status={row.original.isActive ? 'success' : 'neutral'}>
          {row.original.isActive ? t('groups.common.active') : t('groups.common.inactive')}
        </StatusTag>
      ),
    },
    {
      accessorKey: 'isPublic',
      header: t('groups.groups.columns.public'),
      enableSorting: false,
      meta: { priority: 9 },
      cell: ({ row }) => (
        <StatusTag status={row.original.isPublic ? 'success' : 'neutral'}>
          {row.original.isPublic ? t('groups.common.yes') : t('groups.common.no')}
        </StatusTag>
      ),
    },
  ]
}

/** The filter overlay's values of a list state (the search has its own field). */
function filterValuesOf(state: GroupListState): FilterValues {
  const values: FilterValues = {}
  if (state.sectionId) values.sectionId = state.sectionId
  if (state.kind) values.kind = state.kind
  if (state.seasonId) values.seasonId = state.seasonId
  if (state.ageCategoryEntryId) values.ageCategoryEntryId = state.ageCategoryEntryId
  if (state.isActive) values.isActive = state.isActive
  if (state.isPublic) values.isPublic = state.isPublic
  return values
}

/** The list state of applied filter values, keeping the search; invalid values are dropped as in a URL. */
function stateOf(values: FilterValues, search: string | undefined): GroupListState {
  const query = new URLSearchParams()
  for (const key of ['sectionId', 'kind', 'seasonId', 'ageCategoryEntryId', 'isActive', 'isPublic'] as const) {
    const value: unknown = values[key]
    if (typeof value === 'string' && value) query.set(key, value)
  }
  if (search) query.set('search', search)
  return parseGroupListState(query)
}

function GroupsList() {
  const t = useT()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const canManage = useCanManageGroups()
  const canViewActivities = useHasFeature('activities.view')
  const scopeVersion = useOrganizationScopeVersion()
  const { confirm, ConfirmDialogElement } = useConfirmDialog()
  const state = React.useMemo(() => parseGroupListState(searchParams), [searchParams])
  const stateKey = groupListQuery(state)
  const [search, setSearch] = React.useState(state.search ?? '')
  // The page belongs to one filter state: a new filter (also from the back button) starts on the first page.
  const [paging, setPaging] = React.useState({ key: stateKey, page: 1 })
  const page = paging.key === stateKey ? paging.page : 1
  const setPage = (next: number) => {
    setPaging({ key: stateKey, page: next })
  }

  /** Writes a list state to the URL; a filter change adds a history entry, typing in the search replaces it. */
  const navigate = (next: GroupListState, mode: 'push' | 'replace' = 'push') => {
    const query = groupListQuery(next)
    const href = query ? `${pathname}?${query}` : pathname
    if (mode === 'push') router.push(href)
    else router.replace(href)
  }

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['groups-groups', stateKey, page, scopeVersion],
    queryFn: () =>
      fetchCrudList<GroupListRow>('groups/groups', {
        page,
        pageSize: PAGE_SIZE,
        sortField: 'name',
        sortDir: 'asc',
        ...state,
      }),
  })

  const columns = React.useMemo(() => buildColumns(t), [t])
  const filterDefs = React.useMemo<FilterDef[]>(
    () => [
      {
        id: 'sectionId',
        label: t('groups.groups.filters.section'),
        type: 'select',
        loadOptions: tolerant(sectionOptions),
      },
      {
        id: 'kind',
        label: t('groups.groups.filters.kind'),
        type: 'select',
        options: GROUP_KINDS.map((kind) => ({ value: kind, label: kindLabel(t, kind) })),
      },
      {
        id: 'seasonId',
        label: t('groups.groups.filters.season'),
        type: 'select',
        loadOptions: tolerant(seasonOptions),
      },
      {
        id: 'ageCategoryEntryId',
        label: t('groups.groups.filters.ageCategory'),
        type: 'select',
        loadOptions: tolerant(ageCategoryOptions),
      },
      {
        id: 'isActive',
        label: t('groups.groups.filters.status'),
        type: 'select',
        options: [
          { value: 'true', label: t('groups.common.active') },
          { value: 'false', label: t('groups.common.inactive') },
        ],
      },
      {
        id: 'isPublic',
        label: t('groups.groups.filters.public'),
        type: 'select',
        options: [
          { value: 'true', label: t('groups.common.yes') },
          { value: 'false', label: t('groups.common.no') },
        ],
      },
    ],
    [t],
  )

  const remove = async (row: GroupListRow) => {
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

  const addGroup = canManage ? (
    <Button asChild>
      <Link href={`${GROUPS_HREF}/create`}>{t('groups.groups.actions.create')}</Link>
    </Button>
  ) : null

  const emptyState = hasGroupFilters(state) ? (
    <div className="flex flex-col items-start gap-3" data-testid="groups-empty-filtered">
      <p className="text-muted-foreground text-sm">{t('groups.groups.emptyFiltered')}</p>
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          setSearch('')
          navigate({})
        }}
      >
        {t('groups.groups.filters.clear')}
      </Button>
    </div>
  ) : (
    <div className="flex flex-col items-start gap-3" data-testid="groups-empty">
      <p className="font-medium">{t('groups.groups.empty')}</p>
      <p className="text-muted-foreground text-sm">{t('groups.groups.emptyHint')}</p>
      {addGroup}
    </div>
  )

  const perspective = perspectiveOf(state)

  return (
    <>
      <GroupsNav current="groups">
        <Tabs
          value={perspective}
          onValueChange={(value: string) => {
            if (value !== perspective) navigate(withPerspective(state, value as GroupPerspective))
          }}
        >
          <div className="overflow-x-auto">
            <TabsList aria-label={t('groups.groups.perspectives.label')}>
              {GROUP_PERSPECTIVES.map((value) => (
                <TabsTrigger key={value} value={value}>
                  {t(`groups.groups.perspectives.${value}`)}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          <TabsContent value={perspective} className="pt-4">
            <DataTable<GroupListRow>
              title={
                <div className="flex flex-col gap-0.5">
                  <h1 className="text-base font-semibold">{t('groups.groups.title')}</h1>
                  <p className="text-muted-foreground text-sm font-normal" data-testid="groups-subtitle">
                    {t('groups.groups.subtitle')}
                  </p>
                </div>
              }
              entityId="groups:group"
              extensionTableId="groups.groups"
              actions={addGroup}
              columns={columns}
              data={data?.items ?? []}
              isLoading={isLoading}
              error={error ? errorMessage(error, t('groups.groups.errors.load')) : null}
              emptyState={emptyState}
              searchValue={search}
              searchPlaceholder={t('groups.groups.search')}
              onSearchChange={(value: string) => {
                setSearch(value)
                navigate({ ...state, search: value.trim() || undefined }, 'replace')
              }}
              filters={filterDefs}
              filterValues={filterValuesOf(state)}
              onFiltersApply={(values: FilterValues) => {
                navigate(stateOf(values, state.search))
              }}
              onFiltersClear={() => {
                navigate(state.search ? { search: state.search } : {})
              }}
              rowActions={(row: GroupListRow) => (
                <RowActions
                  items={[
                    { id: 'open', label: t('groups.common.open'), href: `${GROUPS_HREF}/${row.id}` },
                    ...(canViewActivities
                      ? [
                          {
                            id: 'activities',
                            label: t('groups.groups.actions.activities'),
                            href: groupActivitiesHref(row.id),
                          },
                        ]
                      : []),
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
              onRowClick={(row: GroupListRow) => {
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
            {error ? (
              <div className="pt-2">
                <Button type="button" variant="outline" onClick={() => void refetch()}>
                  {t('groups.common.retry')}
                </Button>
              </div>
            ) : null}
          </TabsContent>
        </Tabs>
      </GroupsNav>
      {ConfirmDialogElement}
    </>
  )
}

export function GroupsTable() {
  const t = useT()
  // `useSearchParams` needs a Suspense boundary while the page prerenders.
  return (
    <React.Suspense fallback={<LoadingMessage label={t('groups.common.loading')} />}>
      <GroupsList />
    </React.Suspense>
  )
}
