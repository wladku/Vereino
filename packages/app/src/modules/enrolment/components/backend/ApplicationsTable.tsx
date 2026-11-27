'use client'
// `/backend/enrolment/applications` (sign-up form spec B-J1, REQ-J10, REQ-J11, REQ-J17, J-J07; #799): the applications
// the caller decides in a `DataTable` — the M-J2 columns (participant, age on the reference date, group or "Choose for
// us", confirmed date, flags) plus the section and, on the waiting list, the number — with the tabs (`?tab=`), the
// name search (not on Closed), the section filter and "Only overdue" (`?overdue=1`, the dashboard widget's link). A row
// opens the application. An empty list is a sentence, not an empty table (lesson `empty-datatable-axe-at-375`).
import * as React from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { DataTable, type DataTableProps } from '@open-mercato/ui/backend/DataTable'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { Button } from '@open-mercato/ui/primitives/button'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { useOrganizationScopeVersion } from '@open-mercato/shared/lib/frontend/useOrganizationScope'
import { TableLoadError, browserTimeZone, useClubTimeZone } from '@vereino/ui'
import { backendApplicationHref } from '../../lib/paths'
import {
  FlagTags,
  ListFilters,
  TabButtons,
  ageLabel,
  groupLabel,
  tabFromParam,
  useDebounced,
  useKnownSections,
} from '../club/ApplicationParts'
import {
  instantDateLabel,
  useApplications,
  type ApplicationListItem,
  type ApplicationTab,
  type Translate,
} from '../club/applications-client'

const PAGE_SIZE = 50

function buildColumns(
  t: Translate,
  locale: string,
  timeZone: string,
  tab: ApplicationTab,
): DataTableProps<ApplicationListItem>['columns'] {
  return [
    ...(tab === 'waiting'
      ? [
          {
            id: 'waitingNumber',
            header: t('enrolment.backend.columns.number'),
            enableSorting: false,
            meta: { priority: 1 },
            cell: ({ row }: { row: { original: ApplicationListItem } }) =>
              row.original.waitingNumber === null ? (
                ''
              ) : (
                <span className="tabular-nums" data-testid="enrolment-waiting-number">
                  {t('enrolment.club.list.waitingNumber', { number: row.original.waitingNumber })}
                </span>
              ),
          },
        ]
      : []),
    {
      id: 'participant',
      header: t('enrolment.backend.columns.participant'),
      enableSorting: false,
      meta: { priority: 1 },
      cell: ({ row }) => (
        <span
          className="font-medium"
          data-testid="enrolment-row"
          data-id={row.original.id}
          data-state={row.original.state}
        >
          {row.original.participantName || t('enrolment.club.anonymised')}
        </span>
      ),
    },
    {
      id: 'age',
      header: t('enrolment.backend.columns.age'),
      enableSorting: false,
      meta: { priority: 2 },
      cell: ({ row }) => ageLabel(t, locale, row.original.age, row.original.referenceDate),
    },
    {
      id: 'group',
      header: t('enrolment.backend.columns.group'),
      enableSorting: false,
      meta: { priority: 2 },
      cell: ({ row }) => groupLabel(t, row.original),
    },
    {
      id: 'section',
      header: t('enrolment.backend.columns.section'),
      enableSorting: false,
      meta: { priority: 3 },
      cell: ({ row }) => row.original.sectionName,
    },
    {
      id: 'date',
      header: t(tab === 'closed' ? 'enrolment.backend.columns.closed' : 'enrolment.backend.columns.confirmed'),
      enableSorting: false,
      meta: { priority: 3 },
      cell: ({ row }) =>
        instantDateLabel(tab === 'closed' ? row.original.closedAt : row.original.confirmedAt, locale, timeZone),
    },
    ...(tab === 'closed'
      ? [
          {
            id: 'state',
            header: t('enrolment.backend.columns.state'),
            enableSorting: false,
            meta: { priority: 2 },
            cell: ({ row }: { row: { original: ApplicationListItem } }) => t(`enrolment.states.${row.original.state}`),
          },
        ]
      : []),
    {
      id: 'flags',
      header: t('enrolment.backend.columns.flags'),
      enableSorting: false,
      meta: { priority: 2 },
      cell: ({ row }) => <FlagTags flags={row.original.flags} />,
    },
  ]
}

export function ApplicationsTable() {
  const t = useT()
  const locale = useLocale()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const scopeVersion = useOrganizationScopeVersion()
  const timeZone = useClubTimeZone() ?? browserTimeZone()
  const tab = tabFromParam(searchParams.get('tab'))
  const overdue = tab === 'new' && ['1', 'true'].includes(searchParams.get('overdue') ?? '')
  const [sectionId, setSectionId] = React.useState<string | null>(null)
  const [search, setSearch] = React.useState('')
  const [page, setPage] = React.useState(1)
  const q = useDebounced(search)
  const query = useApplications({ tab, sectionId, overdue, q: tab === 'closed' ? '' : q, page, pageSize: PAGE_SIZE }, [
    scopeVersion,
  ])
  const sections = useKnownSections(query.data?.items)
  const columns = React.useMemo(() => buildColumns(t, locale, timeZone, tab), [t, locale, timeZone, tab])

  const setParams = (changes: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) params.delete(key)
      else params.set(key, value)
    }
    setPage(1)
    const text = params.toString()
    router.replace(text ? `${pathname}?${text}` : pathname)
  }

  const title = t('enrolment.backend.title')
  const controls = (
    <div className="flex flex-col gap-3">
      <TabButtons
        tab={tab}
        onChange={(next) => {
          setParams({ tab: next, overdue: next === 'new' && overdue ? '1' : null })
        }}
      />
      <ListFilters
        tab={tab}
        sections={sections}
        sectionId={sectionId}
        onSectionChange={(next) => {
          setSectionId(next)
          setPage(1)
        }}
        search={search}
        onSearchChange={(next) => {
          setSearch(next)
          setPage(1)
        }}
        overdue={overdue}
        onOverdueChange={(next) => {
          setParams({ overdue: next ? '1' : null })
        }}
      />
    </div>
  )

  let body: React.ReactNode
  if (!query.data && query.isFetching) {
    body = <LoadingMessage label={t('enrolment.club.loading')} />
  } else if (!query.data) {
    body = (
      <ErrorMessage
        label={t('enrolment.club.errors.list')}
        action={
          <Button type="button" variant="outline" className="min-h-11" onClick={() => void query.refetch()}>
            {t('enrolment.club.actions.retry')}
          </Button>
        }
      />
    )
  } else if (query.data.items.length === 0) {
    body = (
      <p className="text-muted-foreground" data-testid="enrolment-empty">
        {t(q || sectionId || overdue ? 'enrolment.club.list.emptyFiltered' : `enrolment.club.list.empty.${tab}`)}
      </p>
    )
  } else {
    body = (
      <div className="relative max-w-full min-w-0 overflow-x-auto">
        <DataTable<ApplicationListItem>
          extensionTableId="enrolment.applications"
          columns={columns}
          data={query.data.items}
          isLoading={query.isFetching}
          error={
            query.error ? (
              <TableLoadError
                message={t('enrolment.club.errors.list')}
                retryLabel={t('enrolment.club.actions.retry')}
                onRetry={() => void query.refetch()}
              />
            ) : null
          }
          onRowClick={(row: ApplicationListItem) => {
            router.push(backendApplicationHref(row.id))
          }}
          pagination={{
            page,
            pageSize: PAGE_SIZE,
            total: query.data.total,
            totalPages: query.data.totalPages,
            onPageChange: setPage,
          }}
        />
      </div>
    )
  }

  return (
    <section
      className="flex flex-col gap-4"
      data-testid="enrolment-list"
      data-tab={tab}
      aria-labelledby="enrolment-backend-title"
    >
      <div className="flex flex-col gap-1">
        <h1 id="enrolment-backend-title" className="text-2xl font-semibold">
          {title}
        </h1>
        <p className="text-muted-foreground text-sm">{t('enrolment.backend.description')}</p>
      </div>
      {controls}
      {body}
    </section>
  )
}
