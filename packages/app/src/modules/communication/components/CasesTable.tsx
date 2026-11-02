'use client'
// `/backend/communication/cases` (foundation III *UI and Interaction Contracts* → the case register; REQ-M09, J-M03;
// club spec REQ-010): the cases the reader sees — the cases of the sections they coordinate, every case for the
// administrator, and the cases they take part in — newest activity first, with who marked each one and when, from
// `GET /api/communication/threads?isCase=1` (S6.4 envelope). A row opens the thread. An empty register is a
// sentence, not an empty table (lesson `empty-datatable-axe-at-375`).
import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { DataTable, type DataTableProps } from '@open-mercato/ui/backend/DataTable'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { apiCallOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { Button } from '@open-mercato/ui/primitives/button'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { useOrganizationScopeVersion } from '@open-mercato/shared/lib/frontend/useOrganizationScope'
import {
  errorMessage,
  formatDateTime,
  scopeLabel,
  threadHref,
  type ThreadList,
  type ThreadListItem,
  type Translate,
} from './client-helpers'

const PAGE_SIZE = 50

function buildColumns(t: Translate, locale: string): DataTableProps<ThreadListItem>['columns'] {
  return [
    {
      id: 'subject',
      header: t('communication.threads.columns.subject'),
      enableSorting: false,
      meta: { priority: 1 },
      cell: ({ row }) => (
        <Link
          className="font-medium underline-offset-4 hover:underline"
          href={threadHref(row.original.id)}
          data-testid="case-link"
        >
          {row.original.subject}
        </Link>
      ),
    },
    {
      id: 'scope',
      header: t('communication.threads.columns.scope'),
      enableSorting: false,
      meta: { priority: 3 },
      cell: ({ row }) => scopeLabel(t, row.original),
    },
    {
      id: 'caseOpened',
      header: t('communication.cases.columns.opened'),
      enableSorting: false,
      meta: { priority: 2 },
      cell: ({ row }) => (row.original.caseOpenedAt ? formatDateTime(row.original.caseOpenedAt, locale) : ''),
    },
    {
      id: 'caseOpenedBy',
      header: t('communication.cases.columns.openedBy'),
      enableSorting: false,
      meta: { priority: 4 },
      cell: ({ row }) => row.original.caseOpenedByName ?? '',
    },
    {
      id: 'lastMessage',
      header: t('communication.threads.columns.lastMessage'),
      enableSorting: false,
      meta: { priority: 5 },
      cell: ({ row }) => formatDateTime(row.original.lastMessageAt, locale),
    },
  ]
}

export function CasesTable() {
  const t = useT()
  const locale = useLocale()
  const router = useRouter()
  const scopeVersion = useOrganizationScopeVersion()
  const [page, setPage] = React.useState(1)
  const query = useQuery({
    queryKey: ['communication-cases', page, scopeVersion],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE), isCase: '1' })
      const call = await apiCallOrThrow<ThreadList>(`/api/communication/threads?${params.toString()}`, undefined, {
        errorMessage: t('communication.cases.errors.load'),
      })
      return call.result as ThreadList
    },
  })
  const columns = React.useMemo(() => buildColumns(t, locale), [t, locale])
  const items = query.data?.items ?? []

  if (!query.data && query.isFetching) return <LoadingMessage label={t('communication.cases.loading')} />
  if (query.error && !query.data) {
    return (
      <ErrorMessage
        label={errorMessage(query.error, t('communication.cases.errors.load'))}
        action={
          <Button type="button" variant="outline" className="min-h-11" onClick={() => void query.refetch()}>
            {t('communication.actions.retry')}
          </Button>
        }
      />
    )
  }
  if (items.length === 0) {
    return (
      <section className="flex flex-col gap-4" data-testid="cases-empty">
        <h1 className="text-2xl font-semibold">{t('communication.cases.title')}</h1>
        <p className="text-muted-foreground">{t('communication.cases.empty')}</p>
      </section>
    )
  }
  return (
    <div className="flex flex-col gap-3" data-testid="cases-register">
      <p className="text-muted-foreground text-sm">{t('communication.cases.description')}</p>
      <DataTable<ThreadListItem>
        title={t('communication.cases.title')}
        titleHeadingLevel={1}
        entityId="communication:thread"
        extensionTableId="communication.cases"
        columns={columns}
        data={items}
        isLoading={query.isFetching}
        onRowClick={(row: ThreadListItem) => {
          router.push(threadHref(row.id))
        }}
        pagination={{
          page,
          pageSize: PAGE_SIZE,
          total: query.data?.total ?? 0,
          totalPages: query.data?.totalPages ?? 0,
          onPageChange: setPage,
        }}
      />
    </div>
  )
}
