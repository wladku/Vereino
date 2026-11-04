'use client'
// `/backend/people/persons` (club spec UI table; UX parity spec REQ-U01, B-09): the people in the caller's record
// scope — the club administrator and a coordinator see the whole club (a coordinator the basic data only). The
// perspectives All / Staff / Children / Without account are an app-owned tablist above the table (DD-U03); the
// filters section, group, role, account and age, the first- or last-name search and the page live in the URL, so a
// reload restores the view and the back button steps through it. Columns: name, age, roles, groups (from the `groups`
// enricher), account and guardians. The add action for `people.manage`.
import * as React from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import type { FilterDef, FilterValues } from '@open-mercato/ui/backend/FilterOverlay'
import { RowActions } from '@open-mercato/ui/backend/RowActions'
import { fetchCrudList } from '@open-mercato/ui/backend/utils/crud'
import { Button } from '@open-mercato/ui/primitives/button'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { Tabs, TabsList, TabsTrigger } from '@open-mercato/ui/primitives/tabs'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { useOrganizationScopeVersion } from '@open-mercato/shared/lib/frontend/useOrganizationScope'
import {
  PERSON_FILTER_ROLES,
  PERSON_LIST_FILTER_KEYS,
  PERSON_LIST_VIEWS,
  isPersonListFiltered,
  listDisplayName,
  personListApiParams,
  personListUrlParams,
  personRoleBadges,
  readPersonListUrl,
  type PersonListUrlState,
  type PersonListView,
} from '../lib/person-list-filters'
import { PERSONS_HREF, errorMessage, type PersonListItemRow, type TableColumns, type Translate } from './client-helpers'
import { useGrantedFeatures } from './useGrantedFeatures'

const PAGE_SIZE = 50

type NamedRow = { id: string; name?: string | null }
type Option = { value: string; label: string }

/** Section and group options; the groups list answers only when the `groups` module is enabled. */
async function namedOptions(path: string): Promise<Option[]> {
  const data = await fetchCrudList<NamedRow>(path, { pageSize: 100, sortField: 'name', sortDir: 'asc' })
  return data.items.map((item) => ({ value: item.id, label: item.name ?? item.id }))
}

function buildColumns(t: Translate): TableColumns<PersonListItemRow> {
  const dash = <span className="text-muted-foreground">{t('people.common.empty')}</span>
  return [
    {
      id: 'name',
      header: t('people.persons.columns.name'),
      enableSorting: false,
      meta: { priority: 1 },
      cell: ({ row }) => (
        <Link className="font-medium underline-offset-4 hover:underline" href={`${PERSONS_HREF}/${row.original.id}`}>
          {listDisplayName(row.original) || t('people.common.empty')}
        </Link>
      ),
    },
    {
      id: 'age',
      header: () => <span className="block text-right">{t('people.persons.columns.age')}</span>,
      enableSorting: false,
      meta: { priority: 2 },
      cell: ({ row }) => (
        <span className="block text-right tabular-nums">
          {typeof row.original.age === 'number' ? row.original.age : dash}
        </span>
      ),
    },
    {
      id: 'roles',
      header: t('people.persons.columns.roles'),
      enableSorting: false,
      meta: { priority: 2 },
      cell: ({ row }) => {
        const badges = personRoleBadges({
          roles: row.original.roles ?? [],
          hasWards: row.original.hasWards === true,
          membershipRoles: (row.original._groups?.groups ?? []).map((group) => group.role),
        })
        if (badges.length === 0) return dash
        return (
          <span className="flex flex-wrap gap-1">
            {badges.map((badge) => (
              <StatusBadge key={badge} variant="info">
                {t(`people.persons.roleBadges.${badge}`)}
              </StatusBadge>
            ))}
          </span>
        )
      },
    },
    {
      id: 'groups',
      header: t('people.persons.columns.groups'),
      enableSorting: false,
      meta: { priority: 3 },
      cell: ({ row }) => {
        const groups = row.original._groups?.groups ?? []
        if (groups.length === 0) return dash
        return groups
          .map((group) =>
            group.role === 'participant'
              ? group.name
              : t('people.persons.groupWithRole', {
                  name: group.name,
                  role: t(`people.persons.membershipRoles.${group.role}`),
                }),
          )
          .join(', ')
      },
    },
    {
      accessorKey: 'hasAccount',
      header: t('people.persons.columns.account'),
      enableSorting: false,
      meta: { priority: 3 },
      cell: ({ row }) => (
        <StatusBadge variant={row.original.hasAccount ? 'success' : 'neutral'}>
          {row.original.hasAccount ? t('people.persons.account.yes') : t('people.persons.account.no')}
        </StatusBadge>
      ),
    },
    {
      id: 'guardians',
      header: t('people.persons.columns.guardians'),
      enableSorting: false,
      meta: { priority: 4 },
      cell: ({ row }) => {
        const guardians = row.original.guardians ?? []
        if (guardians.length === 0) return dash
        return (
          <span className="flex flex-wrap gap-x-2">
            {guardians.map((guardian) => (
              <Link
                key={guardian.id}
                className="underline-offset-4 hover:underline"
                href={`${PERSONS_HREF}/${guardian.id}`}
                onClick={(event) => {
                  event.stopPropagation()
                }}
              >
                {guardian.displayName}
              </Link>
            ))}
          </span>
        )
      },
    },
  ]
}

/** The state of the overlay's fields from the URL state, and back. */
function filterValuesOf(state: PersonListUrlState): FilterValues {
  return { ...state.filters }
}

function filtersFrom(values: FilterValues): PersonListUrlState['filters'] {
  const filters: PersonListUrlState['filters'] = {}
  for (const key of PERSON_LIST_FILTER_KEYS) {
    const value: unknown = values[key]
    if (typeof value === 'string' && value.trim()) filters[key] = value.trim()
  }
  return filters
}

export function PersonsTable() {
  const t = useT()
  const features = useGrantedFeatures()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const scopeVersion = useOrganizationScopeVersion()
  const state = React.useMemo(() => readPersonListUrl((key) => searchParams.get(key)), [searchParams])
  // The search box is local while typing; the URL follows it without adding history entries. A search changed from
  // outside (back button, "Clear filters") is adopted during render.
  const [search, setSearch] = React.useState(state.search)
  const [urlSearch, setUrlSearch] = React.useState(state.search)
  if (urlSearch !== state.search) {
    setUrlSearch(state.search)
    setSearch(state.search)
  }

  const navigate = React.useCallback(
    (next: PersonListUrlState, mode: 'push' | 'replace') => {
      const query = new URLSearchParams(personListUrlParams(next)).toString()
      const href = query ? `${pathname}?${query}` : pathname
      if (mode === 'push') router.push(href, { scroll: false })
      else router.replace(href, { scroll: false })
    },
    [pathname, router],
  )

  const apiParams = personListApiParams(state)
  const { data, isLoading, error } = useQuery({
    queryKey: ['people-persons', apiParams, state.page, scopeVersion],
    queryFn: () =>
      fetchCrudList<PersonListItemRow>('people/persons', {
        page: state.page,
        pageSize: PAGE_SIZE,
        sortField: 'createdAt',
        sortDir: 'desc',
        ...apiParams,
      }),
  })

  // The section and group filters need the `groups` module: without it the groups list fails and they are not offered.
  const groupsQuery = useQuery({
    queryKey: ['people-persons-group-options', scopeVersion],
    queryFn: () => namedOptions('groups/groups'),
    retry: false,
  })
  const groupsAvailable = groupsQuery.isSuccess

  const columns = React.useMemo(() => buildColumns(t), [t])
  const filterDefs = React.useMemo<FilterDef[]>(() => {
    const roles = PERSON_FILTER_ROLES.filter((role) => groupsAvailable || role !== 'participant')
    const defs: FilterDef[] = []
    if (groupsAvailable) {
      defs.push(
        {
          id: 'sectionId',
          label: t('people.persons.filters.section'),
          type: 'select',
          loadOptions: async () => {
            try {
              return await namedOptions('club_core/sections')
            } catch {
              return []
            }
          },
        },
        {
          id: 'groupId',
          label: t('people.persons.filters.group'),
          type: 'select',
          options: groupsQuery.data,
        },
      )
    }
    defs.push(
      {
        id: 'role',
        label: t('people.persons.filters.role'),
        type: 'select',
        options: roles.map((role) => ({ value: role, label: t(`people.persons.filterRoles.${role}`) })),
      },
      {
        id: 'hasAccount',
        label: t('people.persons.filters.account'),
        type: 'select',
        options: [
          { value: 'true', label: t('people.persons.account.yes') },
          { value: 'false', label: t('people.persons.account.no') },
        ],
      },
      { id: 'ageFrom', label: t('people.persons.filters.ageFrom'), type: 'text', placeholder: '0' },
      { id: 'ageTo', label: t('people.persons.filters.ageTo'), type: 'text', placeholder: '120' },
    )
    return defs
  }, [t, groupsAvailable, groupsQuery.data])

  const filtered = isPersonListFiltered(state)
  const canManage = features['people.manage']
  const clearAll = () => {
    navigate({ view: 'all', search: '', page: 1, filters: {} }, 'push')
  }

  const emptyState = filtered ? (
    <div className="flex flex-col items-start gap-2">
      <p className="text-muted-foreground text-sm">{t('people.persons.emptyFiltered')}</p>
      <Button type="button" variant="outline" size="sm" onClick={clearAll}>
        {t('people.persons.filters.clear')}
      </Button>
    </div>
  ) : (
    <div className="flex flex-col items-start gap-2">
      <p className="text-muted-foreground text-sm">{t('people.persons.emptyFirst')}</p>
      {canManage ? (
        <Button asChild size="sm">
          <Link href={`${PERSONS_HREF}/create`}>{t('people.persons.actions.create')}</Link>
        </Button>
      ) : null}
    </div>
  )

  return (
    <div className="flex flex-col gap-3">
      {/* The DataTable `toolbar` prop would replace its search and filter bar, so the tablist sits above the table. */}
      <Tabs
        value={state.view}
        onValueChange={(value: string) => {
          navigate({ ...state, view: value as PersonListView, page: 1 }, 'push')
        }}
      >
        <TabsList aria-label={t('people.persons.views.label')} className="max-w-full overflow-x-auto">
          {PERSON_LIST_VIEWS.map((view) => (
            <TabsTrigger key={view} value={view}>
              {t(`people.persons.views.${view}`)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <DataTable<PersonListItemRow>
        title={t('people.persons.title')}
        titleHeadingLevel={1}
        entityId="people:person"
        extensionTableId="people.persons"
        actions={
          canManage ? (
            <Button asChild>
              <Link href={`${PERSONS_HREF}/create`}>{t('people.persons.actions.create')}</Link>
            </Button>
          ) : null
        }
        columns={columns}
        data={data?.items ?? []}
        isLoading={isLoading}
        error={error ? errorMessage(error, t('people.persons.errors.load')) : null}
        emptyState={emptyState}
        searchValue={search}
        searchPlaceholder={t('people.persons.search')}
        onSearchChange={(value: string) => {
          setSearch(value)
          navigate({ ...state, search: value, page: 1 }, 'replace')
        }}
        filters={filterDefs}
        filterValues={filterValuesOf(state)}
        onFiltersApply={(values: FilterValues) => {
          navigate({ ...state, filters: filtersFrom(values), page: 1 }, 'push')
        }}
        onFiltersClear={() => {
          navigate({ ...state, filters: {}, page: 1 }, 'push')
        }}
        rowActions={(row: PersonListItemRow) => (
          <RowActions items={[{ id: 'open', label: t('people.common.open'), href: `${PERSONS_HREF}/${row.id}` }]} />
        )}
        onRowClick={(row: PersonListItemRow) => {
          router.push(`${PERSONS_HREF}/${row.id}`)
        }}
        pagination={{
          page: state.page,
          pageSize: PAGE_SIZE,
          total: data?.total ?? 0,
          totalPages: data?.totalPages ?? 0,
          onPageChange: (page: number) => {
            navigate({ ...state, page }, 'push')
          },
        }}
      />
    </div>
  )
}
