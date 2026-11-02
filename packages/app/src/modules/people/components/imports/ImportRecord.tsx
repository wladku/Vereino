'use client'
// `/backend/people/imports/[id]` (club spec UI table, REQ-036, DD-38; #28): one import — its status and counts, every
// staged row with its classification (New / Matched / Review / Error, the problem's column but never its value), the
// review queue where the administrator matches a row without an identifier to an existing person, creates it or
// skips it, and the commit (disabled, with the reason, while a row waits for a decision) or the cancellation. Each
// row's group shows what becomes of it (#65): before the commit whether the name resolves to one group, after it the
// membership created, already existing or waiting with its reason; a committed import with waiting rows offers
// "Create memberships", which re-runs the commit for those rows only. Every write sends the record's lock token; a
// conflict is surfaced with the shared banner.
import * as React from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { AccessDeniedMessage, ErrorMessage, LoadingMessage, RecordNotFoundState } from '@open-mercato/ui/backend/detail'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useConfirmDialog } from '@open-mercato/ui/backend/confirm-dialog'
import { surfaceRecordConflict } from '@open-mercato/ui/backend/conflicts'
import { apiCall, apiCallOrThrow, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { Alert, AlertDescription } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import { SegmentedControl, SegmentedControlItem } from '@open-mercato/ui/primitives/segmented-control'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { OWN_FORBIDDEN_STATE, errorMessage, type TableColumns, type Translate } from '../client-helpers'
import { MatchPersonDialog } from './MatchPersonDialog'
import {
  CLASSIFICATIONS,
  CLASSIFICATION_VARIANTS,
  IMPORTS_HREF,
  STATUS_VARIANTS,
  codeOf,
  instantLabel,
  membershipState,
  rowProblem,
  valuesName,
  type ImportDecisionAction,
  type ImportRow,
  type ImportRowRow,
  type Paged,
} from './import-client'

const PAGE_SIZE = 50
type Filter = 'all' | 'pending' | ImportRowRow['classification']
type ImportLoad = { status: 'ok'; record: ImportRow } | { status: 'not_found' } | { status: 'denied' }
/** The record actions; "create memberships" re-runs the commit of a committed import (#65). */
type RecordAction = 'commit' | 'cancel' | 'createMemberships'
const ACTION_PATHS: Record<RecordAction, 'commit' | 'cancel'> = {
  commit: 'commit',
  cancel: 'cancel',
  createMemberships: 'commit',
}
const ACTION_FLASHES: Record<RecordAction, string> = {
  commit: 'people.imports.flash.committed',
  cancel: 'people.imports.flash.cancelled',
  createMemberships: 'people.imports.flash.membershipsCreated',
}

function SummaryTiles({ record, t }: { record: ImportRow; t: Translate }) {
  const keys =
    record.status === 'committed'
      ? ([
          'created',
          'updated',
          'linked',
          'skipped',
          'membershipsCreated',
          'membershipsExisting',
          'membershipsPending',
        ] as const)
      : (['new', 'matched', 'review', 'error'] as const)
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" data-testid="people-import-summary">
      {keys.map((key) => (
        <div
          key={key}
          className="flex flex-col gap-1 rounded-lg border p-3"
          data-testid={`people-import-summary-${key}`}
        >
          <dt className="text-muted-foreground text-sm">{t(`people.imports.summary.${key}`)}</dt>
          <dd className="text-2xl font-semibold">{record.summary[key] ?? 0}</dd>
        </div>
      ))}
    </dl>
  )
}

function decisionLabel(t: Translate, row: ImportRowRow): string {
  if (!row.decision) return row.needsDecision ? t('people.imports.rows.decisionNeeded') : t('people.common.empty')
  if (row.decision === 'match') {
    return t('people.imports.decisions.matchedTo', { name: row.decisionPerson?.name ?? t('people.common.empty') })
  }
  return t(`people.imports.decisions.${row.decision}`)
}

export function ImportRecord({ id }: { id: string }) {
  const t = useT()
  const { confirm, ConfirmDialogElement } = useConfirmDialog()
  const [filter, setFilter] = React.useState<Filter>('all')
  const [page, setPage] = React.useState(1)
  const [busy, setBusy] = React.useState(false)
  const [matching, setMatching] = React.useState<ImportRowRow | null>(null)

  const recordQuery = useQuery({
    queryKey: ['people-import', id],
    queryFn: async (): Promise<ImportLoad> => {
      const call = await apiCall<ImportRow>(`/api/people/imports/${encodeURIComponent(id)}`, OWN_FORBIDDEN_STATE)
      if (call.status === 404) return { status: 'not_found' }
      if (call.status === 403) return { status: 'denied' }
      if (!call.ok || !call.result) throw new Error(t('people.imports.errors.loadOne'))
      return { status: 'ok', record: call.result }
    },
  })
  const rowsQuery = useQuery({
    queryKey: ['people-import-rows', id, filter, page],
    enabled: recordQuery.data?.status === 'ok',
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) })
      if (filter === 'pending') params.set('pending', 'true')
      else if (filter !== 'all') params.set('classification', filter)
      const call = await apiCall<Paged<ImportRowRow>>(`/api/people/imports/${encodeURIComponent(id)}/rows?${params}`)
      if (!call.ok || !call.result) throw new Error(t('people.imports.errors.loadRows'))
      return call.result
    },
  })
  const refresh = React.useCallback(async () => {
    await Promise.all([recordQuery.refetch(), rowsQuery.refetch()])
  }, [recordQuery, rowsQuery])

  const record = recordQuery.data?.status === 'ok' ? recordQuery.data.record : null
  const open = record?.status === 'previewed'

  const decide = React.useCallback(
    async (row: ImportRowRow, action: ImportDecisionAction, personId?: string) => {
      setBusy(true)
      try {
        await withScopedApiRequestHeaders(buildOptimisticLockHeader(row.updatedAt), () =>
          apiCallOrThrow(
            `/api/people/imports/${encodeURIComponent(id)}/rows/${encodeURIComponent(row.id)}`,
            {
              method: 'PUT',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(personId ? { action, personId } : { action }),
            },
            { errorMessage: t('people.imports.errors.decide') },
          ),
        )
        flash(t('people.imports.flash.decided', { row: row.rowNo }), 'success')
      } catch (error: unknown) {
        if (!surfaceRecordConflict(error, t, { onRefresh: () => void refresh() })) {
          flash(errorMessage(error, t('people.imports.errors.decide')), 'error')
        }
      } finally {
        setBusy(false)
        await refresh()
      }
    },
    [id, refresh, t],
  )

  const columns = React.useMemo<TableColumns<ImportRowRow>>(
    () => [
      {
        id: 'rowNo',
        header: t('people.imports.rows.columns.rowNo'),
        enableSorting: false,
        meta: { priority: 1 },
        cell: ({ row }) => row.original.rowNo,
      },
      {
        id: 'classification',
        header: t('people.imports.rows.columns.classification'),
        enableSorting: false,
        meta: { priority: 1 },
        cell: ({ row }) => (
          <span data-testid={`people-import-row-${String(row.original.rowNo)}-classification`}>
            <StatusBadge variant={CLASSIFICATION_VARIANTS[row.original.classification]}>
              {t(`people.imports.classifications.${row.original.classification}`)}
            </StatusBadge>
          </span>
        ),
      },
      {
        id: 'participant',
        header: t('people.imports.rows.columns.participant'),
        enableSorting: false,
        meta: { priority: 1 },
        cell: ({ row }) => {
          const participant = row.original.values?.persons.participant
          const name = valuesName(participant) || t('people.common.empty')
          // After the commit the name links to the person's record; it also gives a committed table, which has no
          // decision buttons, something to focus in its scroll region at 375 px (axe `scrollable-region-focusable`).
          return (
            <span className="flex flex-col">
              {row.original.participantPersonId ? (
                <Link
                  href={`/backend/people/persons/${row.original.participantPersonId}`}
                  className="underline underline-offset-2"
                  data-testid="people-import-row-person"
                >
                  {name}
                </Link>
              ) : (
                <span>{name}</span>
              )}
              {participant?.birthDate ? (
                <span className="text-muted-foreground text-xs">{participant.birthDate}</span>
              ) : null}
            </span>
          )
        },
      },
      {
        id: 'guardians',
        header: t('people.imports.rows.columns.guardians'),
        enableSorting: false,
        meta: { priority: 3 },
        cell: ({ row }) => {
          const persons = row.original.values?.persons
          const names = [valuesName(persons?.guardian1), valuesName(persons?.guardian2)].filter(Boolean)
          return names.length > 0 ? names.join(', ') : t('people.common.empty')
        },
      },
      {
        id: 'group',
        header: t('people.imports.rows.columns.group'),
        enableSorting: false,
        meta: { priority: 4 },
        cell: ({ row }) => {
          const group = row.original.values?.group ?? row.original.groupName
          if (!group) return t('people.common.empty')
          const state = membershipState(row.original)
          return (
            <span className="flex flex-col items-start gap-1">
              <span className="break-words">{group}</span>
              {state ? (
                <span data-testid={`people-import-row-${String(row.original.rowNo)}-membership`}>
                  <StatusBadge variant={state.variant}>{t(`people.imports.membership.${state.key}`)}</StatusBadge>
                </span>
              ) : null}
            </span>
          )
        },
      },
      {
        id: 'problem',
        header: t('people.imports.rows.columns.problem'),
        enableSorting: false,
        meta: { priority: 2 },
        cell: ({ row }) => rowProblem(t, row.original) ?? t('people.common.empty'),
      },
      {
        id: 'decision',
        header: t('people.imports.rows.columns.decision'),
        enableSorting: false,
        meta: { priority: 2 },
        cell: ({ row }) => {
          const item = row.original
          const canDecide = open && item.classification !== 'error'
          return (
            <div className="flex flex-col gap-2" data-testid={`people-import-row-${String(item.rowNo)}-decision`}>
              <span className="text-sm">{decisionLabel(t, item)}</span>
              {canDecide ? (
                <div className="flex flex-wrap gap-2">
                  {item.classification === 'review' ? (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy}
                        data-testid={`people-import-row-${String(item.rowNo)}-match`}
                        onClick={() => {
                          setMatching(item)
                        }}
                      >
                        {t('people.imports.actions.match')}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={busy || item.decision === 'create'}
                        data-testid={`people-import-row-${String(item.rowNo)}-create`}
                        onClick={() => void decide(item, 'create')}
                      >
                        {t('people.imports.actions.create')}
                      </Button>
                    </>
                  ) : null}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy || item.decision === 'skip'}
                    data-testid={`people-import-row-${String(item.rowNo)}-skip`}
                    onClick={() => void decide(item, 'skip')}
                  >
                    {t('people.imports.actions.skip')}
                  </Button>
                </div>
              ) : null}
            </div>
          )
        },
      },
    ],
    [busy, decide, open, t],
  )

  if (recordQuery.isLoading) return <LoadingMessage label={t('people.imports.loading')} />
  if (recordQuery.error && !recordQuery.isFetching) return <ErrorMessage label={t('people.imports.errors.loadOne')} />
  const load = recordQuery.data
  if (!load || load.status === 'not_found') {
    return (
      <RecordNotFoundState
        label={t('people.imports.errors.notFound')}
        backHref={IMPORTS_HREF}
        backLabel={t('people.imports.actions.back')}
      />
    )
  }
  if (load.status === 'denied') return <AccessDeniedMessage label={t('people.imports.errors.denied')} />
  const current = load.record

  const runAction = async (action: RecordAction) => {
    const confirmed = await confirm({
      title: t(`people.imports.confirm.${action}.title`),
      text: t(`people.imports.confirm.${action}.text`),
      variant: action === 'cancel' ? 'destructive' : 'default',
      confirmText: t(`people.imports.actions.${action}`),
      cancelText: t('people.imports.confirm.back'),
    })
    if (!confirmed) return
    setBusy(true)
    try {
      await withScopedApiRequestHeaders(buildOptimisticLockHeader(current.updatedAt), () =>
        apiCallOrThrow(
          `/api/people/imports/${encodeURIComponent(current.id)}/${ACTION_PATHS[action]}`,
          { method: 'POST' },
          { errorMessage: t(`people.imports.errors.${action}`) },
        ),
      )
      flash(t(ACTION_FLASHES[action]), 'success')
    } catch (error: unknown) {
      if (!surfaceRecordConflict(error, t, { onRefresh: () => void refresh() })) {
        const code = codeOf(error)
        flash(code ? t(`people.errors.${code}`) : errorMessage(error, t(`people.imports.errors.${action}`)), 'error')
      }
    } finally {
      setBusy(false)
      await refresh()
    }
  }

  const rows = rowsQuery.data
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-2xl font-semibold break-words">
            {t('people.imports.record.title', { at: instantLabel(current.createdAt) })}
          </h1>
          <span className="text-muted-foreground text-sm break-words">
            {t('people.imports.record.meta', {
              format: current.fileFormat.toUpperCase(),
              rows: current.rowCount,
              name: current.createdBy.name ?? t('people.common.empty'),
            })}
          </span>
          <span data-testid="people-import-status">
            <StatusBadge variant={STATUS_VARIANTS[current.status]}>
              {t(`people.imports.status.${current.status}`)}
            </StatusBadge>
          </span>
        </div>
        {open ? (
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={busy || current.pendingDecisions > 0}
                data-testid="people-import-commit"
                onClick={() => void runAction('commit')}
              >
                {t('people.imports.actions.commit')}
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={busy}
                data-testid="people-import-cancel"
                onClick={() => void runAction('cancel')}
              >
                {t('people.imports.actions.cancel')}
              </Button>
            </div>
            {current.pendingDecisions > 0 ? (
              <p className="text-muted-foreground text-sm" data-testid="people-import-pending">
                {t('people.imports.record.pending', { count: current.pendingDecisions })}
              </p>
            ) : null}
          </div>
        ) : null}
        {current.status === 'committed' && (current.summary.membershipsPending ?? 0) > 0 ? (
          <div className="flex flex-col items-start gap-2 sm:items-end">
            {current.canCreateMemberships ? (
              <Button
                type="button"
                disabled={busy}
                data-testid="people-import-create-memberships"
                onClick={() => void runAction('createMemberships')}
              >
                {t('people.imports.actions.createMemberships')}
              </Button>
            ) : null}
            <p className="text-muted-foreground text-sm" data-testid="people-import-memberships-waiting">
              {t('people.imports.record.membershipsWaiting', { count: current.summary.membershipsPending ?? 0 })}
            </p>
          </div>
        ) : null}
      </header>
      {current.status === 'committed' ? (
        <Alert status="success">
          <AlertDescription>
            {t('people.imports.record.committed', {
              name: current.committedBy?.name ?? t('people.common.empty'),
              at: instantLabel(current.committedAt),
            })}
          </AlertDescription>
        </Alert>
      ) : null}
      {current.status === 'cancelled' ? (
        <Alert status="information">
          <AlertDescription>
            {t('people.imports.record.cancelled', { at: instantLabel(current.cancelledAt) })}
          </AlertDescription>
        </Alert>
      ) : null}
      {current.purgedAt ? (
        <Alert status="information">
          <AlertDescription>
            {t('people.imports.record.purged', { at: instantLabel(current.purgedAt) })}
          </AlertDescription>
        </Alert>
      ) : null}
      <SummaryTiles record={current} t={t} />
      <SegmentedControl
        aria-label={t('people.imports.rows.filter')}
        value={filter}
        className="max-w-full overflow-x-auto"
        onValueChange={(value) => {
          setFilter(value as Filter)
          setPage(1)
        }}
      >
        {(['all', 'pending', ...CLASSIFICATIONS] as const).map((value) => (
          <SegmentedControlItem key={value} value={value} data-testid={`people-import-filter-${value}`}>
            {t(`people.imports.filters.${value}`)}
          </SegmentedControlItem>
        ))}
      </SegmentedControl>
      <DataTable<ImportRowRow>
        title={t('people.imports.rows.title')}
        titleHeadingLevel={2}
        entityId="people:person_import_row"
        extensionTableId="people.import_rows"
        columns={columns}
        data={rows?.items ?? []}
        isLoading={rowsQuery.isLoading || (!rows && rowsQuery.isFetching)}
        error={rowsQuery.error && !rowsQuery.isFetching ? t('people.imports.errors.loadRows') : null}
        emptyState={<p className="text-muted-foreground text-sm">{t('people.imports.rows.empty')}</p>}
        pagination={{
          page,
          pageSize: PAGE_SIZE,
          total: rows?.total ?? 0,
          totalPages: rows?.totalPages ?? 0,
          onPageChange: setPage,
        }}
      />
      {matching ? (
        <MatchPersonDialog
          row={matching}
          onClose={() => {
            setMatching(null)
          }}
          onChoose={async (personId) => {
            const row = matching
            setMatching(null)
            await decide(row, 'match', personId)
          }}
        />
      ) : null}
      {ConfirmDialogElement}
    </div>
  )
}
