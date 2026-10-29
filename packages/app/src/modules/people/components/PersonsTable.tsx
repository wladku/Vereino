'use client'
// `/backend/people/persons` (club spec UI table): the people in the caller's record scope — the club administrator
// and a coordinator see the whole club (a coordinator the basic data only) — searched by last name through the
// platform's search tokens; the add action for `people.manage`.
import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { RowActions } from '@open-mercato/ui/backend/RowActions'
import { fetchCrudList } from '@open-mercato/ui/backend/utils/crud'
import { Button } from '@open-mercato/ui/primitives/button'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { useOrganizationScopeVersion } from '@open-mercato/shared/lib/frontend/useOrganizationScope'
import {
  PERSONS_HREF,
  errorMessage,
  personName,
  type PersonListRow,
  type TableColumns,
  type Translate,
} from './client-helpers'
import { useGrantedFeatures } from './useGrantedFeatures'

const PAGE_SIZE = 50

function buildColumns(t: Translate): TableColumns<PersonListRow> {
  return [
    {
      id: 'name',
      header: t('people.persons.columns.name'),
      enableSorting: false,
      meta: { priority: 1 },
      cell: ({ row }) => (
        <Link className="font-medium underline-offset-4 hover:underline" href={`${PERSONS_HREF}/${row.original.id}`}>
          {personName(row.original) || t('people.common.empty')}
        </Link>
      ),
    },
    {
      accessorKey: 'birthDate',
      header: t('people.persons.columns.birthDate'),
      enableSorting: false,
      meta: { priority: 2 },
      cell: ({ row }) => row.original.birthDate ?? t('people.common.empty'),
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
  ]
}

export function PersonsTable() {
  const t = useT()
  const features = useGrantedFeatures()
  const router = useRouter()
  const scopeVersion = useOrganizationScopeVersion()
  const [search, setSearch] = React.useState('')
  const [page, setPage] = React.useState(1)
  const lastName = search.trim()

  const { data, isLoading, error } = useQuery({
    queryKey: ['people-persons', lastName, page, scopeVersion],
    queryFn: () =>
      fetchCrudList<PersonListRow>('people/persons', {
        page,
        pageSize: PAGE_SIZE,
        sortField: 'createdAt',
        sortDir: 'desc',
        ...(lastName ? { lastName } : {}),
      }),
  })

  const columns = React.useMemo(() => buildColumns(t), [t])

  return (
    <DataTable<PersonListRow>
      title={t('people.persons.title')}
      titleHeadingLevel={1}
      entityId="people:person"
      extensionTableId="people.persons"
      actions={
        features['people.manage'] ? (
          <Button asChild>
            <Link href={`${PERSONS_HREF}/create`}>{t('people.persons.actions.create')}</Link>
          </Button>
        ) : null
      }
      columns={columns}
      data={data?.items ?? []}
      isLoading={isLoading}
      error={error ? errorMessage(error, t('people.persons.errors.load')) : null}
      emptyState={<p className="text-muted-foreground text-sm">{t('people.persons.empty')}</p>}
      searchValue={search}
      searchPlaceholder={t('people.persons.search')}
      onSearchChange={(value: string) => {
        setSearch(value)
        setPage(1)
      }}
      rowActions={(row: PersonListRow) => (
        <RowActions items={[{ id: 'open', label: t('people.common.open'), href: `${PERSONS_HREF}/${row.id}` }]} />
      )}
      onRowClick={(row: PersonListRow) => {
        router.push(`${PERSONS_HREF}/${row.id}`)
      }}
      pagination={{
        page,
        pageSize: PAGE_SIZE,
        total: data?.total ?? 0,
        totalPages: data?.totalPages ?? 0,
        onPageChange: setPage,
      }}
    />
  )
}
