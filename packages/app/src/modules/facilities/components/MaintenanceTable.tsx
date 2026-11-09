'use client'
// `/backend/facilities/maintenance` — the maintenance of the club's places (facilities spec B-27 maintenance tab;
// REQ-022, DD-36; #128). Two tabs. "Tasks": a place and a status filter (planned by default) and per row the place,
// the kind of work, the schedule (its window, its due date and recurrence, or "every N h of use" with the hours
// counted so far), the status and who planned it; "Plan maintenance" opens the task dialog, a planned task offers
// "Edit", "Mark done" (the date, the cost and notes; a recurring task gets its next instance) and "Cancel" (after a
// confirmation). Every change sends the task's version as the lock token; a 409 surfaces through the conflict UI.
// "Maintainers" (only with `facilities.manage`): who maintains which place — "Add maintainer" (a place and a person)
// and "Remove". Everything else needs `facilities.maintenance.manage`; a maintainer sees the places assigned to them.
import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { RowActions } from '@open-mercato/ui/backend/RowActions'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useConfirmDialog } from '@open-mercato/ui/backend/confirm-dialog'
import { surfaceRecordConflict } from '@open-mercato/ui/backend/conflicts'
import { fetchCrudList } from '@open-mercato/ui/backend/utils/crud'
import { Button } from '@open-mercato/ui/primitives/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@open-mercato/ui/primitives/dialog'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@open-mercato/ui/primitives/tabs'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { useOrganizationScopeVersion } from '@open-mercato/shared/lib/frontend/useOrganizationScope'
import { MAINTENANCE_STATUSES } from '../lib/maintenance'
import { ALL_PLACES, ListEmptyState, PlaceSelect } from './FacilitiesControls'
import { MaintenanceTaskDialog } from './MaintenanceTaskDialog'
import { PlaceMaintainers } from './PlaceMaintainers'
import {
  amountToMinor,
  codedMessage,
  errorMessage,
  instantLabel,
  minorToAmount,
  useFacilitiesManage,
  type TableColumns,
  type Translate,
} from './facilities-client'
import {
  MAINTENANCE_API,
  MAINTENANCE_KEY,
  completeMaintenanceTask,
  flashFlagged,
  kindLabel,
  scheduleLabel,
  statusVariant,
  updateMaintenanceTask,
  useMaintenancePlaces,
  type MaintenanceTaskRow,
} from './maintenance-client'
import { instantOfLocal, localDateTimeValue } from './records-client'

const PAGE_SIZE = 50
const NOTES_MAX_LENGTH = 2000

export const MAINTENANCE_TABS = ['tasks', 'maintainers'] as const
export type MaintenanceTab = (typeof MAINTENANCE_TABS)[number]

/** The value of "every status" (a Radix select item cannot have an empty value). */
const ALL_STATUSES = 'all'

function buildColumns(t: Translate, locale: string): TableColumns<MaintenanceTaskRow> {
  const empty = t('facilities.common.empty')
  return [
    {
      id: 'place',
      header: t('facilities.fields.place'),
      enableSorting: false,
      meta: { priority: 2 },
      cell: ({ row }) => row.original.placeName ?? t('facilities.common.unknownPlace'),
    },
    {
      id: 'kind',
      header: t('facilities.maintenance.columns.kind'),
      enableSorting: false,
      meta: { priority: 1 },
      cell: ({ row }) => (
        <span className="flex flex-col">
          <span className="font-medium">{kindLabel(t, row.original.kind)}</span>
          <span className="text-muted-foreground text-xs">
            {t(`facilities.maintenance.responsible.${row.original.responsible === 'owner' ? 'owner' : 'club'}`)}
          </span>
        </span>
      ),
    },
    {
      id: 'schedule',
      header: t('facilities.maintenance.columns.schedule'),
      enableSorting: false,
      meta: { priority: 1 },
      cell: ({ row }) => <span className="tabular-nums">{scheduleLabel(t, locale, row.original)}</span>,
    },
    {
      id: 'status',
      header: t('facilities.maintenance.columns.status'),
      enableSorting: false,
      meta: { priority: 2 },
      cell: ({ row }) => (
        <span className="flex flex-col gap-1">
          <StatusBadge variant={statusVariant(row.original.status)}>
            {t(`facilities.maintenance.status.${row.original.status}`)}
          </StatusBadge>
          {row.original.status === 'done' && row.original.doneAt ? (
            <span className="text-muted-foreground text-xs tabular-nums">
              {row.original.doneByName
                ? t('facilities.maintenance.doneBy', {
                    date: instantLabel(row.original.doneAt),
                    name: row.original.doneByName,
                  })
                : instantLabel(row.original.doneAt)}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      id: 'plannedBy',
      header: t('facilities.maintenance.columns.plannedBy'),
      enableSorting: false,
      meta: { priority: 4 },
      cell: ({ row }) => row.original.plannedByName ?? empty,
    },
    {
      id: 'cost',
      header: t('facilities.maintenance.columns.cost'),
      enableSorting: false,
      meta: { priority: 5 },
      cell: ({ row }) => (row.original.cost !== null ? minorToAmount(row.original.cost) : empty),
    },
    {
      id: 'notes',
      header: t('facilities.maintenance.fields.notes'),
      enableSorting: false,
      meta: { priority: 5, truncate: true, maxWidth: '16rem' },
      cell: ({ row }) => row.original.notes ?? '',
    },
  ]
}

/** "Mark done": when it was done (default now), the cost and notes. */
function CompleteDialog({
  task,
  onOpenChange,
  onDone,
  onRefresh,
}: {
  task: MaintenanceTaskRow
  onOpenChange: (open: boolean) => void
  onDone: (nextTaskId: string | null) => Promise<void>
  onRefresh: () => void
}) {
  const t = useT()
  const ids = React.useId()
  const [doneAt, setDoneAt] = React.useState(localDateTimeValue(new Date().toISOString()))
  const [cost, setCost] = React.useState(task.cost !== null ? minorToAmount(task.cost) : '')
  const [notes, setNotes] = React.useState(task.notes ?? '')
  const [pending, setPending] = React.useState(false)
  const [problems, setProblems] = React.useState<Partial<Record<'doneAt' | 'cost', string>>>({})
  const [problem, setProblem] = React.useState<string | null>(null)

  const submit = async () => {
    if (pending) return
    const at = instantOfLocal(doneAt)
    const minor = cost.trim() ? amountToMinor(cost) : null
    const next: Partial<Record<'doneAt' | 'cost', string>> = {}
    if (!at) next.doneAt = t('facilities.maintenance.errors.required')
    if (cost.trim() && minor === null) next.cost = t('facilities.maintenance.errors.cost')
    setProblems(next)
    if (Object.keys(next).length > 0 || !at) {
      setProblem(t('facilities.errors.invalid'))
      return
    }
    setPending(true)
    setProblem(null)
    try {
      const call = await completeMaintenanceTask(
        task,
        { doneAt: at, cost: minor, notes: notes.trim() ? notes.trim() : null },
        t('facilities.maintenance.errors.complete'),
      )
      onOpenChange(false)
      await onDone(call.result?.nextTaskId ?? null)
    } catch (error: unknown) {
      if (surfaceRecordConflict(error, t, { onRefresh })) {
        onOpenChange(false)
        return
      }
      setProblem(codedMessage(error, t) ?? errorMessage(error, t('facilities.maintenance.errors.complete')))
    } finally {
      setPending(false)
    }
  }

  const fieldProblem = (field: 'doneAt' | 'cost') =>
    problems[field] ? (
      <p id={`${ids}-${field}-problem`} className="text-destructive text-xs" role="alert">
        {problems[field]}
      </p>
    ) : null

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent
        closeAriaLabel={t('facilities.common.close')}
        data-testid="facilities-maintenance-complete-dialog"
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            void submit()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('facilities.maintenance.complete.title')}</DialogTitle>
          <DialogDescription>
            {t('facilities.maintenance.complete.help', {
              kind: kindLabel(t, task.kind),
              place: task.placeName ?? t('facilities.common.unknownPlace'),
            })}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${ids}-done`}>{t('facilities.maintenance.fields.doneAt')}</Label>
            <Input
              id={`${ids}-done`}
              type="datetime-local"
              className="min-h-11 sm:w-64"
              required
              value={doneAt}
              disabled={pending}
              data-testid="facilities-maintenance-complete-done-at"
              aria-invalid={problems.doneAt ? true : undefined}
              aria-describedby={problems.doneAt ? `${ids}-doneAt-problem` : undefined}
              onChange={(event) => {
                setDoneAt(event.target.value)
              }}
            />
            {fieldProblem('doneAt')}
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${ids}-cost`}>{t('facilities.maintenance.fields.cost')}</Label>
            <Input
              id={`${ids}-cost`}
              inputMode="decimal"
              className="min-h-11 sm:w-40"
              value={cost}
              disabled={pending}
              data-testid="facilities-maintenance-complete-cost"
              aria-invalid={problems.cost ? true : undefined}
              aria-describedby={problems.cost ? `${ids}-cost-problem` : undefined}
              onChange={(event) => {
                setCost(event.target.value)
              }}
            />
            {fieldProblem('cost')}
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${ids}-notes`}>{t('facilities.maintenance.fields.notes')}</Label>
            <Textarea
              id={`${ids}-notes`}
              rows={3}
              maxLength={NOTES_MAX_LENGTH}
              value={notes}
              disabled={pending}
              data-testid="facilities-maintenance-complete-notes"
              onChange={(event) => {
                setNotes(event.target.value)
              }}
            />
          </div>
          {problem ? (
            <p className="text-destructive text-sm" role="alert" data-testid="facilities-maintenance-complete-problem">
              {problem}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            disabled={pending}
            onClick={() => {
              onOpenChange(false)
            }}
          >
            {t('facilities.common.cancel')}
          </Button>
          <Button
            type="button"
            className="min-h-11"
            disabled={pending}
            data-testid="facilities-maintenance-complete-save"
            onClick={() => {
              void submit()
            }}
          >
            {pending ? t('facilities.common.saving') : t('facilities.maintenance.complete.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function TasksList() {
  const t = useT()
  const locale = useLocale()
  const queryClient = useQueryClient()
  const scopeVersion = useOrganizationScopeVersion()
  const places = useMaintenancePlaces()
  const { confirm, ConfirmDialogElement } = useConfirmDialog()
  const [placeId, setPlaceId] = React.useState(ALL_PLACES)
  const [status, setStatus] = React.useState<string>('planned')
  const [page, setPage] = React.useState(1)
  const [dialog, setDialog] = React.useState<{ key: number; task: MaintenanceTaskRow | null } | null>(null)
  const [completing, setCompleting] = React.useState<MaintenanceTaskRow | null>(null)
  const statusId = React.useId()
  const selectedPlace = placeId === ALL_PLACES ? null : placeId
  const selectedStatus = status === ALL_STATUSES ? null : status
  const placeOptions = places.data?.options ?? []

  const { data, isLoading, error } = useQuery({
    queryKey: [MAINTENANCE_KEY, 'list', selectedPlace, selectedStatus, page, scopeVersion],
    queryFn: () =>
      fetchCrudList<MaintenanceTaskRow>(
        MAINTENANCE_API,
        {
          page,
          pageSize: PAGE_SIZE,
          sortField: 'createdAt',
          sortDir: 'desc',
          ...(selectedStatus ? { status: selectedStatus } : {}),
          ...(selectedPlace ? { placeId: selectedPlace } : {}),
        },
        { headers: { 'x-om-forbidden-redirect': '0' } },
      ),
  })

  const refresh = React.useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: [MAINTENANCE_KEY] })
  }, [queryClient])

  const cancelTask = async (row: MaintenanceTaskRow) => {
    const confirmed = await confirm({
      title: t('facilities.maintenance.cancel.title'),
      text: t('facilities.maintenance.cancel.text', {
        kind: kindLabel(t, row.kind),
        place: row.placeName ?? t('facilities.common.unknownPlace'),
      }),
      confirmText: t('facilities.maintenance.cancel.confirm'),
      cancelText: t('facilities.maintenance.cancel.keep'),
      variant: 'destructive',
    })
    if (!confirmed) return
    try {
      await updateMaintenanceTask(row, { status: 'cancelled' })
      flash(t('facilities.maintenance.flash.cancelled'), 'success')
    } catch (err: unknown) {
      if (!surfaceRecordConflict(err, t, { onRefresh: () => void refresh() })) {
        flash(codedMessage(err, t) ?? errorMessage(err, t('facilities.maintenance.errors.save')), 'error')
      }
    }
    await refresh()
  }

  const columns = React.useMemo(() => buildColumns(t, locale), [t, locale])
  const canPlan = places.data?.canPlan === true && placeOptions.length > 0
  const createAction = canPlan ? (
    <Button
      type="button"
      data-testid="facilities-maintenance-create"
      onClick={() => {
        setDialog((current) => ({ key: (current?.key ?? 0) + 1, task: null }))
      }}
    >
      {t('facilities.maintenance.actions.plan')}
    </Button>
  ) : null
  const filtered = Boolean(selectedPlace) || status !== 'planned'
  const empty = !isLoading && !error && (data?.items.length ?? 0) === 0

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <PlaceSelect
          options={placeOptions}
          value={placeId}
          allowAll
          onChange={(next) => {
            setPlaceId(next)
            setPage(1)
          }}
          testId="facilities-maintenance-place"
        />
        <div className="flex flex-col gap-1 sm:w-56">
          <Label htmlFor={statusId}>{t('facilities.maintenance.columns.status')}</Label>
          <Select
            value={status}
            onValueChange={(next: string) => {
              setStatus(next)
              setPage(1)
            }}
          >
            <SelectTrigger id={statusId} data-testid="facilities-maintenance-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_STATUSES}>{t('facilities.maintenance.status.all')}</SelectItem>
              {MAINTENANCE_STATUSES.map((entry) => (
                <SelectItem key={entry} value={entry}>
                  {t(`facilities.maintenance.status.${entry}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {empty ? (
        <ListEmptyState
          title={t('facilities.maintenance.title')}
          message={t(filtered ? 'facilities.maintenance.empty.filtered' : 'facilities.maintenance.empty.planned')}
          actions={createAction}
          testId="facilities-maintenance-empty"
          onClearFilters={
            filtered
              ? () => {
                  setPlaceId(ALL_PLACES)
                  setStatus('planned')
                  setPage(1)
                }
              : undefined
          }
        />
      ) : (
        <div className="relative max-w-full min-w-0 overflow-x-auto" data-testid="facilities-maintenance-table">
          <DataTable<MaintenanceTaskRow>
            title={t('facilities.maintenance.title')}
            titleHeadingLevel={1}
            entityId="facilities:maintenance_task"
            extensionTableId="facilities.maintenance_tasks"
            actions={createAction}
            columns={columns}
            data={data?.items ?? []}
            isLoading={isLoading}
            error={error ? errorMessage(error, t('facilities.maintenance.errors.load')) : null}
            rowActions={(row: MaintenanceTaskRow) =>
              row.status !== 'planned' ? null : (
                <span data-testid={`facilities-maintenance-actions-${row.id}`}>
                  <RowActions
                    items={[
                      {
                        id: 'edit',
                        label: t('facilities.common.edit'),
                        onSelect: () => {
                          setDialog((current) => ({ key: (current?.key ?? 0) + 1, task: row }))
                        },
                      },
                      {
                        id: 'complete',
                        label: t('facilities.maintenance.actions.complete'),
                        onSelect: () => {
                          setCompleting(row)
                        },
                      },
                      {
                        id: 'cancel',
                        label: t('facilities.maintenance.actions.cancel'),
                        destructive: true,
                        onSelect: () => {
                          void cancelTask(row)
                        },
                      },
                    ]}
                  />
                </span>
              )
            }
            pagination={{
              page,
              pageSize: PAGE_SIZE,
              total: data?.total ?? 0,
              totalPages: data?.totalPages ?? 0,
              onPageChange: setPage,
            }}
          />
        </div>
      )}
      {dialog ? (
        <MaintenanceTaskDialog
          key={dialog.key}
          open
          onOpenChange={(open) => {
            if (!open) setDialog(null)
          }}
          places={placeOptions}
          task={dialog.task}
          toInstant={instantOfLocal}
          toLocal={localDateTimeValue}
          onRefresh={() => void refresh()}
          onSaved={async (result) => {
            flashFlagged(
              t,
              result,
              dialog.task ? t('facilities.maintenance.flash.saved') : t('facilities.maintenance.flash.planned'),
            )
            await refresh()
          }}
        />
      ) : null}
      {completing ? (
        <CompleteDialog
          key={completing.id}
          task={completing}
          onOpenChange={(open) => {
            if (!open) setCompleting(null)
          }}
          onRefresh={() => void refresh()}
          onDone={async (nextTaskId) => {
            flash(
              nextTaskId ? t('facilities.maintenance.flash.doneNext') : t('facilities.maintenance.flash.done'),
              'success',
            )
            await refresh()
          }}
        />
      ) : null}
      {ConfirmDialogElement}
    </div>
  )
}

export function MaintenanceTable() {
  const t = useT()
  const manage = useFacilitiesManage()
  const [tab, setTab] = React.useState<MaintenanceTab>('tasks')
  const tabs = manage ? MAINTENANCE_TABS : (['tasks'] as const)

  return (
    <>
      <p className="text-muted-foreground mb-4 text-sm">{t('facilities.maintenance.description')}</p>
      <Tabs
        value={tab}
        onValueChange={(value: string) => {
          setTab(MAINTENANCE_TABS.find((entry) => entry === value) ?? 'tasks')
        }}
      >
        {/* The platform tabs primitives drop `data-testid`; the wrapper carries it, and tests pick a tab by role. */}
        <div className="overflow-x-auto" data-testid="facilities-maintenance-tabs">
          <TabsList aria-label={t('facilities.maintenance.tabs.label')}>
            {tabs.map((value) => (
              <TabsTrigger key={value} value={value}>
                {t(`facilities.maintenance.tabs.${value}`)}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <TabsContent value="tasks" className="pt-4">
          {tab === 'tasks' ? <TasksList /> : null}
        </TabsContent>
        {manage ? (
          <TabsContent value="maintainers" className="pt-4">
            {tab === 'maintainers' ? <PlaceMaintainers /> : null}
          </TabsContent>
        ) : null}
      </Tabs>
    </>
  )
}
