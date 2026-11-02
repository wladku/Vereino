'use client'
// `/backend/communication/threads` (foundation III *UI and Interaction Contracts*; REQ-M06): the threads the caller
// sees — participants, the coordinators of the thread's section, the administrator (DD-M12) — newest activity first,
// with the scope, the author, the unread marker and the "unread only" filter; "New announcement" for authors. An
// empty list is a sentence, not an empty table (lesson `empty-datatable-axe-at-375`).
import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { DataTable, type DataTableProps } from '@open-mercato/ui/backend/DataTable'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { apiCallOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { Button } from '@open-mercato/ui/primitives/button'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { useOrganizationScopeVersion } from '@open-mercato/shared/lib/frontend/useOrganizationScope'
import {
  THREAD_CREATE_HREF,
  errorMessage,
  formatDateTime,
  scopeLabel,
  threadHref,
  type ThreadList,
  type ThreadListItem,
  type Translate,
} from './client-helpers'
import { useCanPost } from './useCanPost'

const PAGE_SIZE = 50

function buildColumns(t: Translate, locale: string): DataTableProps<ThreadListItem>['columns'] {
  return [
    {
      id: 'subject',
      header: t('communication.threads.columns.subject'),
      enableSorting: false,
      meta: { priority: 1 },
      cell: ({ row }) => (
        <span className="flex flex-wrap items-center gap-2">
          <Link
            className="font-medium underline-offset-4 hover:underline"
            href={threadHref(row.original.id)}
            data-testid="thread-link"
          >
            {row.original.subject}
          </Link>
          {row.original.unread ? (
            <span data-testid="thread-unread">
              <StatusBadge variant="info">{t('communication.threads.unread')}</StatusBadge>
            </span>
          ) : null}
        </span>
      ),
    },
    {
      id: 'scope',
      header: t('communication.threads.columns.scope'),
      enableSorting: false,
      meta: { priority: 2 },
      cell: ({ row }) => scopeLabel(t, row.original),
    },
    {
      id: 'lastMessage',
      header: t('communication.threads.columns.lastMessage'),
      enableSorting: false,
      meta: { priority: 3 },
      cell: ({ row }) => formatDateTime(row.original.lastMessageAt, locale),
    },
  ]
}

export function ThreadsTable() {
  const t = useT()
  const canPost = useCanPost()
  const locale = useLocale()
  const router = useRouter()
  const scopeVersion = useOrganizationScopeVersion()
  const [page, setPage] = React.useState(1)
  const [unreadOnly, setUnreadOnly] = React.useState(false)
  const query = useQuery({
    queryKey: ['communication-threads', page, unreadOnly, scopeVersion],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) })
      if (unreadOnly) params.set('unread', '1')
      const call = await apiCallOrThrow<ThreadList>(`/api/communication/threads?${params.toString()}`, undefined, {
        errorMessage: t('communication.threads.errors.load'),
      })
      return call.result as ThreadList
    },
  })
  const columns = React.useMemo(() => buildColumns(t, locale), [t, locale])
  const items = query.data?.items ?? []

  const actions = canPost ? (
    <Button asChild>
      <Link href={THREAD_CREATE_HREF} data-testid="thread-create">
        {t('communication.threads.actions.create')}
      </Link>
    </Button>
  ) : null

  const filter = (
    <label className="flex min-h-11 items-center gap-2 text-sm">
      <input
        type="checkbox"
        className="size-4"
        checked={unreadOnly}
        onChange={(event) => {
          setUnreadOnly(event.target.checked)
          setPage(1)
        }}
        data-testid="threads-unread-only"
      />
      {t('communication.threads.unread')}
    </label>
  )

  if (!query.data && query.isFetching) return <LoadingMessage label={t('communication.club.loading')} />
  if (query.error && !query.data) {
    return (
      <ErrorMessage
        label={errorMessage(query.error, t('communication.threads.errors.load'))}
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
      <section className="flex flex-col gap-4" data-testid="threads-empty">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">{t('communication.threads.title')}</h1>
          {actions}
        </div>
        {filter}
        <p className="text-muted-foreground">{t('communication.threads.empty')}</p>
      </section>
    )
  }
  return (
    <div className="flex flex-col gap-3">
      <DataTable<ThreadListItem>
        title={t('communication.threads.title')}
        titleHeadingLevel={1}
        entityId="communication:thread"
        extensionTableId="communication.threads"
        actions={actions}
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
      {filter}
    </div>
  )
}
