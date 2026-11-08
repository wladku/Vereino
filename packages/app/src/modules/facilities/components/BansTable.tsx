'use client'
// `/backend/facilities/bans` — the entry bans of the club's places (facilities spec B-27, *Data Models* →
// `facilities_entry_bans`; REQ-016; E08-S06 #126): the tabs Active (the default) / Revoked / All, a place selector,
// and per row the place, the banned institution or person, the period (open-ended = permanent), the reason, the
// incident it follows, who issued it and when it was revoked. "New ban" opens the ban dialog (place, subject chosen
// from the club's institutions or persons, from, to or permanent, reason, optional incident of that place); an active
// ban is ended by "Revoke" after a confirmation (its version travels as the lock token; a ban revoked meanwhile
// answers 409 `entry_ban_revoked`). A ban is never deleted. Everything here needs `facilities.incidents.manage`.
import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { CrudFieldOption } from '@open-mercato/ui/backend/CrudForm'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { RowActions } from '@open-mercato/ui/backend/RowActions'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useConfirmDialog } from '@open-mercato/ui/backend/confirm-dialog'
import { surfaceRecordConflict } from '@open-mercato/ui/backend/conflicts'
import { LookupSelect, type LookupSelectItem } from '@open-mercato/ui/backend/inputs'
import { apiCallOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
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
import { SegmentedControl, SegmentedControlItem } from '@open-mercato/ui/primitives/segmented-control'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@open-mercato/ui/primitives/tabs'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { useOrganizationScopeVersion } from '@open-mercato/shared/lib/frontend/useOrganizationScope'
import { errorCodeOf } from '@vereino/core'
import { ENTRY_BAN_SUBJECT_TYPES } from '../lib/rentals'
import { ALL_PLACES, ListEmptyState, PlaceSelect } from './FacilitiesControls'
import {
  codedMessage,
  errorMessage,
  instantLabel,
  localToday,
  usePlaceOptions,
  type TableColumns,
  type Translate,
} from './facilities-client'
import {
  BANS_KEY,
  ENTRY_BANS_API,
  ENTRY_BANS_URL,
  INCIDENTS_API,
  OWN_FORBIDDEN,
  revokeBan,
  type BanRow,
  type IncidentRow,
} from './records-client'
import { searchInstitutions, searchPersons } from './rentals-client'

const PAGE_SIZE = 50
const REASON_MAX_LENGTH = 2000

export const BAN_LIST_TABS = ['active', 'revoked', 'all'] as const
export type BanListTab = (typeof BAN_LIST_TABS)[number]

type SubjectType = (typeof ENTRY_BAN_SUBJECT_TYPES)[number]

/** The value of "no incident" (a Radix select item cannot have an empty value). */
const NO_INCIDENT = 'none'

function periodLabel(t: Translate, row: Pick<BanRow, 'startsOn' | 'endsOn'>): string {
  const from = row.startsOn ?? t('facilities.common.empty')
  return row.endsOn
    ? t('facilities.records.bans.period.range', { from, to: row.endsOn })
    : t('facilities.records.bans.period.permanent', { from })
}

function buildColumns(t: Translate): TableColumns<BanRow> {
  const empty = t('facilities.common.empty')
  return [
    {
      id: 'subject',
      header: t('facilities.records.bans.columns.subject'),
      enableSorting: false,
      meta: { priority: 1 },
      cell: ({ row }) => (
        <span className="flex flex-col">
          <span className="font-medium">{row.original.subjectName ?? empty}</span>
          <span className="text-muted-foreground text-xs">
            {row.original.subjectType ? t(`facilities.records.bans.subjectType.${row.original.subjectType}`) : empty}
          </span>
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
      id: 'period',
      header: t('facilities.records.bans.columns.period'),
      enableSorting: false,
      meta: { priority: 1 },
      cell: ({ row }) => <span className="whitespace-nowrap tabular-nums">{periodLabel(t, row.original)}</span>,
    },
    {
      id: 'reason',
      header: t('facilities.records.bans.fields.reason'),
      enableSorting: false,
      meta: { priority: 3, truncate: true, maxWidth: '20rem' },
      cell: ({ row }) => row.original.reason ?? '',
    },
    {
      id: 'incident',
      header: t('facilities.records.bans.fields.incident'),
      enableSorting: false,
      meta: { priority: 5 },
      cell: ({ row }) => (row.original.incidentId ? t('facilities.records.bans.incidentLinked') : empty),
    },
    {
      id: 'issuedBy',
      header: t('facilities.records.bans.columns.issuedBy'),
      enableSorting: false,
      meta: { priority: 4 },
      cell: ({ row }) => row.original.issuedByName ?? empty,
    },
    {
      id: 'state',
      header: t('facilities.records.bans.columns.state'),
      enableSorting: false,
      meta: { priority: 2 },
      cell: ({ row }) =>
        row.original.revokedAt ? (
          <span className="flex flex-col">
            <StatusBadge variant="neutral">{t('facilities.records.bans.state.revoked')}</StatusBadge>
            <span className="text-muted-foreground text-xs tabular-nums">{instantLabel(row.original.revokedAt)}</span>
          </span>
        ) : (
          <StatusBadge variant="error">{t('facilities.records.bans.state.active')}</StatusBadge>
        ),
    },
  ]
}

/** The recent incidents of a place, offered as the incident a ban follows. */
function usePlaceIncidents(placeId: string) {
  const t = useT()
  return useQuery({
    queryKey: ['facilities-ban-incidents', placeId],
    enabled: Boolean(placeId),
    queryFn: async (): Promise<CrudFieldOption[]> => {
      const data = await fetchCrudList<IncidentRow>(INCIDENTS_API, {
        placeId,
        pageSize: 50,
        sortField: 'occurredAt',
        sortDir: 'desc',
      })
      return data.items.map((item) => ({
        value: item.id,
        label: `${instantLabel(item.occurredAt)} · ${item.kind ? t(`facilities.records.incidentKind.${item.kind}`) : ''}`,
      }))
    },
  })
}

type BanField = 'place' | 'subject' | 'startsOn' | 'endsOn' | 'reason'

const FIELD_OF_CODE: Partial<Record<string, BanField>> = {
  entry_ban_period_invalid: 'endsOn',
  facilities_reference_invalid: 'subject',
}

function BanDialog({
  open,
  onOpenChange,
  places,
  onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  places: CrudFieldOption[]
  onSaved: () => Promise<void>
}) {
  const t = useT()
  const ids = React.useId()
  const [placeId, setPlaceId] = React.useState(places.length === 1 ? (places[0]?.value ?? '') : '')
  const [subjectType, setSubjectType] = React.useState<SubjectType>('institution')
  const [subjectId, setSubjectId] = React.useState<string | null>(null)
  const [startsOn, setStartsOn] = React.useState(localToday())
  const [endsOn, setEndsOn] = React.useState('')
  const [reason, setReason] = React.useState('')
  const [incidentId, setIncidentId] = React.useState(NO_INCIDENT)
  const [pending, setPending] = React.useState(false)
  const [problems, setProblems] = React.useState<Partial<Record<BanField, string>>>({})
  const [problem, setProblem] = React.useState<string | null>(null)
  const incidents = usePlaceIncidents(placeId)

  const fetchSubjects = React.useCallback(
    async (query: string): Promise<LookupSelectItem[]> => {
      const result = subjectType === 'person' ? await searchPersons(query) : await searchInstitutions(query)
      return result.items
    },
    [subjectType],
  )

  const validate = (): boolean => {
    const next: Partial<Record<BanField, string>> = {}
    if (!placeId) next.place = t('facilities.records.bans.errors.place')
    if (!subjectId) next.subject = t('facilities.records.bans.errors.subject')
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startsOn)) next.startsOn = t('facilities.records.bans.errors.startsOn')
    if (endsOn && endsOn < startsOn) next.endsOn = t('facilities.errors.entry_ban_period_invalid')
    if (!reason.trim()) next.reason = t('facilities.records.bans.errors.reason')
    setProblems(next)
    setProblem(Object.keys(next).length > 0 ? t('facilities.errors.invalid') : null)
    return Object.keys(next).length === 0
  }

  const submit = async () => {
    if (pending || !validate()) return
    setPending(true)
    try {
      await apiCallOrThrow(
        ENTRY_BANS_URL,
        {
          method: 'POST',
          headers: { ...OWN_FORBIDDEN, 'content-type': 'application/json' },
          body: JSON.stringify({
            placeId,
            subjectType,
            subjectId,
            startsOn,
            endsOn: endsOn || null,
            reason: reason.trim(),
            incidentId: incidentId === NO_INCIDENT ? null : incidentId,
          }),
        },
        { errorMessage: t('facilities.records.bans.errors.save') },
      )
      flash(t('facilities.records.bans.flash.created'), 'success')
      onOpenChange(false)
      await onSaved()
    } catch (error: unknown) {
      const message = codedMessage(error, t)
      const field = FIELD_OF_CODE[errorCodeOf(error) ?? '']
      if (message && field) setProblems({ [field]: message })
      setProblem(message ?? errorMessage(error, t('facilities.records.bans.errors.save')))
    } finally {
      setPending(false)
    }
  }

  const fieldProblem = (field: BanField) =>
    problems[field] ? (
      <p id={`${ids}-${field}-problem`} className="text-destructive text-xs" role="alert">
        {problems[field]}
      </p>
    ) : null
  const describedBy = (field: BanField) => (problems[field] ? `${ids}-${field}-problem` : undefined)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="lg"
        closeAriaLabel={t('facilities.common.close')}
        data-testid="facilities-ban-dialog"
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            void submit()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('facilities.records.bans.create.title')}</DialogTitle>
          <DialogDescription>{t('facilities.records.bans.create.help')}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${ids}-place`}>{t('facilities.fields.place')}</Label>
            <Select
              value={placeId}
              disabled={pending}
              onValueChange={(next: string) => {
                setPlaceId(next)
                setIncidentId(NO_INCIDENT)
              }}
            >
              <SelectTrigger
                id={`${ids}-place`}
                data-testid="facilities-ban-place"
                aria-invalid={problems.place ? true : undefined}
                aria-describedby={describedBy('place')}
              >
                <SelectValue placeholder={t('facilities.fields.place.choose')} />
              </SelectTrigger>
              <SelectContent>
                {places.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-muted-foreground text-xs">{t('facilities.records.bans.fields.place.help')}</p>
            {fieldProblem('place')}
          </div>

          <div className="flex flex-col gap-2">
            <span id={`${ids}-subject-type`} className="text-sm font-medium">
              {t('facilities.records.bans.fields.subjectType')}
            </span>
            <SegmentedControl
              value={subjectType}
              onValueChange={(next: string) => {
                setSubjectType(ENTRY_BAN_SUBJECT_TYPES.find((entry) => entry === next) ?? 'institution')
                setSubjectId(null)
              }}
              aria-labelledby={`${ids}-subject-type`}
              data-testid="facilities-ban-subject-type"
            >
              {ENTRY_BAN_SUBJECT_TYPES.map((type) => (
                <SegmentedControlItem key={type} value={type}>
                  {t(`facilities.records.bans.subjectType.${type}`)}
                </SegmentedControlItem>
              ))}
            </SegmentedControl>
            <div className="flex flex-col gap-1" data-testid="facilities-ban-subject">
              <Label>{t(`facilities.records.bans.subjectType.${subjectType}`)}</Label>
              <LookupSelect
                key={subjectType}
                value={subjectId}
                onChange={(next: string | null) => {
                  setSubjectId(next)
                  setProblems((current) => ({ ...current, subject: undefined }))
                }}
                fetchItems={fetchSubjects}
                minQuery={0}
                placeholder={t('facilities.rentals.renter.placeholder')}
                searchPlaceholder={t('facilities.rentals.renter.search')}
                emptyLabel={t('facilities.rentals.renter.empty')}
                loadingLabel={t('facilities.common.loading')}
                clearLabel={t('facilities.rentals.renter.clear')}
                selectLabel={t('facilities.rentals.renter.select')}
                selectedLabel={t('facilities.rentals.renter.selected')}
                disabled={pending}
              />
            </div>
            {fieldProblem('subject')}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${ids}-from`}>{t('facilities.fields.from')}</Label>
              <Input
                id={`${ids}-from`}
                type="date"
                required
                value={startsOn}
                disabled={pending}
                data-testid="facilities-ban-from"
                aria-invalid={problems.startsOn ? true : undefined}
                aria-describedby={describedBy('startsOn')}
                onChange={(event) => {
                  setStartsOn(event.target.value)
                }}
              />
              {fieldProblem('startsOn')}
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${ids}-to`}>{t('facilities.fields.to')}</Label>
              <Input
                id={`${ids}-to`}
                type="date"
                value={endsOn}
                disabled={pending}
                data-testid="facilities-ban-to"
                aria-invalid={problems.endsOn ? true : undefined}
                aria-describedby={`${ids}-to-help${problems.endsOn ? ` ${ids}-endsOn-problem` : ''}`}
                onChange={(event) => {
                  setEndsOn(event.target.value)
                }}
              />
              <p id={`${ids}-to-help`} className="text-muted-foreground text-xs">
                {t('facilities.records.bans.fields.to.help')}
              </p>
              {fieldProblem('endsOn')}
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor={`${ids}-reason`}>{t('facilities.records.bans.fields.reason')}</Label>
            <Textarea
              id={`${ids}-reason`}
              rows={3}
              required
              maxLength={REASON_MAX_LENGTH}
              value={reason}
              disabled={pending}
              data-testid="facilities-ban-reason"
              aria-invalid={problems.reason ? true : undefined}
              aria-describedby={describedBy('reason')}
              onChange={(event) => {
                setReason(event.target.value)
              }}
            />
            {fieldProblem('reason')}
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor={`${ids}-incident`}>{t('facilities.records.bans.fields.incident')}</Label>
            <Select value={incidentId} disabled={pending || !placeId} onValueChange={setIncidentId}>
              <SelectTrigger id={`${ids}-incident`} data-testid="facilities-ban-incident">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_INCIDENT}>{t('facilities.records.bans.noIncident')}</SelectItem>
                {(incidents.data ?? []).map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {problem ? (
            <p className="text-destructive text-sm" role="alert" data-testid="facilities-ban-problem">
              {problem}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => {
              onOpenChange(false)
            }}
          >
            {t('facilities.common.cancel')}
          </Button>
          <Button
            type="button"
            disabled={pending}
            data-testid="facilities-ban-save"
            onClick={() => {
              void submit()
            }}
          >
            {pending ? t('facilities.common.saving') : t('facilities.records.bans.create.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function BansList({ tab, onCreate }: { tab: BanListTab; onCreate: () => void }) {
  const t = useT()
  const queryClient = useQueryClient()
  const scopeVersion = useOrganizationScopeVersion()
  const places = usePlaceOptions()
  const { confirm, ConfirmDialogElement } = useConfirmDialog()
  const [placeId, setPlaceId] = React.useState(ALL_PLACES)
  const [page, setPage] = React.useState(1)
  const selectedPlace = placeId === ALL_PLACES ? null : placeId

  const { data, isLoading, error } = useQuery({
    queryKey: [BANS_KEY, 'list', tab, selectedPlace, page, scopeVersion],
    queryFn: () =>
      fetchCrudList<BanRow>(ENTRY_BANS_API, {
        page,
        pageSize: PAGE_SIZE,
        sortField: 'startsOn',
        sortDir: 'desc',
        ...(tab === 'all' ? {} : { state: tab }),
        ...(selectedPlace ? { placeId: selectedPlace } : {}),
      }),
  })

  const refresh = React.useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: [BANS_KEY] })
  }, [queryClient])

  const revoke = async (row: BanRow) => {
    const confirmed = await confirm({
      title: t('facilities.records.bans.revoke.title'),
      text: t('facilities.records.bans.revoke.text', {
        subject: row.subjectName ?? t('facilities.common.empty'),
        place: row.placeName ?? t('facilities.common.unknownPlace'),
      }),
      confirmText: t('facilities.records.bans.revoke.confirm'),
      cancelText: t('facilities.common.cancel'),
      variant: 'destructive',
    })
    if (!confirmed) return
    try {
      await revokeBan(row, t('facilities.records.bans.errors.revoke'))
      flash(t('facilities.records.bans.flash.revoked'), 'success')
    } catch (err: unknown) {
      if (!surfaceRecordConflict(err, t, { onRefresh: () => void refresh() })) {
        flash(codedMessage(err, t) ?? errorMessage(err, t('facilities.records.bans.errors.revoke')), 'error')
      }
    }
    await refresh()
  }

  const columns = React.useMemo(() => buildColumns(t), [t])
  const createAction = (
    <Button type="button" data-testid="facilities-bans-create" onClick={onCreate}>
      {t('facilities.records.bans.actions.create')}
    </Button>
  )
  const empty = !isLoading && !error && (data?.items.length ?? 0) === 0

  return (
    <div className="flex flex-col gap-6">
      <PlaceSelect
        options={places.options}
        value={placeId}
        allowAll
        onChange={(next) => {
          setPlaceId(next)
          setPage(1)
        }}
        testId={`facilities-bans-place-${tab}`}
      />
      {empty ? (
        <ListEmptyState
          title={t('facilities.records.bans.title')}
          message={t(`facilities.records.bans.empty.${tab}`)}
          actions={createAction}
          testId={`facilities-bans-empty-${tab}`}
          onClearFilters={
            selectedPlace
              ? () => {
                  setPlaceId(ALL_PLACES)
                  setPage(1)
                }
              : undefined
          }
        />
      ) : (
        <div className="relative max-w-full min-w-0 overflow-x-auto" data-testid="facilities-bans-table">
          <DataTable<BanRow>
            title={t('facilities.records.bans.title')}
            titleHeadingLevel={1}
            entityId="facilities:entry_ban"
            extensionTableId="facilities.entry_bans"
            actions={createAction}
            columns={columns}
            data={data?.items ?? []}
            isLoading={isLoading}
            error={error ? errorMessage(error, t('facilities.records.bans.errors.load')) : null}
            rowActions={(row: BanRow) =>
              row.revokedAt ? null : (
                <span data-testid={`facilities-ban-actions-${row.id}`}>
                  <RowActions
                    items={[
                      {
                        id: 'revoke',
                        label: t('facilities.records.bans.actions.revoke'),
                        destructive: true,
                        onSelect: () => {
                          void revoke(row)
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
      {ConfirmDialogElement}
    </div>
  )
}

export function BansTable() {
  const t = useT()
  const queryClient = useQueryClient()
  const places = usePlaceOptions()
  const [tab, setTab] = React.useState<BanListTab>('active')
  const [createOpen, setCreateOpen] = React.useState(false)
  // A new key per opening starts the dialog fresh.
  const [createKey, setCreateKey] = React.useState(0)

  return (
    <>
      <p className="text-muted-foreground mb-4 text-sm">{t('facilities.records.bans.description')}</p>
      <Tabs
        value={tab}
        onValueChange={(value: string) => {
          setTab(BAN_LIST_TABS.find((entry) => entry === value) ?? 'active')
        }}
      >
        {/* The platform tabs primitives drop `data-testid`; the wrapper carries it, and tests pick a tab by role. */}
        <div className="overflow-x-auto" data-testid="facilities-bans-tabs">
          <TabsList aria-label={t('facilities.records.bans.tabs.label')}>
            {BAN_LIST_TABS.map((value) => (
              <TabsTrigger key={value} value={value}>
                {t(`facilities.records.bans.tabs.${value}`)}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        <TabsContent value={tab} className="pt-4">
          <BansList
            key={tab}
            tab={tab}
            onCreate={() => {
              setCreateKey((current) => current + 1)
              setCreateOpen(true)
            }}
          />
        </TabsContent>
      </Tabs>
      {createOpen ? (
        <BanDialog
          key={createKey}
          open
          onOpenChange={setCreateOpen}
          places={places.options}
          onSaved={async () => {
            await queryClient.invalidateQueries({ queryKey: [BANS_KEY] })
          }}
        />
      ) : null}
    </>
  )
}
