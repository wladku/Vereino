'use client'
// The "Roles" tab of the person record (club spec UI table; DD-33): the person's staff role assignments in the
// caller's scope with the section or place name and the period; with `people.roles.manage` the club administrator
// assigns a role (a coordinator with the section picker, a facility attendant with the place picker, #126) with an
// optional end date, edits an assignment's period and scope ("Edit") and ends it on a chosen day ("End on…"; people
// life-cycle spec REQ-L12, #304) through the existing role-assignment routes. A second assignment of the same role and
// section (or place) in an overlapping period is refused by the server (409), an inverted period with 422.
import * as React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { LookupSelect, type LookupSelectItem } from '@open-mercato/ui/backend/inputs'
import { SectionHeader } from '@open-mercato/ui/backend/SectionHeader'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { apiCallOrThrow, readApiResultOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { errorMessage, periodLabel, periodStatus, type RoleAssignmentRow } from './client-helpers'
import {
  PickerEmptyHint,
  browserFocusTarget,
  pickerEmptyState,
  reloadOnFocusEffect,
  useClubToday,
  type PickerEmptyState,
} from '@vereino/ui'
import { useGrantedFeatures } from './useGrantedFeatures'
import { RoleAssignmentDialog, type RoleAssignmentDialogMode } from './RoleAssignmentDialog'

const ROLES = ['club_admin', 'coordinator', 'coach', 'facility_operator'] as const

type SectionItem = { id: string; name: string | null }

type PlaceOption = { id: string; name: string; parentName: string | null }

const SECTION_CREATE_HREF = '/backend/club/sections/create'
const PLACE_CREATE_HREF = '/backend/club/places/create'

type LookupEmpty = { state: PickerEmptyState; term: string } | null

const lookupEmpty = (count: number, search: string): LookupEmpty => {
  const state = pickerEmptyState(count, search)
  return state ? { state, term: search.trim() } : null
}

const placeTitle = (place: PlaceOption) => (place.parentName ? `${place.parentName} › ${place.name}` : place.name)

async function loadSections(search: string): Promise<LookupSelectItem[]> {
  const params = new URLSearchParams({ pageSize: '50', sortField: 'name', sortDir: 'asc' })
  if (search.trim()) params.set('search', search.trim())
  const data = await readApiResultOrThrow<{ items?: SectionItem[] }>(`/api/club_core/sections?${params.toString()}`)
  return (data.items ?? []).map((section) => ({ id: section.id, title: section.name ?? section.id }))
}

async function loadPlaces(search: string): Promise<LookupSelectItem[]> {
  const data = await readApiResultOrThrow<{ items?: PlaceOption[] }>('/api/club_core/options/places')
  const needle = search.trim().toLocaleLowerCase()
  return (data.items ?? [])
    .filter((place) => !needle || placeTitle(place).toLocaleLowerCase().includes(needle))
    .map((place) => ({ id: place.id, title: placeTitle(place) }))
}

export function RolesPanel({
  personId,
  canManage,
  onOpenGuardianship,
}: {
  personId: string
  canManage: boolean
  /** Opens the record's "Guardianship and consents" tab: a parent is a guardianship there, not a staff role. */
  onOpenGuardianship?: () => void
}) {
  const t = useT()
  const today = useClubToday()
  const queryClient = useQueryClient()
  const [busy, setBusy] = React.useState(false)
  const [role, setRole] = React.useState<string>('coordinator')
  const [sectionId, setSectionId] = React.useState<string | null>(null)
  const [placeId, setPlaceId] = React.useState<string | null>(null)
  const [validFrom, setValidFrom] = React.useState(today)
  const [validTo, setValidTo] = React.useState('')
  const [dialog, setDialog] = React.useState<{ mode: RoleAssignmentDialogMode; row: RoleAssignmentRow } | null>(null)
  // An empty section or place lookup links to the club's create page (people life-cycle spec REQ-L14, picker row 4);
  // the lookup is mounted again when the window regains focus, so a record created in the other tab shows up.
  const canCreateStructure = useGrantedFeatures()['club_core.manage']
  const [sectionEmpty, setSectionEmpty] = React.useState<LookupEmpty>(null)
  const [placeEmpty, setPlaceEmpty] = React.useState<LookupEmpty>(null)
  const [lookupKey, setLookupKey] = React.useState(0)
  const hintShown = sectionEmpty !== null || placeEmpty !== null
  React.useEffect(() => {
    const reload = () => {
      setLookupKey((key) => key + 1)
    }
    return reloadOnFocusEffect(hintShown ? browserFocusTarget() : null, reload)()
  }, [hintShown])

  const query = useQuery({
    queryKey: ['people-role-assignments', personId],
    queryFn: async () => {
      const data = await readApiResultOrThrow<{ items?: RoleAssignmentRow[] }>(
        `/api/people/role-assignments?personId=${encodeURIComponent(personId)}&pageSize=100&sortField=validFrom&sortDir=desc`,
      )
      const rows = data.items ?? []
      const sectionIds = [...new Set(rows.map((row) => row.sectionId).filter((id): id is string => Boolean(id)))]
      // Section and place names come from `club_core`; a reader without access to its lists sees no name.
      const sections =
        sectionIds.length > 0
          ? await readApiResultOrThrow<{ items?: SectionItem[] }>(
              `/api/club_core/sections?ids=${encodeURIComponent(sectionIds.join(','))}&pageSize=100`,
            )
              .then((result) => result.items ?? [])
              .catch(() => [])
          : []
      const places = rows.some((row) => row.placeId)
        ? await readApiResultOrThrow<{ items?: PlaceOption[] }>('/api/club_core/options/places')
            .then((result) => result.items ?? [])
            .catch(() => [])
        : []
      return {
        rows,
        sections: new Map(sections.map((section) => [section.id, section.name])),
        places: new Map(places.map((place) => [place.id, placeTitle(place)])),
      }
    },
  })

  // The assign form's lookups also report an empty result for the hint; the edit dialog's lookups do not.
  const fetchSections = React.useCallback(async (search: string): Promise<LookupSelectItem[]> => {
    const items = await loadSections(search)
    setSectionEmpty(lookupEmpty(items.length, search))
    return items
  }, [])

  const fetchPlaces = React.useCallback(async (search: string): Promise<LookupSelectItem[]> => {
    const items = await loadPlaces(search)
    setPlaceEmpty(lookupEmpty(items.length, search))
    return items
  }, [])

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['people-role-assignments', personId] })
  }

  const assign = async () => {
    setBusy(true)
    try {
      await apiCallOrThrow(
        '/api/people/role-assignments',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            personId,
            role,
            ...(role === 'coordinator' ? { sectionId } : {}),
            ...(role === 'facility_operator' ? { placeId } : {}),
            validFrom,
            ...(validTo ? { validTo } : {}),
          }),
        },
        { errorMessage: t('people.roles.errors.assign') },
      )
      flash(t('people.roles.flash.assigned'), 'success')
      setSectionId(null)
      setPlaceId(null)
      setValidTo('')
    } catch (error: unknown) {
      flash(errorMessage(error, t('people.roles.errors.assign')), 'error')
    } finally {
      setBusy(false)
      await refresh()
    }
  }

  const rows = query.data?.rows ?? []
  const needsSection = role === 'coordinator'
  const needsPlace = role === 'facility_operator'

  return (
    <section className="bg-card flex flex-col gap-4 rounded-lg border p-4" aria-label={t('people.roles.title')}>
      <SectionHeader title={t('people.roles.title')} count={rows.length} />
      {query.isLoading ? <LoadingMessage label={t('people.common.loading')} /> : null}
      {query.error ? <ErrorMessage label={errorMessage(query.error, t('people.roles.errors.load'))} /> : null}
      {query.isSuccess && rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t('people.roles.empty')}</p>
      ) : null}
      {rows.length > 0 ? (
        <ul className="flex flex-col divide-y">
          {rows.map((row) => {
            const status = periodStatus(row.validFrom, row.validTo, today)
            const scopeName = row.sectionId
              ? query.data?.sections.get(row.sectionId)
              : row.placeId
                ? query.data?.places.get(row.placeId)
                : null
            const title = `${t(`people.roles.role.${row.role}`)}${scopeName ? ` — ${scopeName}` : ''}`
            return (
              <li
                key={row.id}
                className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between"
                data-testid="people-role-row"
                data-role-assignment-id={row.id}
              >
                <span className="flex flex-col">
                  <span className="font-medium">{title}</span>
                  <span className="text-muted-foreground flex flex-wrap items-center gap-2 text-xs">
                    <span data-testid="people-role-period">{periodLabel(t, row.validFrom, row.validTo)}</span>
                    <StatusBadge variant={status === 'active' ? 'success' : 'neutral'}>
                      {t(`people.common.${status}`)}
                    </StatusBadge>
                  </span>
                </span>
                {canManage ? (
                  <span className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      data-testid="people-role-edit"
                      onClick={() => {
                        setDialog({ mode: 'edit', row })
                      }}
                    >
                      {t('people.common.edit')}
                    </Button>
                    {status !== 'ended' ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        data-testid="people-role-end"
                        onClick={() => {
                          setDialog({ mode: 'end', row })
                        }}
                      >
                        {t('people.roles.actions.endOn')}
                      </Button>
                    ) : null}
                  </span>
                ) : null}
                {dialog?.row.id === row.id ? (
                  <RoleAssignmentDialog
                    mode={dialog.mode}
                    row={row}
                    title={title}
                    fetchSections={loadSections}
                    fetchPlaces={loadPlaces}
                    onClose={() => {
                      setDialog(null)
                    }}
                    onDone={refresh}
                  />
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : null}
      <p className="text-muted-foreground text-sm">
        {t('people.roles.guardianHint')}{' '}
        {onOpenGuardianship ? (
          <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={onOpenGuardianship}>
            {t('people.roles.guardianHint.open')}
          </Button>
        ) : null}
      </p>
      {canManage ? (
        <form
          className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-end"
          aria-label={t('people.roles.actions.assign')}
          onSubmit={(event) => {
            event.preventDefault()
            void assign()
          }}
        >
          <div className="flex flex-col gap-1">
            <Label htmlFor="people-role">{t('people.roles.fields.role')}</Label>
            <Select value={role} onValueChange={setRole} disabled={busy}>
              <SelectTrigger id="people-role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {t(`people.roles.role.${value}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {needsSection ? (
            <div className="flex flex-1 flex-col gap-1">
              <Label>{t('people.roles.fields.section')}</Label>
              <LookupSelect
                key={`section-${String(lookupKey)}`}
                value={sectionId}
                onChange={setSectionId}
                fetchItems={fetchSections}
                minQuery={0}
                placeholder={t('people.roles.fields.section.placeholder')}
                searchPlaceholder={t('people.roles.fields.section.search')}
                emptyLabel={t('people.roles.fields.section.empty')}
                loadingLabel={t('people.common.loading')}
                clearLabel={t('people.common.clear')}
                selectLabel={t('people.common.select')}
                selectedLabel={t('people.common.selected')}
                disabled={busy}
              />
              {sectionEmpty && !sectionId ? (
                <PickerEmptyHint
                  state={sectionEmpty.state}
                  term={sectionEmpty.term}
                  canCreate={canCreateStructure}
                  create={{ kind: 'link', href: SECTION_CREATE_HREF }}
                  labels={{
                    none: t('people.picker.section.none'),
                    noMatch: t('people.picker.section.noMatch'),
                    add: t('people.picker.section.add'),
                    askAdmin: t('people.picker.askAdmin'),
                  }}
                  testId="people-role-section-hint"
                />
              ) : null}
            </div>
          ) : null}
          {needsPlace ? (
            <div className="flex flex-1 flex-col gap-1">
              <Label>{t('people.roles.fields.place')}</Label>
              <LookupSelect
                key={`place-${String(lookupKey)}`}
                value={placeId}
                onChange={setPlaceId}
                fetchItems={fetchPlaces}
                minQuery={0}
                placeholder={t('people.roles.fields.place.placeholder')}
                searchPlaceholder={t('people.roles.fields.place.search')}
                emptyLabel={t('people.roles.fields.place.empty')}
                loadingLabel={t('people.common.loading')}
                clearLabel={t('people.common.clear')}
                selectLabel={t('people.common.select')}
                selectedLabel={t('people.common.selected')}
                disabled={busy}
              />
              {placeEmpty && !placeId ? (
                <PickerEmptyHint
                  state={placeEmpty.state}
                  term={placeEmpty.term}
                  canCreate={canCreateStructure}
                  create={{ kind: 'link', href: PLACE_CREATE_HREF }}
                  labels={{
                    none: t('people.picker.place.none'),
                    noMatch: t('people.picker.place.noMatch'),
                    add: t('people.picker.place.add'),
                    askAdmin: t('people.picker.askAdmin'),
                  }}
                  testId="people-role-place-hint"
                />
              ) : null}
            </div>
          ) : null}
          <div className="flex flex-col gap-1">
            <Label htmlFor="people-role-from">{t('people.roles.fields.validFrom')}</Label>
            <Input
              id="people-role-from"
              type="date"
              value={validFrom}
              disabled={busy}
              onChange={(event) => {
                setValidFrom(event.target.value)
              }}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="people-role-to">{t('people.roles.fields.validTo')}</Label>
            <Input
              id="people-role-to"
              type="date"
              value={validTo}
              min={validFrom || undefined}
              disabled={busy}
              onChange={(event) => {
                setValidTo(event.target.value)
              }}
            />
          </div>
          <Button
            type="submit"
            disabled={busy || !validFrom || (needsSection && !sectionId) || (needsPlace && !placeId)}
          >
            {t('people.roles.actions.assign')}
          </Button>
        </form>
      ) : null}
    </section>
  )
}
