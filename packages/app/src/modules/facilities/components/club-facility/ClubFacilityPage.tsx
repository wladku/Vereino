'use client'
// `/club/facility?tab=today|rentals` — "Today at the facility" (README M-12; REQ-013, REQ-016; #126; facilities parity
// spec REQ-R13, REQ-R14, #282): the attendant runs the day at one place from a phone. The place picker (the places of
// the caller's grant, the first by default), the day in the club's time zone, the state of the day's log with "Open
// facility" and "Close facility", "Report incident", and one card per session and rental of today on the place family:
// a session reads "time · activity · place / group · coach", a rental "Rental: renter · place" with its contact and a
// `tel:` link where the caller manages its rentals (DD-R18). The number of people and the adult supervisor are asked
// once the facility is opened and are saved into the log's groups; "No-show" is shown on every rental that holds its
// slot and answers "too early" before the start without calling the API. "Incidents reported today" lists the day's
// incidents with "Add photo", so a photo that failed to upload is added again. With `facilities.rentals.manage` the
// Rentals tab lists the rentals of the caller's places (`ClubRentalsTab`). A holder of the log whose grant names no
// active place sees "no facility assigned" and no tabs. One read per tab: `GET /api/facilities/today`,
// `GET /api/facilities/rentals`. States: a skeleton while loading, an error with retry, no facility, "nothing scheduled
// today", and a conflict (the log changed meanwhile) that reloads the day.
import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { useConfirmDialog } from '@open-mercato/ui/backend/confirm-dialog'
import { ErrorMessage } from '@open-mercato/ui/backend/detail'
import { Alert } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import { Checkbox } from '@open-mercato/ui/primitives/checkbox'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@open-mercato/ui/primitives/tabs'
import { Tag } from '@open-mercato/ui/primitives/tag'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { formatDayHeading, MemberSkeleton, Notice, StatusTag } from '@vereino/ui'
import { INCIDENT_PHOTOS_MAX } from '../../lib/incidents'
import { HEADCOUNT_MAX } from '../../lib/logs'
import { FacilitiesClubFrame } from '../club-places/FacilitiesClubFrame'
import { KIND_TAGS } from '../day-axis/tags'
import { CLUB_PLACES_HREF } from '../club-places/places-client'
import { ClubRentalsTab } from './ClubRentalsTab'
import { CloseFacilityDialog, IncidentDialog, OpenFacilityDialog, type DialogOutcome } from './FacilityDialogs'
import {
  FACILITY_TODAY_KEY,
  clubTime,
  entryTimes,
  CLUB_FACILITY_HREF,
  facilityHref,
  facilityTabOf,
  groupOf,
  groupsWith,
  noShowTooEarly,
  offersNoShow,
  recordNoShow,
  saveLog,
  uploadIncidentPhoto,
  useFacilityFeatures,
  useFacilityToday,
  writeErrorMessage,
  type FacilityTab,
  type FacilityToday,
  type TodayEntry,
  type TodayIncident,
} from './facility-client'

type NoShowNotice = { status: 'success' | 'warning' | 'error'; text: string }
type DialogKind = 'open' | 'close' | 'incident'
type Translate = ReturnType<typeof useT>

/** `tel:` of a phone number as typed: digits and a leading plus only. */
function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`
}

/** A session's "place / group · coach" (M-12); null when the read knows none of them. */
function sessionDetails(t: Translate, entry: TodayEntry): string | null {
  const where = [entry.placeName, entry.groupName ?? t('facilities.facility.entry.clubGroup')]
    .filter((part): part is string => Boolean(part))
    .join(' / ')
  const line = [where, entry.coachName].filter((part): part is string => Boolean(part)).join(' · ')
  return line || null
}

/** A rental's contact with a phone link (DD-R18: present only where the caller manages the rentals of the place). */
function RentalContact({ entry }: { entry: TodayEntry }) {
  const t = useT()
  if (!entry.contactName && !entry.contactPhone) return null
  return (
    <p className="text-sm break-words" data-testid="club-facility-entry-contact">
      {entry.contactName ? t('facilities.facility.entry.contact', { contact: entry.contactName }) : null}
      {entry.contactName && entry.contactPhone ? ', ' : null}
      {entry.contactPhone ? (
        <a
          href={telHref(entry.contactPhone)}
          className="text-primary inline-flex min-h-11 items-center font-medium underline underline-offset-2"
          aria-label={t('facilities.facility.entry.call', { phone: entry.contactPhone })}
          data-testid="club-facility-entry-phone"
        >
          {entry.contactPhone}
        </a>
      ) : null}
    </p>
  )
}

function EntryCard({
  entry,
  today,
  noShowAllowed,
  onSaveGroup,
  onNoShow,
}: {
  entry: TodayEntry
  today: FacilityToday
  noShowAllowed: boolean
  onSaveGroup: (entry: TodayEntry, headcount: number, supervisor: boolean) => Promise<string | null>
  onNoShow: (entry: TodayEntry) => Promise<void>
}) {
  const t = useT()
  const ids = React.useId()
  const opened = Boolean(today.log?.openedAt)
  const saved = groupOf(today.log, entry)
  const savedHeadcount = saved ? String(saved.headcount) : ''
  const savedSupervisor = saved?.adultSupervisorPresent ?? false
  const [headcount, setHeadcount] = React.useState(savedHeadcount)
  const [supervisor, setSupervisor] = React.useState(savedSupervisor)
  // Unsaved input survives another card's save (which changes the log's version); a clean card follows the log.
  // (State adjusted during render when the saved values change, React's "storing information from previous renders".)
  const [dirty, setDirty] = React.useState(false)
  const [synced, setSynced] = React.useState({ headcount: savedHeadcount, supervisor: savedSupervisor })
  if (synced.headcount !== savedHeadcount || synced.supervisor !== savedSupervisor) {
    setSynced({ headcount: savedHeadcount, supervisor: savedSupervisor })
    if (!dirty) {
      setHeadcount(savedHeadcount)
      setSupervisor(savedSupervisor)
    }
  }
  const [pending, setPending] = React.useState(false)
  const [problem, setProblem] = React.useState<string | null>(null)
  const label = entry.label ?? t('facilities.places.entry.unnamed')
  const details = entry.kind === 'session' ? sessionDetails(t, entry) : null

  const save = async () => {
    if (pending) return
    const count = Number(headcount)
    if (headcount.trim() === '' || !Number.isInteger(count) || count < 0 || count > HEADCOUNT_MAX) {
      setProblem(t('facilities.facility.groups.headcountInvalid', { max: HEADCOUNT_MAX }))
      return
    }
    setPending(true)
    setProblem(null)
    try {
      const failure = await onSaveGroup(entry, count, supervisor)
      setProblem(failure)
      if (failure === null) setDirty(false)
    } finally {
      setPending(false)
    }
  }

  return (
    <li
      className="flex flex-col gap-3 rounded-md border p-4"
      data-testid={`club-facility-entry-${entry.id}`}
      data-kind={entry.kind}
    >
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium tabular-nums">{entryTimes(entry, today.timeZone)}</span>
          <Tag variant={KIND_TAGS[entry.kind]}>{t(`facilities.places.kind.${entry.kind}`)}</Tag>
          {entry.kind === 'rental' ? (
            <StatusTag status="neutral">{t(`facilities.rentals.status.${entry.status}`)}</StatusTag>
          ) : null}
        </div>
        <h3 id={`${ids}-label`} className="font-semibold break-words">
          {entry.kind === 'rental'
            ? t('facilities.facility.entry.rental', { renter: label, place: entry.placeName ?? '' })
            : label}
        </h3>
        {details ? (
          <p className="text-muted-foreground text-sm break-words" data-testid="club-facility-entry-details">
            {details}
          </p>
        ) : null}
        {entry.kind === 'rental' ? <RentalContact entry={entry} /> : null}
        {saved ? (
          <p className="text-muted-foreground text-sm" data-testid="club-facility-entry-saved">
            {saved.adultSupervisorPresent
              ? t('facilities.facility.groups.savedWithSupervisor', { count: saved.headcount })
              : t('facilities.facility.groups.saved', { count: saved.headcount })}
          </p>
        ) : null}
      </div>
      {opened ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${ids}-headcount`}>{t('facilities.facility.groups.headcount')}</Label>
            <Input
              id={`${ids}-headcount`}
              type="number"
              inputMode="numeric"
              min={0}
              max={HEADCOUNT_MAX}
              step={1}
              value={headcount}
              disabled={pending}
              className="min-h-11 sm:w-32"
              aria-invalid={problem ? true : undefined}
              aria-describedby={problem ? `${ids}-problem` : undefined}
              data-testid="club-facility-entry-headcount"
              onChange={(event) => {
                setHeadcount(event.target.value)
                setDirty(true)
                setProblem(null)
              }}
            />
          </div>
          <div className="flex min-h-11 items-center gap-2">
            <Checkbox
              id={`${ids}-supervisor`}
              checked={supervisor}
              disabled={pending}
              data-testid="club-facility-entry-supervisor"
              onCheckedChange={(next) => {
                setSupervisor(next === true)
                setDirty(true)
              }}
            />
            <Label htmlFor={`${ids}-supervisor`}>{t('facilities.facility.groups.supervisor')}</Label>
          </div>
        </div>
      ) : null}
      {problem ? (
        <p id={`${ids}-problem`} className="text-destructive text-sm" role="alert">
          {problem}
        </p>
      ) : null}
      {opened || (offersNoShow(entry) && noShowAllowed) ? (
        <div className="flex flex-wrap gap-2">
          {opened ? (
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={pending}
              aria-describedby={`${ids}-label`}
              data-testid="club-facility-entry-save"
              onClick={() => void save()}
            >
              {pending ? t('facilities.common.saving') : t('facilities.facility.groups.save')}
            </Button>
          ) : null}
          {offersNoShow(entry) && noShowAllowed ? (
            <Button
              type="button"
              variant="destructive"
              className="min-h-11"
              disabled={pending}
              aria-describedby={`${ids}-label`}
              data-testid="club-facility-entry-no-show"
              onClick={() => void onNoShow(entry)}
            >
              {t('facilities.facility.noShow.action')}
            </Button>
          ) : null}
        </div>
      ) : null}
    </li>
  )
}

function LogState({ today }: { today: FacilityToday }) {
  const t = useT()
  const log = today.log
  if (!log?.openedAt) {
    return (
      <p className="text-sm" data-testid="club-facility-state">
        {t('facilities.facility.state.notOpened')}
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-1 text-sm" data-testid="club-facility-state">
      <p className="font-medium">
        {t('facilities.facility.state.opened', { time: clubTime(log.openedAt, today.timeZone) })}
      </p>
      {log.conditionBefore ? (
        <p className="text-muted-foreground break-words">
          {t('facilities.facility.state.conditionBefore', { text: log.conditionBefore })}
        </p>
      ) : null}
      {log.closedAt ? (
        <>
          <p className="font-medium">
            {t('facilities.facility.state.closed', { time: clubTime(log.closedAt, today.timeZone) })}
          </p>
          {log.conditionAfter ? (
            <p className="text-muted-foreground break-words">
              {t('facilities.facility.state.conditionAfter', { text: log.conditionAfter })}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  )
}

/** One incident of today with its photo count and "Add photo" while the incident has room for one. */
function IncidentRow({
  incident,
  timeZone,
  onAddPhoto,
}: {
  incident: TodayIncident
  timeZone: string
  onAddPhoto: (incident: TodayIncident, file: File) => Promise<void>
}) {
  const t = useT()
  const inputId = React.useId()
  const [pending, setPending] = React.useState(false)
  return (
    <li
      className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
      data-testid={`club-facility-incident-${incident.id}`}
    >
      <div className="flex flex-col gap-1">
        <span className="font-medium">
          <span className="tabular-nums">{clubTime(incident.occurredAt, timeZone)}</span>{' '}
          {t(`facilities.records.incidentKind.${incident.kind}`)}
        </span>
        <span className="text-muted-foreground text-sm" data-testid="club-facility-incident-photo-count">
          {t('facilities.facility.incidents.photos', { count: incident.photoCount })}
        </span>
      </div>
      {incident.photoCount < INCIDENT_PHOTOS_MAX ? (
        <div>
          <input
            id={inputId}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            disabled={pending}
            data-testid="club-facility-incident-add-photo-input"
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (!file) return
              setPending(true)
              void onAddPhoto(incident, file).finally(() => {
                setPending(false)
              })
            }}
          />
          <Button asChild variant="outline" className="min-h-11" aria-disabled={pending || undefined}>
            <label htmlFor={inputId} data-testid="club-facility-incident-add-photo">
              {pending ? t('facilities.common.saving') : t('facilities.facility.incidents.addPhoto')}
            </label>
          </Button>
        </div>
      ) : null}
    </li>
  )
}

function FacilityDay({ today, onRefresh }: { today: FacilityToday; onRefresh: () => Promise<void> }) {
  const t = useT()
  const locale = useLocale()
  const router = useRouter()
  const noShowAllowed = useFacilityFeatures().noShow
  const { confirm, ConfirmDialogElement } = useConfirmDialog()
  const placeSelectId = React.useId()
  const [dialog, setDialog] = React.useState<DialogKind | null>(null)
  // A new key per opening starts a dialog fresh (the time defaults to now).
  const [dialogKey, setDialogKey] = React.useState(0)
  const [notice, setNotice] = React.useState<NoShowNotice | null>(null)
  const noShowing = React.useRef(new Set<string>())
  const place = today.place
  if (!place) return null

  const openDialog = (kind: DialogKind) => {
    setNotice(null)
    setDialogKey((current) => current + 1)
    setDialog(kind)
  }

  const onOutcome = (outcome: DialogOutcome) => {
    setNotice(
      outcome.kind === 'done'
        ? { status: outcome.warning ? 'warning' : 'success', text: outcome.message }
        : { status: 'warning', text: t('facilities.facility.conflict', { reason: outcome.message }) },
    )
    void onRefresh()
  }

  const saveGroup = async (entry: TodayEntry, headcount: number, supervisor: boolean): Promise<string | null> => {
    setNotice(null)
    const result = await saveLog(today, { groupsPresent: groupsWith(today.log, entry, headcount, supervisor) })
    if (result.ok) {
      setNotice({
        status: 'success',
        text: t('facilities.facility.groups.done', { label: entry.label ?? t('facilities.places.entry.unnamed') }),
      })
      await onRefresh()
      return null
    }
    if (result.status === 409) {
      setNotice({
        status: 'warning',
        text: t('facilities.facility.conflict', {
          reason: writeErrorMessage(t, result, 'facilities.facility.errors.groups'),
        }),
      })
      await onRefresh()
      return null
    }
    return writeErrorMessage(t, result, 'facilities.facility.errors.groups')
  }

  const noShow = async (entry: TodayEntry) => {
    if (noShowing.current.has(entry.id)) return
    // Before the start the answer is known here: no API call (M-12, `action.noShow.tooEarly`).
    if (noShowTooEarly(entry, new Date())) {
      setNotice({ status: 'warning', text: t('facilities.facility.noShow.tooEarly') })
      return
    }
    const label = entry.label ?? t('facilities.places.entry.unnamed')
    const confirmed = await confirm({
      title: t('facilities.facility.noShow.title'),
      text: t('facilities.facility.noShow.text', { label, time: entryTimes(entry, today.timeZone) }),
      confirmText: t('facilities.facility.noShow.confirm'),
      cancelText: t('facilities.facility.noShow.keep'),
      variant: 'destructive',
    })
    if (!confirmed) return
    noShowing.current.add(entry.id)
    setNotice(null)
    const result = await recordNoShow(entry).finally(() => noShowing.current.delete(entry.id))
    if (result.ok) setNotice({ status: 'success', text: t('facilities.facility.noShow.done', { label }) })
    else {
      setNotice({
        status: result.status === 409 ? 'warning' : 'error',
        text: writeErrorMessage(t, result, 'facilities.facility.errors.noShow'),
      })
    }
    await onRefresh()
  }

  const addPhoto = async (incident: TodayIncident, file: File) => {
    setNotice(null)
    const result = await uploadIncidentPhoto(incident.id, file)
    setNotice(
      result.ok
        ? { status: 'success', text: t('facilities.facility.incidents.photoAdded') }
        : { status: 'error', text: writeErrorMessage(t, result, 'facilities.facility.incidents.photoFailed') },
    )
    if (result.ok) await onRefresh()
  }

  const log = today.log
  const opened = Boolean(log?.openedAt)
  const closed = Boolean(log?.closedAt)
  return (
    <div className="flex flex-col gap-4">
      <div aria-live="polite">
        {notice ? (
          <Alert style="light" status={notice.status} data-testid="club-facility-notice">
            <p>{notice.text}</p>
          </Alert>
        ) : null}
      </div>
      {today.places.length > 1 ? (
        <div className="flex flex-col gap-1 sm:w-80">
          <Label htmlFor={placeSelectId}>{t('facilities.fields.place')}</Label>
          <Select
            value={place.id}
            onValueChange={(next: string) => {
              setNotice(null)
              router.replace(facilityHref(next))
            }}
          >
            <SelectTrigger id={placeSelectId} className="min-h-11" data-testid="club-facility-place">
              <SelectValue placeholder={t('facilities.fields.place.choose')} />
            </SelectTrigger>
            <SelectContent>
              {today.places.map((option) => (
                <SelectItem key={option.id} value={option.id}>
                  {option.parentName ? `${option.parentName} › ${option.name}` : option.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <section className="flex flex-col gap-3 rounded-md border p-4" aria-labelledby={`${placeSelectId}-log`}>
        <div className="flex flex-col gap-1">
          <h2
            id={`${placeSelectId}-log`}
            className="text-lg font-semibold break-words"
            data-testid="club-facility-place-name"
          >
            {place.name}
          </h2>
          <p className="text-muted-foreground text-sm" data-testid="club-facility-date">
            {formatDayHeading(today.date, locale)}
          </p>
        </div>
        <LogState today={today} />
        <div className="flex flex-wrap gap-2">
          {!opened ? (
            <Button
              type="button"
              className="min-h-11"
              data-testid="club-facility-open"
              onClick={() => {
                openDialog('open')
              }}
            >
              {t('facilities.facility.open.action')}
            </Button>
          ) : null}
          {opened && !closed ? (
            <Button
              type="button"
              className="min-h-11"
              data-testid="club-facility-close"
              onClick={() => {
                openDialog('close')
              }}
            >
              {t('facilities.facility.close.action')}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            data-testid="club-facility-incident"
            onClick={() => {
              openDialog('incident')
            }}
          >
            {t('facilities.facility.incident.action')}
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby={`${placeSelectId}-entries`}>
        <h2 id={`${placeSelectId}-entries`} className="text-lg font-semibold">
          {t('facilities.facility.entries.title')}
        </h2>
        {today.entries.length > 0 && !opened ? (
          <p className="text-muted-foreground text-sm" data-testid="club-facility-headcount-hint">
            {t('facilities.facility.groups.afterOpening')}
          </p>
        ) : null}
        {today.entries.length === 0 ? (
          <p className="text-muted-foreground" data-testid="club-facility-empty">
            {/* The Rentals tab exists only with the rental grant (`noShow`); without it the day just says it is empty. */}
            {t(noShowAllowed ? 'facilities.facility.entries.emptyRentals' : 'facilities.facility.entries.empty')}
          </p>
        ) : (
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2" data-testid="club-facility-entries">
            {today.entries.map((entry) => (
              <EntryCard
                key={`${entry.kind}:${entry.id}`}
                entry={entry}
                today={today}
                noShowAllowed={noShowAllowed}
                onSaveGroup={saveGroup}
                onNoShow={noShow}
              />
            ))}
          </ul>
        )}
      </section>

      {today.incidents.length > 0 ? (
        <section className="flex flex-col gap-3" aria-labelledby={`${placeSelectId}-incidents`}>
          <h2 id={`${placeSelectId}-incidents`} className="text-lg font-semibold">
            {t('facilities.facility.incidents.title')}
          </h2>
          <ul className="flex flex-col gap-2" data-testid="club-facility-incidents">
            {today.incidents.map((incident) => (
              <IncidentRow key={incident.id} incident={incident} timeZone={today.timeZone} onAddPhoto={addPhoto} />
            ))}
          </ul>
        </section>
      ) : null}

      {dialog === 'open' ? (
        <OpenFacilityDialog
          key={`open-${String(dialogKey)}`}
          today={today}
          open
          onOpenChange={(next) => {
            if (!next) setDialog(null)
          }}
          onOutcome={onOutcome}
        />
      ) : null}
      {dialog === 'close' ? (
        <CloseFacilityDialog
          key={`close-${String(dialogKey)}`}
          today={today}
          open
          onOpenChange={(next) => {
            if (!next) setDialog(null)
          }}
          onOutcome={onOutcome}
        />
      ) : null}
      {dialog === 'incident' ? (
        <IncidentDialog
          key={`incident-${String(dialogKey)}`}
          today={today}
          open
          onOpenChange={(next) => {
            if (!next) setDialog(null)
          }}
          onOutcome={onOutcome}
        />
      ) : null}
      {ConfirmDialogElement}
    </div>
  )
}

function ClubFacility() {
  const t = useT()
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const features = useFacilityFeatures()
  const requested = searchParams.get('place')
  const tab: FacilityTab = features.noShow ? facilityTabOf(searchParams.get('tab')) : 'today'
  const query = useFacilityToday(requested)
  const today = query.data

  const refresh = React.useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: [FACILITY_TODAY_KEY] })
  }, [queryClient])

  let body: React.ReactNode
  // The tabs depend on the feature check: wait for it, so the day never remounts into a tab panel.
  if ((!today && query.isFetching) || (today?.place && !features.loaded)) {
    body = (
      <MemberSkeleton
        shape="rows"
        count={3}
        label={t('facilities.facility.loading')}
        data-testid="club-facility-loading"
      />
    )
  } else if (!today) {
    body = (
      <ErrorMessage
        label={t('facilities.facility.errors.load')}
        action={
          requested ? (
            // A stale or deleted `?place=` answers 404 for good: offer the first place instead of a retry.
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              onClick={() => {
                router.replace(CLUB_FACILITY_HREF)
              }}
            >
              {t('facilities.facility.showFirstPlace')}
            </Button>
          ) : (
            <Button type="button" variant="outline" className="min-h-11" onClick={() => void query.refetch()}>
              {t('facilities.places.retry')}
            </Button>
          )
        }
      />
    )
  } else if (!today.place) {
    // No place in the caller's grant: an attendant without an active assignment, or a club without places.
    body = (
      <Notice data-testid="club-facility-no-places">
        <p>{features.manage ? t('facilities.facility.noPlaces') : t('facilities.facility.noFacilityAssigned')}</p>
      </Notice>
    )
  } else if (!features.noShow) {
    body = <FacilityDay today={today} onRefresh={refresh} />
  } else {
    body = (
      <Tabs
        value={tab}
        onValueChange={(next: string) => {
          router.replace(facilityHref(requested, facilityTabOf(next)))
        }}
      >
        {/* The platform tabs primitives drop `data-testid`; the wrapper carries it, and tests pick a tab by role. */}
        <div className="overflow-x-auto" data-testid="club-facility-tabs">
          <TabsList aria-label={t('facilities.facility.tabs.label')}>
            <TabsTrigger value="today" className="min-h-11">
              {t('facilities.facility.tabs.today')}
            </TabsTrigger>
            <TabsTrigger value="rentals" className="min-h-11">
              {t('facilities.facility.tabs.rentals')}
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="today" className="pt-4">
          <FacilityDay today={today} onRefresh={refresh} />
        </TabsContent>
        <TabsContent value="rentals" className="pt-4">
          <ClubRentalsTab />
        </TabsContent>
      </Tabs>
    )
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t('facilities.facility.title')}</h1>
        <Button asChild variant="outline" className="min-h-11">
          <Link href={CLUB_PLACES_HREF} data-testid="club-facility-all-places">
            {t('facilities.facility.allPlaces')}
          </Link>
        </Button>
      </div>
      <p className="text-muted-foreground max-w-prose text-sm">{t('facilities.facility.intro')}</p>
      {body}
    </>
  )
}

export function ClubFacilityPage() {
  return <FacilitiesClubFrame>{() => <ClubFacility />}</FacilitiesClubFrame>
}
