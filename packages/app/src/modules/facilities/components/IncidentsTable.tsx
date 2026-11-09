'use client'
// `/backend/facilities/incidents` — the incidents at the club's places (facilities spec B-27, §6 of the regulations;
// REQ-016; E08-S06 #126): time, place, kind, reporter, description, the people involved, the actions taken and the
// linked case; a place selector and a kind filter. An incident is evidence and is never deleted: no row offers a
// delete. With `facilities.incidents.manage` "Edit" records further actions taken and links the communication case
// the incident is followed in (chosen from the club's cases, or given by its id when the cases cannot be listed).
import * as React from 'react'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import type { FilterDef, FilterValues } from '@open-mercato/ui/backend/FilterOverlay'
import { RowActions } from '@open-mercato/ui/backend/RowActions'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
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
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { useOrganizationScopeVersion } from '@open-mercato/shared/lib/frontend/useOrganizationScope'
import { INCIDENT_ACTIONS, INCIDENT_KINDS, type IncidentAction } from '../lib/incidents'
import { ActionChoices } from './club-facility/FacilityDialogs'
import { ALL_PLACES, ListEmptyState, PlaceSelect } from './FacilitiesControls'
import {
  codedMessage,
  errorMessage,
  instantLabel,
  usePlaceOptions,
  type TableColumns,
  type Translate,
} from './facilities-client'
import {
  INCIDENTS_API,
  INCIDENTS_KEY,
  caseHref,
  updateIncidentRecord,
  useCaseOptions,
  useIncidentsManage,
  type IncidentRow,
} from './records-client'

const PAGE_SIZE = 50

/** The value of "no case" (a Radix select item cannot have an empty value). */
const NO_CASE = 'none'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function kindLabel(t: Translate, kind: string | null): string {
  return kind ? t(`facilities.records.incidentKind.${kind}`) : t('facilities.common.empty')
}

function actionsLabel(t: Translate, actions: readonly string[]): string {
  const known = actions.filter((action) => action !== 'none')
  if (known.length === 0) return t('facilities.records.incidentAction.none')
  return known.map((action) => t(`facilities.records.incidentAction.${action}`)).join(', ')
}

function buildColumns(t: Translate): TableColumns<IncidentRow> {
  const empty = t('facilities.common.empty')
  return [
    {
      id: 'occurredAt',
      header: t('facilities.records.fields.occurredAt'),
      enableSorting: false,
      meta: { priority: 1 },
      cell: ({ row }) => (
        <span className="font-medium whitespace-nowrap tabular-nums">
          {instantLabel(row.original.occurredAt) || empty}
        </span>
      ),
    },
    {
      id: 'place',
      header: t('facilities.fields.place'),
      enableSorting: false,
      meta: { priority: 2 },
      cell: ({ row }) => row.original.placeName ?? t('facilities.common.unknownPlace'),
    },
    {
      id: 'kind',
      header: t('facilities.records.fields.kind'),
      enableSorting: false,
      meta: { priority: 1 },
      cell: ({ row }) => kindLabel(t, row.original.kind),
    },
    {
      id: 'reporter',
      header: t('facilities.records.incidents.columns.reporter'),
      enableSorting: false,
      meta: { priority: 3 },
      cell: ({ row }) => row.original.reportedByName ?? empty,
    },
    {
      id: 'description',
      header: t('facilities.records.fields.description'),
      enableSorting: false,
      meta: { priority: 2, truncate: true, maxWidth: '24rem' },
      cell: ({ row }) => (
        <span className="flex flex-col">
          <span>{row.original.description ?? ''}</span>
          {row.original.involved ? (
            <span className="text-muted-foreground text-xs">
              {t('facilities.records.incidents.involved', { text: row.original.involved })}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      id: 'actions',
      header: t('facilities.records.fields.actionTaken'),
      enableSorting: false,
      meta: { priority: 3, truncate: true, maxWidth: '16rem' },
      cell: ({ row }) => actionsLabel(t, row.original.actionTaken),
    },
    {
      id: 'case',
      header: t('facilities.records.incidents.columns.case'),
      enableSorting: false,
      meta: { priority: 4 },
      cell: ({ row }) =>
        row.original.threadId ? (
          <Link
            className="underline-offset-4 hover:underline"
            href={caseHref(row.original.threadId)}
            onClick={(event) => {
              event.stopPropagation()
            }}
          >
            {t('facilities.records.incidents.openCase')}
          </Link>
        ) : (
          empty
        ),
    },
  ]
}

function filterParams(values: FilterValues): Record<string, string> {
  const kind: unknown = values.kind
  return typeof kind === 'string' && kind ? { kind } : {}
}

function IncidentEditDialog({
  row,
  open,
  onOpenChange,
  onDone,
}: {
  row: IncidentRow
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone: () => Promise<void>
}) {
  const t = useT()
  const ids = React.useId()
  const cases = useCaseOptions(open)
  const [actions, setActions] = React.useState<IncidentAction[]>(() =>
    INCIDENT_ACTIONS.filter((action) => action !== 'none' && row.actionTaken.includes(action)),
  )
  const [threadId, setThreadId] = React.useState(row.threadId ?? '')
  const [pending, setPending] = React.useState(false)
  const [problem, setProblem] = React.useState<string | null>(null)
  const options = cases.data ?? null
  // The linked case stays choosable even when it is not among the listed ones.
  const caseOptions =
    options && row.threadId && !options.some((option) => option.value === row.threadId)
      ? [...options, { value: row.threadId, label: t('facilities.records.incidents.linkedCase') }]
      : options

  const close = () => {
    onOpenChange(false)
  }

  const submit = async () => {
    if (pending) return
    const thread = threadId.trim()
    if (thread && !UUID.test(thread)) {
      setProblem(t('facilities.records.incidents.errors.caseId'))
      return
    }
    setPending(true)
    setProblem(null)
    try {
      await updateIncidentRecord(row, { actionTaken: actions, threadId: thread || null })
      flash(t('facilities.records.incidents.flash.saved'), 'success')
      close()
      await onDone()
    } catch (error: unknown) {
      if (surfaceRecordConflict(error, t, { onRefresh: () => void onDone() })) {
        close()
        await onDone()
      } else {
        setProblem(codedMessage(error, t) ?? errorMessage(error, t('facilities.records.incidents.errors.save')))
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="lg"
        closeAriaLabel={t('facilities.common.close')}
        data-testid="facilities-incident-dialog"
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            void submit()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('facilities.records.incidents.edit.title')}</DialogTitle>
          <DialogDescription>{t('facilities.records.incidents.edit.help')}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
            <div className="flex flex-col">
              <dt className="text-muted-foreground">{t('facilities.records.fields.occurredAt')}</dt>
              <dd className="tabular-nums">{instantLabel(row.occurredAt)}</dd>
            </div>
            <div className="flex flex-col">
              <dt className="text-muted-foreground">{t('facilities.records.fields.kind')}</dt>
              <dd>{kindLabel(t, row.kind)}</dd>
            </div>
            <div className="flex flex-col sm:col-span-2">
              <dt className="text-muted-foreground">{t('facilities.records.fields.description')}</dt>
              <dd className="break-words whitespace-pre-wrap">{row.description ?? ''}</dd>
            </div>
          </dl>
          <ActionChoices
            idPrefix={`${ids}-action`}
            legend={t('facilities.records.fields.actionTaken')}
            value={actions}
            onChange={setActions}
            disabled={pending}
            testIdPrefix="facilities-incident-action"
          />
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${ids}-case`}>{t('facilities.records.incidents.columns.case')}</Label>
            {caseOptions ? (
              <Select
                value={threadId || NO_CASE}
                disabled={pending}
                onValueChange={(next: string) => {
                  setThreadId(next === NO_CASE ? '' : next)
                }}
              >
                <SelectTrigger id={`${ids}-case`} data-testid="facilities-incident-case">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CASE}>{t('facilities.records.incidents.noCase')}</SelectItem>
                  {caseOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                id={`${ids}-case`}
                value={threadId}
                disabled={pending || cases.isLoading}
                aria-describedby={`${ids}-case-help`}
                data-testid="facilities-incident-case-id"
                onChange={(event) => {
                  setThreadId(event.target.value)
                }}
              />
            )}
            <p id={`${ids}-case-help`} className="text-muted-foreground text-xs">
              {t('facilities.records.incidents.caseHelp')}
            </p>
          </div>
          {problem ? (
            <p className="text-destructive text-sm" role="alert" data-testid="facilities-incident-problem">
              {problem}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={pending} onClick={close}>
            {t('facilities.common.cancel')}
          </Button>
          <Button
            type="button"
            disabled={pending}
            data-testid="facilities-incident-save"
            onClick={() => {
              void submit()
            }}
          >
            {pending ? t('facilities.common.saving') : t('facilities.common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function IncidentsTable() {
  const t = useT()
  const queryClient = useQueryClient()
  const scopeVersion = useOrganizationScopeVersion()
  const manage = useIncidentsManage()
  const places = usePlaceOptions()
  const [placeId, setPlaceId] = React.useState(ALL_PLACES)
  const [filters, setFilters] = React.useState<FilterValues>({})
  const [page, setPage] = React.useState(1)
  const [editing, setEditing] = React.useState<IncidentRow | null>(null)
  const selectedPlace = placeId === ALL_PLACES ? null : placeId

  const { data, isLoading, error } = useQuery({
    queryKey: [INCIDENTS_KEY, selectedPlace, filters, page, scopeVersion],
    queryFn: () =>
      fetchCrudList<IncidentRow>(INCIDENTS_API, {
        page,
        pageSize: PAGE_SIZE,
        sortField: 'occurredAt',
        sortDir: 'desc',
        ...(selectedPlace ? { placeId: selectedPlace } : {}),
        ...filterParams(filters),
      }),
  })

  const refresh = React.useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: [INCIDENTS_KEY] })
  }, [queryClient])

  const columns = React.useMemo(() => buildColumns(t), [t])
  const filterDefs = React.useMemo<FilterDef[]>(
    () => [
      {
        id: 'kind',
        label: t('facilities.records.fields.kind'),
        type: 'select',
        options: INCIDENT_KINDS.map((kind) => ({ value: kind, label: kindLabel(t, kind) })),
      },
    ],
    [t],
  )
  const filtered = Object.keys(filterParams(filters)).length > 0
  const empty = !isLoading && !error && (data?.items.length ?? 0) === 0

  return (
    <div className="flex flex-col gap-6">
      <p className="text-muted-foreground text-sm">{t('facilities.records.incidents.description')}</p>
      <PlaceSelect
        options={places.options}
        value={placeId}
        allowAll
        onChange={(next) => {
          setPlaceId(next)
          setPage(1)
        }}
        testId="facilities-incidents-place"
      />
      {empty ? (
        <ListEmptyState
          title={t('facilities.records.incidents.title')}
          message={t('facilities.records.incidents.empty')}
          testId="facilities-incidents-empty"
          onClearFilters={
            filtered
              ? () => {
                  setFilters({})
                  setPage(1)
                }
              : undefined
          }
        />
      ) : (
        <div className="relative max-w-full min-w-0 overflow-x-auto" data-testid="facilities-incidents-table">
          <DataTable<IncidentRow>
            title={t('facilities.records.incidents.title')}
            titleHeadingLevel={1}
            entityId="facilities:incident"
            extensionTableId="facilities.incidents"
            columns={columns}
            data={data?.items ?? []}
            isLoading={isLoading}
            error={error ? errorMessage(error, t('facilities.records.incidents.errors.load')) : null}
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
            rowActions={(row: IncidentRow) =>
              manage ? (
                <span data-testid={`facilities-incident-actions-${row.id}`}>
                  <RowActions
                    items={[
                      {
                        id: 'edit',
                        label: t('facilities.common.edit'),
                        onSelect: () => {
                          setEditing(row)
                        },
                      },
                    ]}
                  />
                </span>
              ) : null
            }
            onRowClick={
              manage
                ? (row: IncidentRow) => {
                    setEditing(row)
                  }
                : undefined
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
      {editing ? (
        <IncidentEditDialog
          key={`${editing.id}:${editing.updatedAt ?? ''}`}
          row={editing}
          open
          onOpenChange={(open) => {
            if (!open) setEditing(null)
          }}
          onDone={refresh}
        />
      ) : null}
    </div>
  )
}
