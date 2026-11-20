'use client'
// `/backend/activities/occurrences` — "Sessions" (club spec UI table, REQ-005, REQ-006; README B-15; E06-S12 #94): the
// sessions in the caller's record scope in date order, with server filters status, date range (slot dates), section,
// group and "needs reschedule"; the date range starts at 7 days back through 14 days ahead and can be cleared. The
// views Upcoming / Needing a coach / Needs a new time / Unsettled / Canceled / Calendar live in the URL (`?view=`;
// `?perspective=` stays accepted, DD-A11 of the groups and activities parity spec, #268): "Needing a coach" lists
// planned sessions without a coach from today for 14 days, "Needs a new time" planned sessions flagged
// `needs_reschedule`, "Unsettled" planned sessions that ended 24 hours ago or more (E06-S13 #95), Canceled cancelled
// sessions with their reason, Calendar is the coordinator's week grid (`CoordinatorCalendar`). `?activity=` scopes the
// list to one activity under the header "Sessions of {activity}" with a link back to all sessions (#268). The session
// status, "unsettled", "moved" (detached from its series) and "needs reschedule" are badges, and the coach column marks
// "Needs a coach" and "(substitution)". Each row opens the session; its buttons — Assign substitute (the primary one)
// or Change coach and Move with `activities.manage`, then Cancel for a future planned session the caller may cancel
// (`mayCancel`, #215) or Attendance list for a started one with `activities.coach` — are inline from 1024 px and in
// the row menu always. Each view has its own empty state. `ActivitySessions` is the same list for one activity (the
// "Sessions" tab of its record).
import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { EmptyState } from '@open-mercato/ui/backend/EmptyState'
import type { FilterDef, FilterValues } from '@open-mercato/ui/backend/FilterOverlay'
import { RowActions, type RowActionItem } from '@open-mercato/ui/backend/RowActions'
import { readApiResultOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { fetchCrudList } from '@open-mercato/ui/backend/utils/crud'
import { Button } from '@open-mercato/ui/primitives/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@open-mercato/ui/primitives/tabs'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { useOrganizationScopeVersion } from '@open-mercato/shared/lib/frontend/useOrganizationScope'
import { OCCURRENCE_STATUSES } from '../lib/activities-rules'
import {
  OCCURRENCE_PERSPECTIVES,
  activityOfParams,
  coachBadge,
  localCalendarDate,
  perspectiveHref,
  perspectiveOf,
  perspectiveQuery,
  perspectiveWindow,
  sessionInlineActions,
  viewOfParams,
  type OccurrencePerspective,
  type SessionInlineAction,
} from '../lib/occurrence-list'
import { isUnsettled } from '../lib/substitutions'
import { AssignCoachDialog } from './AssignCoachDialog'
import { CancelOccurrenceDialog } from './CancelOccurrenceDialog'
import { CoordinatorCalendar } from './CoordinatorCalendar'
import { MoveOccurrenceDialog } from './MoveOccurrenceDialog'
import { attendanceHref } from './club/club-client'
import { useActivitiesFeatures } from './useActivitiesFeatures'
import {
  ACTIVITIES_HREF,
  OCCURRENCES_HREF,
  activityHref,
  dateLabel,
  errorMessage,
  groupOptions,
  occurrenceHref,
  sectionOptions,
  statusLabel,
  statusVariant,
  timeRangeOfInstants,
  tolerant,
  type ActivityDetail,
  type OccurrenceRow,
  type TableColumns,
  type Translate,
} from './client-helpers'
import { StatusTag } from '@vereino/ui'

const PAGE_SIZE = 50

/** The label of each row action, inline and in the row menu. */
const ACTION_LABELS: Record<SessionInlineAction, string> = {
  assign: 'activities.substitutions.assign.action',
  change: 'activities.substitutions.change.action',
  move: 'activities.occurrences.actions.move',
  cancel: 'activities.occurrences.actions.cancel',
  attendance: 'activities.occurrences.actions.attendance',
}

/** The status badge, "unsettled" and the "moved" / "needs reschedule" flags of a session. */
export function OccurrenceBadges({ row, t }: { row: OccurrenceRow; t: Translate }) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      <StatusTag status={statusVariant(row.status)}>{statusLabel(t, row.status)}</StatusTag>
      {isUnsettled(row, new Date()) ? (
        <span data-testid="occurrence-unsettled">
          <StatusTag status="warning">{t('activities.occurrences.flags.unsettled')}</StatusTag>
        </span>
      ) : null}
      {row.isDetached ? <StatusTag status="info">{t('activities.occurrences.flags.moved')}</StatusTag> : null}
      {row.needsReschedule ? (
        <StatusTag status="warning">{t('activities.occurrences.flags.needsReschedule')}</StatusTag>
      ) : null}
    </span>
  )
}

/** The coach of a session with "Needs a coach" or "(substitution)" (README B-15, E06-S13 #95). */
export function OccurrenceCoach({ row, t }: { row: OccurrenceRow; t: Translate }) {
  const badge = coachBadge(row)
  if (badge === 'needs_coach') {
    return (
      <span data-testid="occurrence-needs-coach">
        <StatusTag status="warning">{t('activities.club.session.needsCoach')}</StatusTag>
      </span>
    )
  }
  return (
    <span className="flex flex-wrap items-center gap-1">
      <span>{row.coachName ?? <span className="text-muted-foreground">—</span>}</span>
      {badge === 'substitution' ? (
        <span
          className="text-muted-foreground text-xs"
          data-testid="occurrence-substitution"
          title={
            row.substituteForName
              ? t('activities.substitutions.substituteFor', { name: row.substituteForName })
              : undefined
          }
        >
          {t('activities.substitutions.substitution')}
        </span>
      ) : null}
    </span>
  )
}

function buildColumns(t: Translate, withActivity: boolean, withReason = false): TableColumns<OccurrenceRow> {
  const dash = <span className="text-muted-foreground">—</span>
  const columns: TableColumns<OccurrenceRow> = [
    {
      id: 'date',
      header: t('activities.occurrences.columns.date'),
      enableSorting: false,
      meta: { priority: 1 },
      cell: ({ row }) => (
        <Link
          className="font-medium whitespace-nowrap underline-offset-4 hover:underline"
          href={occurrenceHref(row.original.id)}
        >
          {dateLabel(t, row.original.occurrenceDate)}
        </Link>
      ),
    },
    {
      id: 'time',
      header: t('activities.occurrences.columns.time'),
      enableSorting: false,
      meta: { priority: 2 },
      cell: ({ row }) => (
        <span className="whitespace-nowrap">{timeRangeOfInstants(row.original.startAt, row.original.endAt)}</span>
      ),
    },
  ]
  if (withActivity) {
    columns.push(
      {
        accessorKey: 'activityName',
        header: t('activities.occurrences.columns.activity'),
        enableSorting: false,
        meta: { priority: 2 },
        cell: ({ row }) => row.original.activityName ?? dash,
      },
      {
        accessorKey: 'groupName',
        header: t('activities.occurrences.columns.group'),
        enableSorting: false,
        meta: { priority: 4 },
        cell: ({ row }) => row.original.groupName ?? dash,
      },
    )
  }
  columns.push(
    {
      accessorKey: 'placeName',
      header: t('activities.occurrences.columns.place'),
      enableSorting: false,
      meta: { priority: 5 },
      cell: ({ row }) => row.original.placeName ?? dash,
    },
    {
      accessorKey: 'coachName',
      header: t('activities.occurrences.columns.coach'),
      enableSorting: false,
      meta: { priority: 6 },
      cell: ({ row }) => <OccurrenceCoach row={row.original} t={t} />,
    },
    {
      accessorKey: 'status',
      header: t('activities.occurrences.columns.status'),
      enableSorting: false,
      meta: { priority: 3 },
      cell: ({ row }) => <OccurrenceBadges row={row.original} t={t} />,
    },
  )
  if (withReason) {
    columns.push({
      accessorKey: 'cancelReason',
      header: t('activities.occurrences.columns.reason'),
      enableSorting: false,
      meta: { priority: 3 },
      cell: ({ row }) => <span className="break-words whitespace-pre-wrap">{row.original.cancelReason ?? dash}</span>,
    })
  }
  return columns
}

/** The list query parameters of the applied filters (`GET /api/activities/occurrences`). */
function filterParams(values: FilterValues): Record<string, string> {
  const params: Record<string, string> = {}
  for (const key of ['status', 'sectionId', 'groupId'] as const) {
    const value: unknown = values[key]
    if (typeof value === 'string' && value) params[key] = value
  }
  const range: unknown = values.dates
  if (range && typeof range === 'object') {
    const { from, to } = range as { from?: unknown; to?: unknown }
    if (typeof from === 'string' && from) params.from = from
    if (typeof to === 'string' && to) params.to = to
  }
  if (values.needsReschedule === true) params.needsReschedule = 'true'
  return params
}

function useOccurrenceRowActions(t: Translate) {
  return React.useCallback(
    (row: OccurrenceRow) => (
      <RowActions items={[{ id: 'open', label: t('activities.common.open'), href: occurrenceHref(row.id) }]} />
    ),
    [t],
  )
}

/** "Tue 2026-11-17, Żaki — training": how a row action names its session to a screen reader. */
function sessionName(t: Translate, row: OccurrenceRow): string {
  return [dateLabel(t, row.occurrenceDate), row.activityName].filter(Boolean).join(', ')
}

/** The row buttons from 1024 px (B-15, #268); "Assign substitute" is the row's primary button. */
function InlineActions({
  row,
  actions,
  onAction,
  t,
}: {
  row: OccurrenceRow
  actions: SessionInlineAction[]
  onAction: (action: SessionInlineAction, row: OccurrenceRow) => void
  t: Translate
}) {
  if (actions.length === 0) return null
  const session = sessionName(t, row)
  return (
    // The row opens the session; a click on a button stays on the button (each one stops the click).
    <span className="hidden flex-wrap items-center gap-1 lg:flex" data-testid="occurrence-inline-actions">
      {actions.map((action) => {
        const label = t(ACTION_LABELS[action])
        const ariaLabel = t('activities.occurrences.actions.forSession', { action: label, session })
        if (action === 'attendance') {
          return (
            <Button key={action} asChild size="sm" variant="outline">
              <Link
                href={attendanceHref(row.id)}
                aria-label={ariaLabel}
                data-testid="occurrence-inline-attendance"
                onClick={(event) => {
                  event.stopPropagation()
                }}
              >
                {label}
              </Link>
            </Button>
          )
        }
        return (
          <Button
            key={action}
            type="button"
            size="sm"
            variant={action === 'assign' ? 'default' : action === 'cancel' ? 'destructive-outline' : 'outline'}
            data-testid={`occurrence-inline-${action}`}
            aria-label={ariaLabel}
            onClick={(event) => {
              event.stopPropagation()
              onAction(action, row)
            }}
          >
            {label}
          </Button>
        )
      })}
    </span>
  )
}

/** The empty state of a view (README B-15, #268): what the empty view means and, for Upcoming, the next action. */
function ViewEmptyState({
  perspective,
  canCreate,
  t,
}: {
  perspective: Exclude<OccurrencePerspective, 'calendar'>
  canCreate: boolean
  t: Translate
}) {
  return (
    <div data-testid={`occurrences-empty-${perspective}`}>
      <EmptyState
        title={t(`activities.occurrences.empty.${perspective}.title`)}
        description={t(`activities.occurrences.empty.${perspective}.text`)}
        actions={
          perspective === 'all' && canCreate ? (
            <Button asChild>
              <Link href={`${ACTIVITIES_HREF}/create`}>{t('activities.activities.actions.create')}</Link>
            </Button>
          ) : undefined
        }
      />
    </div>
  )
}

/** The list of every view but Calendar, optionally scoped to one activity (`?activity=`). */
function SessionsList({
  perspective,
  activityId,
}: {
  perspective: Exclude<OccurrencePerspective, 'calendar'>
  activityId: string | null
}) {
  const t = useT()
  const router = useRouter()
  const queryClient = useQueryClient()
  const scopeVersion = useOrganizationScopeVersion()
  const features = useActivitiesFeatures()
  // The browser's today: the view's default window (none for "Unsettled" and "Needs a new time"), clearable.
  const [filters, setFilters] = React.useState<FilterValues>(() => {
    const window = perspectiveWindow(perspective, localCalendarDate(new Date()))
    return window ? { dates: window } : {}
  })
  const [page, setPage] = React.useState(1)
  const [cancelling, setCancelling] = React.useState<OccurrenceRow | null>(null)
  const [staffing, setStaffing] = React.useState<OccurrenceRow | null>(null)
  const [moving, setMoving] = React.useState<OccurrenceRow | null>(null)
  const pinned = perspectiveQuery(perspective)

  const { data, isLoading, error, dataUpdatedAt } = useQuery({
    queryKey: ['activities-occurrences', perspective, activityId, filters, page, scopeVersion],
    queryFn: () =>
      fetchCrudList<OccurrenceRow>('activities/occurrences', {
        page,
        pageSize: PAGE_SIZE,
        sortField: 'startAt',
        sortDir: 'asc',
        ...filterParams(filters),
        ...pinned,
        ...(activityId ? { activityId } : {}),
      }),
  })
  // "Started" is judged at the moment the page was read, so the row actions match the rows shown.
  const readAt = React.useMemo(() => new Date(dataUpdatedAt), [dataUpdatedAt])
  const can = React.useMemo(
    () => ({ manage: features.manage, coach: features.coach }),
    [features.manage, features.coach],
  )

  const refresh = React.useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['activities-occurrences'] })
  }, [queryClient])

  const startAction = React.useCallback((action: SessionInlineAction, row: OccurrenceRow) => {
    if (action === 'assign' || action === 'change') setStaffing(row)
    else if (action === 'move') setMoving(row)
    else if (action === 'cancel') setCancelling(row)
  }, [])

  const columns = React.useMemo(() => {
    const base = buildColumns(t, !activityId, perspective === 'cancelled')
    base.push({
      id: 'actions',
      header: () => <span className="sr-only">{t('activities.occurrences.columns.actions')}</span>,
      enableSorting: false,
      meta: { priority: 2 },
      cell: ({ row }) => (
        <InlineActions
          row={row.original}
          actions={sessionInlineActions(row.original, readAt, can)}
          onAction={startAction}
          t={t}
        />
      ),
    })
    return base
  }, [t, activityId, perspective, readAt, can, startAction])
  const filterDefs = React.useMemo<FilterDef[]>(
    () => [
      ...(perspective === 'all'
        ? [
            {
              id: 'status',
              label: t('activities.occurrences.filters.status'),
              type: 'select',
              options: OCCURRENCE_STATUSES.map((value) => ({ value, label: statusLabel(t, value) })),
            } satisfies FilterDef,
          ]
        : []),
      { id: 'dates', label: t('activities.occurrences.filters.dates'), type: 'dateRange' },
      {
        id: 'sectionId',
        label: t('activities.occurrences.filters.section'),
        type: 'select',
        loadOptions: tolerant(sectionOptions),
      },
      {
        id: 'groupId',
        label: t('activities.occurrences.filters.group'),
        type: 'select',
        loadOptions: tolerant(() => groupOptions(false)),
      },
      ...(perspective === 'reschedule'
        ? []
        : [
            {
              id: 'needsReschedule',
              label: t('activities.occurrences.filters.needsReschedule'),
              type: 'checkbox',
            } satisfies FilterDef,
          ]),
    ],
    [t, perspective],
  )

  // Below 1024 px the inline buttons are hidden; the row menu always lists every action.
  const rowActions = (row: OccurrenceRow) => {
    const items: RowActionItem[] = [{ id: 'open', label: t('activities.common.open'), href: occurrenceHref(row.id) }]
    for (const action of sessionInlineActions(row, readAt, can)) {
      if (action === 'attendance') {
        items.push({ id: 'attendance', label: t(ACTION_LABELS.attendance), href: attendanceHref(row.id) })
        continue
      }
      items.push({
        id: action === 'assign' || action === 'change' ? 'assign-coach' : action,
        label: t(ACTION_LABELS[action]),
        destructive: action === 'cancel',
        onSelect: () => {
          startAction(action, row)
        },
      })
    }
    return <RowActions items={items} />
  }

  return (
    <>
      <DataTable<OccurrenceRow>
        title={activityId ? t('activities.occurrences.scope.listTitle') : t('activities.occurrences.title')}
        titleHeadingLevel={activityId ? 2 : 1}
        entityId="activities:occurrence"
        extensionTableId="activities.occurrences"
        columns={columns}
        data={data?.items ?? []}
        isLoading={isLoading}
        error={error ? errorMessage(error, t('activities.occurrences.errors.load')) : null}
        emptyState={<ViewEmptyState perspective={perspective} canCreate={features.manage} t={t} />}
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
        rowActions={rowActions}
        onRowClick={(row: OccurrenceRow) => {
          router.push(occurrenceHref(row.id))
        }}
        pagination={{
          page,
          pageSize: PAGE_SIZE,
          total: data?.total ?? 0,
          totalPages: data?.totalPages ?? 0,
          onPageChange: setPage,
        }}
      />
      {cancelling ? (
        <CancelOccurrenceDialog
          key={cancelling.id}
          occurrence={cancelling}
          open
          onOpenChange={(open) => {
            if (!open) setCancelling(null)
          }}
          onDone={refresh}
        />
      ) : null}
      {moving ? (
        <MoveOccurrenceDialog
          key={moving.id}
          occurrence={moving}
          open
          onOpenChange={(open) => {
            if (!open) setMoving(null)
          }}
          onDone={refresh}
        />
      ) : null}
      {staffing ? (
        <AssignCoachDialog
          key={staffing.id}
          occurrence={staffing}
          open
          onOpenChange={(open) => {
            if (!open) setStaffing(null)
          }}
          onDone={refresh}
        />
      ) : null}
    </>
  )
}

/** "Sessions of {activity}" with "All sessions" above a list scoped to one activity (`?activity=`, #268). */
function ActivityScopeHeader({ activityId, perspective }: { activityId: string; perspective: OccurrencePerspective }) {
  const t = useT()
  const { data, isLoading, error } = useQuery({
    queryKey: ['activities-activity', activityId],
    queryFn: () => readApiResultOrThrow<ActivityDetail>(`/api/activities/activities/${encodeURIComponent(activityId)}`),
  })
  const name = data?.name ?? (isLoading || error ? null : t('activities.common.empty'))
  return (
    <header
      className="flex flex-col gap-2 pb-4 sm:flex-row sm:items-center sm:justify-between"
      data-testid="occurrences-scope"
    >
      <h1 className="text-2xl font-semibold break-words">
        {name ? t('activities.occurrences.scope.title', { activity: name }) : t('activities.occurrences.title')}
      </h1>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <Link href={activityHref(activityId)}>{t('activities.occurrences.scope.openActivity')}</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href={perspectiveHref(OCCURRENCES_HREF, perspective)} data-testid="occurrences-scope-all">
            {t('activities.occurrences.scope.all')}
          </Link>
        </Button>
      </div>
    </header>
  )
}

export function OccurrencesTable() {
  const t = useT()
  const router = useRouter()
  const searchParams = useSearchParams()
  const perspective = viewOfParams(searchParams)
  const activityId = activityOfParams(searchParams)
  return (
    <Tabs
      value={perspective}
      onValueChange={(value: string) => {
        if (value !== perspective) router.push(perspectiveHref(OCCURRENCES_HREF, perspectiveOf(value), activityId))
      }}
    >
      {activityId ? <ActivityScopeHeader activityId={activityId} perspective={perspective} /> : null}
      <div className="overflow-x-auto">
        <TabsList aria-label={t('activities.occurrences.perspectives.label')}>
          {OCCURRENCE_PERSPECTIVES.map((value) => (
            <TabsTrigger key={value} value={value}>
              {t(`activities.occurrences.perspectives.${value}`)}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      <TabsContent value={perspective} className="pt-4">
        {perspective === 'calendar' ? (
          <div className="flex min-w-0 flex-col gap-4">
            {activityId ? null : <h1 className="text-2xl font-semibold">{t('activities.occurrences.title')}</h1>}
            <CoordinatorCalendar />
          </div>
        ) : (
          <SessionsList key={`${perspective}:${activityId ?? ''}`} perspective={perspective} activityId={activityId} />
        )}
      </TabsContent>
    </Tabs>
  )
}

export function ActivitySessions({ activityId }: { activityId: string }) {
  const t = useT()
  const router = useRouter()
  const [page, setPage] = React.useState(1)
  const rowActions = useOccurrenceRowActions(t)
  const { data, isLoading, error } = useQuery({
    queryKey: ['activities-occurrences', 'activity', activityId, page],
    queryFn: () =>
      fetchCrudList<OccurrenceRow>('activities/occurrences', {
        activityId,
        page,
        pageSize: PAGE_SIZE,
        sortField: 'startAt',
        sortDir: 'asc',
      }),
  })
  const columns = React.useMemo(() => buildColumns(t, false), [t])
  return (
    <div className="min-w-0" data-testid="activities-sessions-table">
      <DataTable<OccurrenceRow>
        embedded
        title={t('activities.activities.record.sessions')}
        entityId="activities:occurrence"
        extensionTableId="activities.activity-sessions"
        columns={columns}
        data={data?.items ?? []}
        isLoading={isLoading}
        error={error ? errorMessage(error, t('activities.occurrences.errors.load')) : null}
        emptyState={<p className="text-muted-foreground text-sm">{t('activities.activities.record.sessionsEmpty')}</p>}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href={perspectiveHref(OCCURRENCES_HREF, 'all', activityId)} data-testid="activity-sessions-work">
              {t('activities.activities.record.sessionsWork')}
            </Link>
          </Button>
        }
        rowActions={rowActions}
        onRowClick={(row: OccurrenceRow) => {
          router.push(occurrenceHref(row.id))
        }}
        pagination={{
          page,
          pageSize: PAGE_SIZE,
          total: data?.total ?? 0,
          totalPages: data?.totalPages ?? 0,
          onPageChange: setPage,
        }}
      />
    </div>
  )
}
