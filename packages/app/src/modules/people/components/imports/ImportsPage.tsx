'use client'
// `/backend/people/imports` (club spec UI table, REQ-036; #28): the upload with its column mapping, and the import
// history with who ran each import, its status and what it classified or created.
import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { RowActions } from '@open-mercato/ui/backend/RowActions'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { useOrganizationScopeVersion } from '@open-mercato/shared/lib/frontend/useOrganizationScope'
import type { TableColumns, Translate } from '../client-helpers'
import { ImportUpload } from './ImportUpload'
import { IMPORTS_HREF, STATUS_VARIANTS, instantLabel, type ImportRow, type Paged } from './import-client'

const PAGE_SIZE = 20

function summaryLabel(t: Translate, row: ImportRow): string {
  const summary = row.summary
  if (row.status === 'committed') {
    return t('people.imports.history.committedSummary', {
      created: summary.created ?? 0,
      updated: summary.updated ?? 0,
      linked: summary.linked ?? 0,
    })
  }
  return t('people.imports.history.previewSummary', {
    new: summary.new ?? 0,
    matched: summary.matched ?? 0,
    review: summary.review ?? 0,
    error: summary.error ?? 0,
  })
}

function buildColumns(t: Translate): TableColumns<ImportRow> {
  return [
    {
      id: 'createdAt',
      header: t('people.imports.history.columns.createdAt'),
      enableSorting: false,
      meta: { priority: 1 },
      cell: ({ row }) => (
        <Link className="font-medium underline-offset-4 hover:underline" href={`${IMPORTS_HREF}/${row.original.id}`}>
          {instantLabel(row.original.createdAt)}
        </Link>
      ),
    },
    {
      id: 'status',
      header: t('people.imports.history.columns.status'),
      enableSorting: false,
      meta: { priority: 1 },
      cell: ({ row }) => (
        <span data-testid={`people-import-status-${row.original.id}`}>
          <StatusBadge variant={STATUS_VARIANTS[row.original.status]}>
            {t(`people.imports.status.${row.original.status}`)}
          </StatusBadge>
        </span>
      ),
    },
    {
      id: 'createdBy',
      header: t('people.imports.history.columns.createdBy'),
      enableSorting: false,
      meta: { priority: 2 },
      cell: ({ row }) => row.original.createdBy.name ?? t('people.common.empty'),
    },
    {
      id: 'rows',
      header: t('people.imports.history.columns.rows'),
      enableSorting: false,
      meta: { priority: 3 },
      cell: ({ row }) => summaryLabel(t, row.original),
    },
    {
      id: 'committed',
      header: t('people.imports.history.columns.committed'),
      enableSorting: false,
      meta: { priority: 4 },
      cell: ({ row }) =>
        row.original.committedAt
          ? t('people.imports.history.committedBy', {
              name: row.original.committedBy?.name ?? t('people.common.empty'),
              at: instantLabel(row.original.committedAt),
            })
          : t('people.common.empty'),
    },
  ]
}

export function ImportsPage() {
  const t = useT()
  const router = useRouter()
  const scopeVersion = useOrganizationScopeVersion()
  const [page, setPage] = React.useState(1)
  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ['people-imports', page, scopeVersion],
    queryFn: async () => {
      const call = await apiCall<Paged<ImportRow>>(
        `/api/people/imports?page=${String(page)}&pageSize=${String(PAGE_SIZE)}`,
      )
      if (!call.ok || !call.result) throw new Error(t('people.imports.errors.load'))
      return call.result
    },
  })
  const columns = React.useMemo(() => buildColumns(t), [t])

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t('people.imports.title')}</h1>
      <ImportUpload />
      {data?.total === 0 ? (
        // An empty history is a heading and a sentence, not an empty table: the table's scroll container would be a
        // scrollable region without anything a keyboard can reach (axe `scrollable-region-focusable`) on a phone.
        <section className="flex flex-col gap-2" data-testid="people-imports-empty">
          <h2 className="text-lg font-semibold">{t('people.imports.history.title')}</h2>
          <p className="text-muted-foreground text-sm">{t('people.imports.history.empty')}</p>
        </section>
      ) : (
        <DataTable<ImportRow>
          title={t('people.imports.history.title')}
          titleHeadingLevel={2}
          entityId="people:person_import"
          extensionTableId="people.imports"
          columns={columns}
          data={data?.items ?? []}
          isLoading={isLoading || (!data && isFetching)}
          error={error && !isFetching ? t('people.imports.errors.load') : null}
          emptyState={<p className="text-muted-foreground text-sm">{t('people.imports.history.empty')}</p>}
          rowActions={(row: ImportRow) => (
            <RowActions items={[{ id: 'open', label: t('people.common.open'), href: `${IMPORTS_HREF}/${row.id}` }]} />
          )}
          onRowClick={(row: ImportRow) => {
            router.push(`${IMPORTS_HREF}/${row.id}`)
          }}
          pagination={{
            page,
            pageSize: PAGE_SIZE,
            total: data?.total ?? 0,
            totalPages: data?.totalPages ?? 0,
            onPageChange: setPage,
          }}
        />
      )}
    </div>
  )
}
