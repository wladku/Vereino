'use client'
// `/club/facility` — "Today at the facility" (README M-12; REQ-013, REQ-016; #126): the attendant runs the day at one
// place from a phone. The place picker (the club's places, the first by default), the day in the club's time zone,
// the state of the day's log with "Open facility" and "Close facility", "Report incident", and one card per session
// and rental of today on the place (and its sub-places) with the number of people and whether an adult supervisor is
// present — saved into the log's groups (starting the log when the day has none) — and "No-show" for a rental that
// may be marked so now. One read: `GET /api/facilities/today`. States: a skeleton while loading, an error with retry,
// "no facilities", "nothing scheduled today", and a conflict (the log changed meanwhile) that reloads the day.
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
import { Skeleton } from '@open-mercato/ui/primitives/skeleton'
import { Tag } from '@open-mercato/ui/primitives/tag'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { formatDayHeading } from '@vereino/ui'
import { HEADCOUNT_MAX } from '../../lib/logs'
import { FacilitiesClubFrame } from '../club-places/FacilitiesClubFrame'
import { KIND_TAGS } from '../club-places/PlaceTimeline'
import { CLUB_PLACES_HREF } from '../club-places/places-client'
import { CloseFacilityDialog, IncidentDialog, OpenFacilityDialog, type DialogOutcome } from './FacilityDialogs'
import {
  FACILITY_TODAY_KEY,
  clubTime,
  entryTimes,
  facilityHref,
  groupOf,
  groupsWith,
  recordNoShow,
  saveLog,
  useFacilityFeatures,
  useFacilityToday,
  writeErrorMessage,
  type FacilityToday,
  type TodayEntry,
} from './facility-client'

type Notice = { status: 'success' | 'warning' | 'error'; text: string }
type DialogKind = 'open' | 'close' | 'incident'

function DaySkeleton({ label }: { label: string }) {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" data-testid="club-facility-loading">
      <span className="sr-only">{label}</span>
      {[0, 1, 2].map((index) => (
        <Skeleton key={index} className="h-28 w-full" />
      ))}
    </div>
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
  const saved = groupOf(today.log, entry)
  const [headcount, setHeadcount] = React.useState(saved ? String(saved.headcount) : '')
  const [supervisor, setSupervisor] = React.useState(saved?.adultSupervisorPresent ?? false)
  const [pending, setPending] = React.useState(false)
  const [problem, setProblem] = React.useState<string | null>(null)
  const label = entry.label ?? t('facilities.places.entry.unnamed')

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
      setProblem(await onSaveGroup(entry, count, supervisor))
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
            <Tag variant="neutral">{t(`facilities.rentals.status.${entry.status}`)}</Tag>
          ) : null}
        </div>
        <h3 id={`${ids}-label`} className="font-semibold break-words">
          {label}
        </h3>
        {saved ? (
          <p className="text-muted-foreground text-sm" data-testid="club-facility-entry-saved">
            {saved.adultSupervisorPresent
              ? t('facilities.facility.groups.savedWithSupervisor', { count: saved.headcount })
              : t('facilities.facility.groups.saved', { count: saved.headcount })}
          </p>
        ) : null}
      </div>
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
            }}
          />
          <Label htmlFor={`${ids}-supervisor`}>{t('facilities.facility.groups.supervisor')}</Label>
        </div>
      </div>
      {problem ? (
        <p id={`${ids}-problem`} className="text-destructive text-sm" role="alert">
          {problem}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
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
        {entry.kind === 'rental' && entry.canNoShow && noShowAllowed ? (
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

function FacilityDay() {
  const t = useT()
  const locale = useLocale()
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const noShowAllowed = useFacilityFeatures().noShow
  const { confirm, ConfirmDialogElement } = useConfirmDialog()
  const placeSelectId = React.useId()
  const requested = searchParams.get('place')
  const query = useFacilityToday(requested)
  const [dialog, setDialog] = React.useState<DialogKind | null>(null)
  // A new key per opening starts a dialog fresh (the time defaults to now).
  const [dialogKey, setDialogKey] = React.useState(0)
  const [notice, setNotice] = React.useState<Notice | null>(null)
  const noShowing = React.useRef(new Set<string>())

  const refresh = () => queryClient.invalidateQueries({ queryKey: [FACILITY_TODAY_KEY] })

  const openDialog = (kind: DialogKind) => {
    setNotice(null)
    setDialogKey((current) => current + 1)
    setDialog(kind)
  }

  const onOutcome = (outcome: DialogOutcome) => {
    setNotice(
      outcome.kind === 'done'
        ? { status: 'success', text: outcome.message }
        : { status: 'warning', text: t('facilities.facility.conflict', { reason: outcome.message }) },
    )
    void refresh()
  }

  const today = query.data

  const saveGroup = async (entry: TodayEntry, headcount: number, supervisor: boolean): Promise<string | null> => {
    if (!today) return null
    setNotice(null)
    const result = await saveLog(today, { groupsPresent: groupsWith(today.log, entry, headcount, supervisor) })
    if (result.ok) {
      setNotice({
        status: 'success',
        text: t('facilities.facility.groups.done', { label: entry.label ?? t('facilities.places.entry.unnamed') }),
      })
      await refresh()
      return null
    }
    if (result.status === 409) {
      setNotice({
        status: 'warning',
        text: t('facilities.facility.conflict', {
          reason: writeErrorMessage(t, result, 'facilities.facility.errors.groups'),
        }),
      })
      await refresh()
      return null
    }
    return writeErrorMessage(t, result, 'facilities.facility.errors.groups')
  }

  const noShow = async (entry: TodayEntry) => {
    if (!today || noShowing.current.has(entry.id)) return
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
    await refresh()
  }

  let body: React.ReactNode
  if (!today && query.isFetching) {
    body = <DaySkeleton label={t('facilities.facility.loading')} />
  } else if (!today) {
    body = (
      <ErrorMessage
        label={t('facilities.facility.errors.load')}
        action={
          <Button type="button" variant="outline" className="min-h-11" onClick={() => void query.refetch()}>
            {t('facilities.places.retry')}
          </Button>
        }
      />
    )
  } else if (!today.place) {
    body = (
      <p className="text-muted-foreground" data-testid="club-facility-no-places">
        {t('facilities.facility.noPlaces')}
      </p>
    )
  } else {
    const log = today.log
    const opened = Boolean(log?.openedAt)
    const closed = Boolean(log?.closedAt)
    body = (
      <>
        {today.places.length > 1 ? (
          <div className="flex flex-col gap-1 sm:w-80">
            <Label htmlFor={placeSelectId}>{t('facilities.fields.place')}</Label>
            <Select
              value={today.place.id}
              onValueChange={(next: string) => {
                setNotice(null)
                router.replace(facilityHref(next))
              }}
            >
              <SelectTrigger id={placeSelectId} className="min-h-11" data-testid="club-facility-place">
                <SelectValue placeholder={t('facilities.fields.place.choose')} />
              </SelectTrigger>
              <SelectContent>
                {today.places.map((place) => (
                  <SelectItem key={place.id} value={place.id}>
                    {place.parentName ? `${place.parentName} › ${place.name}` : place.name}
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
              {today.place.name}
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
          {today.entries.length === 0 ? (
            <p className="text-muted-foreground" data-testid="club-facility-empty">
              {t('facilities.facility.entries.empty')}
            </p>
          ) : (
            <ul className="grid grid-cols-1 gap-3 md:grid-cols-2" data-testid="club-facility-entries">
              {today.entries.map((entry) => (
                <EntryCard
                  key={`${entry.kind}:${entry.id}:${log?.updatedAt ?? 'none'}:${entry.updatedAt ?? ''}`}
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
      </>
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
      <div aria-live="polite">
        {notice ? (
          <Alert status={notice.status} data-testid="club-facility-notice">
            <p>{notice.text}</p>
          </Alert>
        ) : null}
      </div>
      {body}
      {ConfirmDialogElement}
    </>
  )
}

export function ClubFacilityPage() {
  return <FacilitiesClubFrame>{() => <FacilityDay />}</FacilitiesClubFrame>
}
