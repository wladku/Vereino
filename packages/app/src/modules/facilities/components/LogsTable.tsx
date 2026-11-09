'use client'
// `/backend/facilities/logs` — the daily facility log (facilities spec B-27; REQ-016; E08-S06 #126): one row per place
// and day with the operator, the opening and closing times, the conditions before and after, the groups present and
// the remarks; a place selector and a date filter. "Edit" opens a dialog for the times, conditions and remarks; after
// the end of the following day only the club administrator may change a log (403 `log_edit_closed`, shown in the
// dialog). A log is never deleted. Everything here needs `facilities.log.write`.
import * as React from 'react'
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
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { useOrganizationScopeVersion } from '@open-mercato/shared/lib/frontend/useOrganizationScope'
import { LOG_TEXT_MAX_LENGTH } from '../lib/logs'
import { ALL_PLACES, ListEmptyState, PlaceSelect } from './FacilitiesControls'
import {
  codedMessage,
  errorMessage,
  textOrNull,
  usePlaceOptions,
  type TableColumns,
  type Translate,
} from './facilities-client'
import {
  LOGS_API,
  LOGS_KEY,
  instantOfLocal,
  localDateTimeValue,
  timeLabel,
  updateLogRecord,
  type LogRow,
} from './records-client'

const PAGE_SIZE = 50

function buildColumns(t: Translate): TableColumns<LogRow> {
  const empty = t('facilities.common.empty')
  return [
    {
      id: 'logDate',
      header: t('facilities.records.logs.columns.date'),
      enableSorting: false,
      meta: { priority: 1 },
      cell: ({ row }) => (
        <span className="font-medium whitespace-nowrap tabular-nums">{row.original.logDate ?? empty}</span>
      ),
    },
    {
      id: 'place',
      header: t('facilities.fields.place'),
      enableSorting: false,
      meta: { priority: 1 },
      cell: ({ row }) => row.original.placeName ?? t('facilities.common.unknownPlace'),
    },
    {
      id: 'operator',
      header: t('facilities.records.logs.columns.operator'),
      enableSorting: false,
      meta: { priority: 3 },
      cell: ({ row }) => row.original.operatorName ?? empty,
    },
    {
      id: 'opened',
      header: t('facilities.records.logs.columns.opened'),
      enableSorting: false,
      meta: { priority: 2 },
      cell: ({ row }) => <span className="tabular-nums">{timeLabel(row.original.openedAt) || empty}</span>,
    },
    {
      id: 'closed',
      header: t('facilities.records.logs.columns.closed'),
      enableSorting: false,
      meta: { priority: 2 },
      cell: ({ row }) => <span className="tabular-nums">{timeLabel(row.original.closedAt) || empty}</span>,
    },
    {
      id: 'conditions',
      header: t('facilities.records.logs.columns.conditions'),
      enableSorting: false,
      meta: { priority: 4, truncate: true, maxWidth: '20rem' },
      cell: ({ row }) => (
        <span className="flex flex-col text-xs">
          <span>{t('facilities.records.logs.before', { text: row.original.conditionBefore ?? empty })}</span>
          <span>{t('facilities.records.logs.after', { text: row.original.conditionAfter ?? empty })}</span>
        </span>
      ),
    },
    {
      id: 'groups',
      header: t('facilities.records.logs.columns.groups'),
      enableSorting: false,
      meta: { priority: 3 },
      cell: ({ row }) => {
        const groups = row.original.groupsPresent
        const people = groups.reduce((sum, group) => sum + group.headcount, 0)
        return (
          <span className="tabular-nums">
            {t('facilities.records.logs.groupsCount', { count: groups.length, people })}
          </span>
        )
      },
    },
    {
      id: 'remarks',
      header: t('facilities.records.logs.columns.remarks'),
      enableSorting: false,
      meta: { priority: 5, truncate: true, maxWidth: '20rem' },
      cell: ({ row }) => row.original.remarks ?? '',
    },
  ]
}

function filterParams(values: FilterValues): Record<string, string> {
  const params: Record<string, string> = {}
  const range = values.dates as { from?: unknown; to?: unknown } | undefined
  if (typeof range?.from === 'string' && range.from) params.from = range.from
  if (typeof range?.to === 'string' && range.to) params.to = range.to
  return params
}

function LogEditDialog({
  row,
  open,
  onOpenChange,
  onDone,
}: {
  row: LogRow
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone: () => Promise<void>
}) {
  const t = useT()
  const ids = React.useId()
  const [openedAt, setOpenedAt] = React.useState(() => localDateTimeValue(row.openedAt))
  const [closedAt, setClosedAt] = React.useState(() => localDateTimeValue(row.closedAt))
  const [conditionBefore, setConditionBefore] = React.useState(row.conditionBefore ?? '')
  const [conditionAfter, setConditionAfter] = React.useState(row.conditionAfter ?? '')
  const [remarks, setRemarks] = React.useState(row.remarks ?? '')
  const [pending, setPending] = React.useState(false)
  const [problem, setProblem] = React.useState<string | null>(null)

  const close = () => {
    onOpenChange(false)
  }

  const submit = async () => {
    if (pending) return
    setPending(true)
    setProblem(null)
    try {
      await updateLogRecord(row, {
        openedAt: instantOfLocal(openedAt),
        closedAt: instantOfLocal(closedAt),
        conditionBefore: textOrNull(conditionBefore),
        conditionAfter: textOrNull(conditionAfter),
        remarks: textOrNull(remarks),
      })
      flash(t('facilities.records.logs.flash.saved'), 'success')
      close()
      await onDone()
    } catch (error: unknown) {
      if (surfaceRecordConflict(error, t, { onRefresh: () => void onDone() })) {
        close()
        await onDone()
      } else {
        setProblem(codedMessage(error, t) ?? errorMessage(error, t('facilities.records.logs.errors.save')))
      }
    } finally {
      setPending(false)
    }
  }

  const text = (id: string, label: string, value: string, onChange: (value: string) => void, testId: string) => (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id}>{label}</Label>
      <Textarea
        id={id}
        rows={2}
        maxLength={LOG_TEXT_MAX_LENGTH}
        value={value}
        disabled={pending}
        data-testid={testId}
        onChange={(event) => {
          onChange(event.target.value)
        }}
      />
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="lg"
        closeAriaLabel={t('facilities.common.close')}
        data-testid="facilities-log-dialog"
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            void submit()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('facilities.records.logs.edit.title')}</DialogTitle>
          <DialogDescription>
            {t('facilities.records.logs.edit.help', {
              place: row.placeName ?? t('facilities.common.unknownPlace'),
              date: row.logDate ?? '',
            })}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${ids}-opened`}>{t('facilities.facility.fields.openedAt')}</Label>
              <Input
                id={`${ids}-opened`}
                type="datetime-local"
                value={openedAt}
                disabled={pending}
                data-testid="facilities-log-opened"
                onChange={(event) => {
                  setOpenedAt(event.target.value)
                }}
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${ids}-closed`}>{t('facilities.facility.fields.closedAt')}</Label>
              <Input
                id={`${ids}-closed`}
                type="datetime-local"
                value={closedAt}
                disabled={pending}
                data-testid="facilities-log-closed"
                onChange={(event) => {
                  setClosedAt(event.target.value)
                }}
              />
            </div>
          </div>
          {text(
            `${ids}-before`,
            t('facilities.facility.fields.conditionBefore'),
            conditionBefore,
            setConditionBefore,
            'facilities-log-condition-before',
          )}
          {text(
            `${ids}-after`,
            t('facilities.facility.fields.conditionAfter'),
            conditionAfter,
            setConditionAfter,
            'facilities-log-condition-after',
          )}
          {text(
            `${ids}-remarks`,
            t('facilities.facility.fields.remarks'),
            remarks,
            setRemarks,
            'facilities-log-remarks',
          )}
          {problem ? (
            <p className="text-destructive text-sm" role="alert" data-testid="facilities-log-problem">
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
            data-testid="facilities-log-save"
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

export function LogsTable() {
  const t = useT()
  const queryClient = useQueryClient()
  const scopeVersion = useOrganizationScopeVersion()
  const places = usePlaceOptions()
  const [placeId, setPlaceId] = React.useState(ALL_PLACES)
  const [filters, setFilters] = React.useState<FilterValues>({})
  const [page, setPage] = React.useState(1)
  const [editing, setEditing] = React.useState<LogRow | null>(null)
  const selectedPlace = placeId === ALL_PLACES ? null : placeId

  const { data, isLoading, error } = useQuery({
    queryKey: [LOGS_KEY, selectedPlace, filters, page, scopeVersion],
    queryFn: () =>
      fetchCrudList<LogRow>(LOGS_API, {
        page,
        pageSize: PAGE_SIZE,
        sortField: 'logDate',
        sortDir: 'desc',
        ...(selectedPlace ? { placeId: selectedPlace } : {}),
        ...filterParams(filters),
      }),
  })

  const refresh = React.useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: [LOGS_KEY] })
  }, [queryClient])

  const columns = React.useMemo(() => buildColumns(t), [t])
  const filterDefs = React.useMemo<FilterDef[]>(
    () => [{ id: 'dates', label: t('facilities.records.logs.filters.dates'), type: 'dateRange' }],
    [t],
  )
  const filtered = Object.keys(filterParams(filters)).length > 0
  const empty = !isLoading && !error && (data?.items.length ?? 0) === 0

  return (
    <div className="flex flex-col gap-6">
      <p className="text-muted-foreground text-sm">{t('facilities.records.logs.description')}</p>
      <PlaceSelect
        options={places.options}
        value={placeId}
        allowAll
        onChange={(next) => {
          setPlaceId(next)
          setPage(1)
        }}
        testId="facilities-logs-place"
      />
      {empty ? (
        <ListEmptyState
          title={t('facilities.records.logs.title')}
          message={t('facilities.records.logs.empty')}
          testId="facilities-logs-empty"
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
        <div className="relative max-w-full min-w-0 overflow-x-auto" data-testid="facilities-logs-table">
          <DataTable<LogRow>
            title={t('facilities.records.logs.title')}
            titleHeadingLevel={1}
            entityId="facilities:facility_log"
            extensionTableId="facilities.logs"
            columns={columns}
            data={data?.items ?? []}
            isLoading={isLoading}
            error={error ? errorMessage(error, t('facilities.records.logs.errors.load')) : null}
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
            rowActions={(row: LogRow) => (
              <span data-testid={`facilities-log-actions-${row.id}`}>
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
            )}
            onRowClick={(row: LogRow) => {
              setEditing(row)
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
      )}
      {editing ? (
        <LogEditDialog
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
