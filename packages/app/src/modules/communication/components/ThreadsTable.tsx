'use client'
// `/backend/communication/threads` (B-18; foundation III *UI and Interaction Contracts*; REQ-M06): the threads the
// caller sees — participants, the coordinators of the thread's section, the administrator (DD-M12) — newest activity
// first, with the scope, the last message as "{author}, {time}", the number of messages, the case and unread markers;
// filters by scope type, by section (the sections the caller oversees: the section's own threads and its groups',
// activities' and sessions', #103) and "unread only"; "New announcement" for authors. The filters stay above the list
// and keep their focus while it reloads. An empty list is a sentence, not an empty table (lesson
// `empty-datatable-axe-at-375`).
import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { DataTable, type DataTableProps } from '@open-mercato/ui/backend/DataTable'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { apiCall, apiCallOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { Button } from '@open-mercato/ui/primitives/button'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { useOrganizationScopeVersion } from '@open-mercato/shared/lib/frontend/useOrganizationScope'
import {
  NO_THREAD_FILTERS,
  OWN_FORBIDDEN_STATE,
  THREAD_CREATE_HREF,
  THREAD_SCOPE_TYPES,
  errorMessage,
  hasThreadFilters,
  lastMessageLabel,
  scopeLabel,
  scopeTypeLabel,
  threadHref,
  threadListQuery,
  type ThreadList,
  type ThreadListFilters,
  type ThreadListItem,
  type ThreadScopeType,
  type Translate,
} from './client-helpers'
import { useCanPost } from './useCanPost'

const PAGE_SIZE = 50

const CONTROL_CLASS_NAME =
  'border-input bg-background focus-visible:shadow-focus min-h-11 w-full rounded-md border px-3 text-sm outline-none'

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
          {row.original.isCase ? (
            <span data-testid="thread-case">
              <StatusBadge variant="warning">{t('communication.cases.badge')}</StatusBadge>
            </span>
          ) : null}
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
      cell: ({ row }) => <span data-testid="thread-last-message">{lastMessageLabel(t, row.original, locale)}</span>,
    },
    {
      id: 'messageCount',
      header: t('communication.threads.columns.messages'),
      enableSorting: false,
      meta: { priority: 4 },
      cell: ({ row }) => <span data-testid="thread-message-count">{row.original.messageCount}</span>,
    },
  ]
}

type SectionOption = { id: string; label: string }

/**
 * The sections the caller may filter by: the composer's section targets — every section for the administrator, a
 * coordinator's own sections, none for a coach. A failed read leaves the filter out; the list still works.
 */
function useSectionOptions(enabled: boolean) {
  const scopeVersion = useOrganizationScopeVersion()
  return useQuery({
    queryKey: ['communication-thread-sections', scopeVersion],
    enabled,
    queryFn: async (): Promise<SectionOption[]> => {
      const call = await apiCall<{ items?: SectionOption[] }>(
        '/api/communication/audience/targets?kind=section',
        OWN_FORBIDDEN_STATE,
      )
      if (!call.ok) return []
      return (call.result?.items ?? []).map((item) => ({ id: item.id, label: item.label }))
    },
  })
}

function ThreadFilters({
  filters,
  sections,
  onChange,
}: {
  filters: ThreadListFilters
  sections: SectionOption[]
  onChange: (next: ThreadListFilters) => void
}) {
  const t = useT()
  const id = React.useId()
  return (
    <div
      role="group"
      aria-label={t('communication.threads.filters.title')}
      className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end"
      data-testid="threads-filters"
    >
      <div className="flex min-w-0 flex-col gap-1 sm:w-56">
        <label htmlFor={`${id}-scope-type`} className="text-sm font-medium">
          {t('communication.threads.filters.scopeType')}
        </label>
        <select
          id={`${id}-scope-type`}
          className={CONTROL_CLASS_NAME}
          value={filters.scopeType}
          onChange={(event) => {
            onChange({ ...filters, scopeType: event.target.value as ThreadScopeType | '' })
          }}
          data-testid="threads-filter-scope-type"
        >
          <option value="">{t('communication.threads.filters.allScopeTypes')}</option>
          {THREAD_SCOPE_TYPES.map((scopeType) => (
            <option key={scopeType} value={scopeType}>
              {scopeTypeLabel(t, scopeType)}
            </option>
          ))}
        </select>
      </div>
      {sections.length > 0 ? (
        <div className="flex min-w-0 flex-col gap-1 sm:w-56">
          <label htmlFor={`${id}-section`} className="text-sm font-medium">
            {t('communication.threads.filters.section')}
          </label>
          <select
            id={`${id}-section`}
            className={CONTROL_CLASS_NAME}
            value={filters.sectionId}
            onChange={(event) => {
              onChange({ ...filters, sectionId: event.target.value })
            }}
            data-testid="threads-filter-section"
          >
            <option value="">{t('communication.threads.filters.allSections')}</option>
            {sections.map((section) => (
              <option key={section.id} value={section.id}>
                {section.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <div className="flex min-h-11 items-center gap-2">
        <input
          id={`${id}-unread`}
          type="checkbox"
          className="accent-primary size-4"
          checked={filters.unreadOnly}
          onChange={(event) => {
            onChange({ ...filters, unreadOnly: event.target.checked })
          }}
          data-testid="threads-unread-only"
        />
        <label htmlFor={`${id}-unread`} className="text-sm">
          {t('communication.threads.unread')}
        </label>
      </div>
      {hasThreadFilters(filters) ? (
        <div>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => {
              onChange(NO_THREAD_FILTERS)
            }}
            data-testid="threads-filters-clear"
          >
            {t('communication.threads.filters.clear')}
          </Button>
        </div>
      ) : null}
    </div>
  )
}

export function ThreadsTable() {
  const t = useT()
  const canPost = useCanPost()
  const locale = useLocale()
  const router = useRouter()
  const scopeVersion = useOrganizationScopeVersion()
  const [page, setPage] = React.useState(1)
  const [filters, setFilters] = React.useState<ThreadListFilters>(NO_THREAD_FILTERS)
  const sections = useSectionOptions(canPost)
  const query = useQuery({
    queryKey: ['communication-threads', page, filters, scopeVersion],
    // The previous result stays on screen while a filter change loads, so the filter keeps its focus.
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const call = await apiCallOrThrow<ThreadList>(
        `/api/communication/threads?${threadListQuery(page, PAGE_SIZE, filters)}`,
        undefined,
        { errorMessage: t('communication.threads.errors.load') },
      )
      return call.result as ThreadList
    },
  })
  const columns = React.useMemo(() => buildColumns(t, locale), [t, locale])
  const items = query.data?.items ?? []

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
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t('communication.threads.title')}</h1>
        {canPost ? (
          <Button asChild>
            <Link href={THREAD_CREATE_HREF} data-testid="thread-create">
              {t('communication.threads.actions.create')}
            </Link>
          </Button>
        ) : null}
      </div>
      <ThreadFilters
        filters={filters}
        sections={sections.data ?? []}
        onChange={(next) => {
          setFilters(next)
          setPage(1)
        }}
      />
      {items.length === 0 ? (
        <p className="text-muted-foreground" data-testid="threads-empty">
          {hasThreadFilters(filters) ? t('communication.threads.emptyFiltered') : t('communication.threads.empty')}
        </p>
      ) : (
        <DataTable<ThreadListItem>
          entityId="communication:thread"
          extensionTableId="communication.threads"
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
      )}
    </div>
  )
}
