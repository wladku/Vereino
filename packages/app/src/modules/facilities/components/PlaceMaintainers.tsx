'use client'
// The "Maintainers" tab of `/backend/facilities/maintenance` (facilities spec B-27; REQ-022, DD-36; #128): who
// maintains which place. The club administrator (`facilities.manage`) adds a person to a place — the person then plans
// and completes the maintenance of that place and reads its calendar without names — and removes them after a
// confirmation. A place filter narrows the list; 409 `maintainer_exists` and 422 `maintainer_person_invalid` are shown
// at the person field; a 403 shows a permission-denied state.
import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { CrudFieldOption } from '@open-mercato/ui/backend/CrudForm'
import { DataTable } from '@open-mercato/ui/backend/DataTable'
import { RowActions } from '@open-mercato/ui/backend/RowActions'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useConfirmDialog } from '@open-mercato/ui/backend/confirm-dialog'
import { ErrorMessage } from '@open-mercato/ui/backend/detail'
import { LookupSelect, type LookupSelectItem } from '@open-mercato/ui/backend/inputs'
import { createCrud, deleteCrud, fetchCrudList } from '@open-mercato/ui/backend/utils/crud'
import { Button } from '@open-mercato/ui/primitives/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@open-mercato/ui/primitives/dialog'
import { Label } from '@open-mercato/ui/primitives/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { useOrganizationScopeVersion } from '@open-mercato/shared/lib/frontend/useOrganizationScope'
import { errorCodeOf } from '@vereino/core'
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
  MAINTAINERS_API,
  MAINTAINERS_KEY,
  MAINTENANCE_KEY,
  OWN_FORBIDDEN,
  fieldOfError,
  type PlaceMaintainerRow,
} from './maintenance-client'
import { searchPersons } from './rentals-client'

const PAGE_SIZE = 50

function buildColumns(t: Translate): TableColumns<PlaceMaintainerRow> {
  const empty = t('facilities.common.empty')
  return [
    {
      id: 'person',
      header: t('facilities.maintenance.maintainers.columns.person'),
      enableSorting: false,
      meta: { priority: 1 },
      cell: ({ row }) => <span className="font-medium">{row.original.personName ?? empty}</span>,
    },
    {
      id: 'place',
      header: t('facilities.fields.place'),
      enableSorting: false,
      meta: { priority: 1 },
      cell: ({ row }) => row.original.placeName ?? t('facilities.common.unknownPlace'),
    },
    {
      id: 'assignedAt',
      header: t('facilities.maintenance.maintainers.columns.assignedAt'),
      enableSorting: false,
      meta: { priority: 3 },
      cell: ({ row }) => <span className="tabular-nums">{instantLabel(row.original.assignedAt) || empty}</span>,
    },
  ]
}

function statusOf(error: unknown): number | null {
  const status = (error as { status?: unknown } | null)?.status
  return typeof status === 'number' ? status : null
}

function AddMaintainerDialog({
  places,
  onOpenChange,
  onSaved,
}: {
  places: CrudFieldOption[]
  onOpenChange: (open: boolean) => void
  onSaved: () => Promise<void>
}) {
  const t = useT()
  const ids = React.useId()
  const [placeId, setPlaceId] = React.useState(places.length === 1 ? (places[0]?.value ?? '') : '')
  const [personId, setPersonId] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)
  const [problems, setProblems] = React.useState<Partial<Record<'placeId' | 'personId', string>>>({})
  const [problem, setProblem] = React.useState<string | null>(null)

  const fetchPersons = React.useCallback(async (query: string): Promise<LookupSelectItem[]> => {
    const result = await searchPersons(query)
    return result.items
  }, [])

  const submit = async () => {
    if (pending) return
    const next: Partial<Record<'placeId' | 'personId', string>> = {}
    if (!placeId) next.placeId = t('facilities.records.bans.errors.place')
    if (!personId) next.personId = t('facilities.maintenance.maintainers.errors.person')
    setProblems(next)
    if (Object.keys(next).length > 0) {
      setProblem(t('facilities.errors.invalid'))
      return
    }
    setPending(true)
    setProblem(null)
    try {
      await createCrud(MAINTAINERS_API, { placeId, personId }, { headers: OWN_FORBIDDEN })
      flash(t('facilities.maintenance.maintainers.flash.added'), 'success')
      onOpenChange(false)
      await onSaved()
    } catch (error: unknown) {
      const message = codedMessage(error, t)
      const field = fieldOfError(error, errorCodeOf(error))
      if (message && (field === 'personId' || field === 'placeId')) setProblems({ [field]: message })
      setProblem(message ?? errorMessage(error, t('facilities.maintenance.maintainers.errors.save')))
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent
        closeAriaLabel={t('facilities.common.close')}
        data-testid="facilities-maintainer-dialog"
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            void submit()
          }
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('facilities.maintenance.maintainers.add.title')}</DialogTitle>
          <DialogDescription>{t('facilities.maintenance.maintainers.add.help')}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${ids}-place`}>{t('facilities.fields.place')}</Label>
            <Select value={placeId} disabled={pending} onValueChange={setPlaceId}>
              <SelectTrigger
                id={`${ids}-place`}
                data-testid="facilities-maintainer-place"
                aria-invalid={problems.placeId ? true : undefined}
                aria-describedby={problems.placeId ? `${ids}-placeId-problem` : undefined}
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
            {problems.placeId ? (
              <p id={`${ids}-placeId-problem`} className="text-destructive text-xs" role="alert">
                {problems.placeId}
              </p>
            ) : null}
          </div>
          <div className="flex flex-col gap-1" data-testid="facilities-maintainer-person">
            <Label>{t('facilities.maintenance.maintainers.columns.person')}</Label>
            <LookupSelect
              value={personId}
              onChange={(next: string | null) => {
                setPersonId(next)
                setProblems((current) => ({ ...current, personId: undefined }))
              }}
              fetchItems={fetchPersons}
              minQuery={0}
              placeholder={t('facilities.maintenance.maintainers.person.placeholder')}
              searchPlaceholder={t('facilities.rentals.renter.search')}
              emptyLabel={t('facilities.rentals.renter.empty')}
              loadingLabel={t('facilities.common.loading')}
              clearLabel={t('facilities.rentals.renter.clear')}
              selectLabel={t('facilities.rentals.renter.select')}
              selectedLabel={t('facilities.rentals.renter.selected')}
              disabled={pending}
            />
            {problems.personId ? (
              <p className="text-destructive text-xs" role="alert">
                {problems.personId}
              </p>
            ) : null}
          </div>
          {problem ? (
            <p className="text-destructive text-sm" role="alert" data-testid="facilities-maintainer-problem">
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
            data-testid="facilities-maintainer-save"
            onClick={() => {
              void submit()
            }}
          >
            {pending ? t('facilities.common.saving') : t('facilities.maintenance.maintainers.add.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function PlaceMaintainers() {
  const t = useT()
  const queryClient = useQueryClient()
  const scopeVersion = useOrganizationScopeVersion()
  const places = usePlaceOptions()
  const { confirm, ConfirmDialogElement } = useConfirmDialog()
  const [placeId, setPlaceId] = React.useState(ALL_PLACES)
  const [page, setPage] = React.useState(1)
  const [adding, setAdding] = React.useState(0)
  const selectedPlace = placeId === ALL_PLACES ? null : placeId

  const { data, isLoading, error } = useQuery({
    queryKey: [MAINTAINERS_KEY, 'list', selectedPlace, page, scopeVersion],
    queryFn: () =>
      fetchCrudList<PlaceMaintainerRow>(
        MAINTAINERS_API,
        {
          page,
          pageSize: PAGE_SIZE,
          sortField: 'createdAt',
          sortDir: 'desc',
          ...(selectedPlace ? { placeId: selectedPlace } : {}),
        },
        { headers: OWN_FORBIDDEN },
      ),
  })

  const refresh = React.useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: [MAINTAINERS_KEY] })
    // A maintainer's places change what the tasks tab offers.
    await queryClient.invalidateQueries({ queryKey: [MAINTENANCE_KEY] })
  }, [queryClient])

  const remove = async (row: PlaceMaintainerRow) => {
    const confirmed = await confirm({
      title: t('facilities.maintenance.maintainers.remove.title'),
      text: t('facilities.maintenance.maintainers.remove.text', {
        person: row.personName ?? t('facilities.common.empty'),
        place: row.placeName ?? t('facilities.common.unknownPlace'),
      }),
      confirmText: t('facilities.maintenance.maintainers.remove.confirm'),
      cancelText: t('facilities.common.cancel'),
      variant: 'destructive',
    })
    if (!confirmed) return
    try {
      await deleteCrud(MAINTAINERS_API, row.id, {
        headers: OWN_FORBIDDEN,
        errorMessage: t('facilities.maintenance.maintainers.errors.remove'),
      })
      flash(t('facilities.maintenance.maintainers.flash.removed'), 'success')
    } catch (err: unknown) {
      flash(codedMessage(err, t) ?? errorMessage(err, t('facilities.maintenance.maintainers.errors.remove')), 'error')
    }
    await refresh()
  }

  const columns = React.useMemo(() => buildColumns(t), [t])

  if (error && statusOf(error) === 403) {
    return <ErrorMessage label={t('facilities.maintenance.maintainers.errors.denied')} className="max-w-prose" />
  }

  const addAction = (
    <Button
      type="button"
      data-testid="facilities-maintainers-add"
      onClick={() => {
        setAdding((current) => current + 1)
      }}
    >
      {t('facilities.maintenance.maintainers.actions.add')}
    </Button>
  )
  const empty = !isLoading && !error && (data?.items.length ?? 0) === 0

  return (
    <div className="flex flex-col gap-6">
      <p className="text-muted-foreground text-sm">{t('facilities.maintenance.maintainers.description')}</p>
      <PlaceSelect
        options={places.options}
        value={placeId}
        allowAll
        onChange={(next) => {
          setPlaceId(next)
          setPage(1)
        }}
        testId="facilities-maintainers-place"
      />
      {empty ? (
        <ListEmptyState
          title={t('facilities.maintenance.maintainers.title')}
          message={t('facilities.maintenance.maintainers.empty')}
          actions={addAction}
          testId="facilities-maintainers-empty"
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
        <div className="relative max-w-full min-w-0 overflow-x-auto" data-testid="facilities-maintainers-table">
          <DataTable<PlaceMaintainerRow>
            title={t('facilities.maintenance.maintainers.title')}
            titleHeadingLevel={1}
            entityId="facilities:place_maintainer"
            extensionTableId="facilities.place_maintainers"
            actions={addAction}
            columns={columns}
            data={data?.items ?? []}
            isLoading={isLoading}
            error={error ? errorMessage(error, t('facilities.maintenance.maintainers.errors.load')) : null}
            rowActions={(row: PlaceMaintainerRow) => (
              <span data-testid={`facilities-maintainer-actions-${row.id}`}>
                <RowActions
                  items={[
                    {
                      id: 'remove',
                      label: t('facilities.maintenance.maintainers.actions.remove'),
                      destructive: true,
                      onSelect: () => {
                        void remove(row)
                      },
                    },
                  ]}
                />
              </span>
            )}
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
      {adding > 0 ? (
        <AddMaintainerDialog
          key={adding}
          places={places.options}
          onOpenChange={(open) => {
            if (!open) setAdding(0)
          }}
          onSaved={refresh}
        />
      ) : null}
      {ConfirmDialogElement}
    </div>
  )
}
