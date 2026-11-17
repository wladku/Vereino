'use client'
// `/backend/facilities/calendar?place=&date=` (facilities parity spec B-23, REQ-R01, REQ-R03; #276): one place's whole
// day on the hour axis (`DayAxis`, DD-R01). The bookable places as chips, the seven day chips from today and "Other
// day" (DD-R03); the place and the day live in the address (`replace`), so a reload, a shared link and the back button
// restore the view, and the seven days of the chips are read once. The availability card is a `details` element, open
// when the place has no bookable window: it says whether the place accepts online requests and lists every bookable
// window per weekday, the regulation windows marked; "Remove" per day and "Set booking availability" need
// `facilities.manage`. "Wpisy dnia" gives each entry its action (own booking → cancel, rental → the rentals, request →
// the decision, closure → the closures, maintenance → the task dialog); "To be moved" limits the axis and the list to
// flagged entries and counts them per chip day. Rentals and requests are drawn for every reader with `facilities.view`;
// the contact stays with the rental scope (DD-R18). A free hour opens the slot dialog (E11-S03, #277) with the kinds
// the user may save (DD-R04); without any kind the hours are not buttons.
import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { ErrorMessage } from '@open-mercato/ui/backend/detail'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { useConfirmDialog } from '@open-mercato/ui/backend/confirm-dialog'
import { apiCallOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { fetchCrudList } from '@open-mercato/ui/backend/utils/crud'
import { Alert, AlertDescription, AlertTitle } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import { Checkbox } from '@open-mercato/ui/primitives/checkbox'
import { Label } from '@open-mercato/ui/primitives/label'
import { Skeleton } from '@open-mercato/ui/primitives/skeleton'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { ISO_WEEKDAYS, addDays, isCalendarDate } from '@vereino/core'
import { browserTimeZone, clubToday, formatDayHeading, useClubTimeZone, useClubToday } from '@vereino/ui'
import { bookableWindowsByDay, chipDates, CHIP_DAYS } from '../lib/day-axis'
import { closingAfter, zoneAtMinute } from '../lib/slot'
import { isBookablePlace } from '../lib/place-scope'
import { AvailabilityDialog, type BulkResult } from './AvailabilityDialog'
import { MaintenanceTaskDialog } from './MaintenanceTaskDialog'
import { SlotDialog, type SlotPreset } from './slot/SlotDialog'
import { useSlotKinds } from './slot/slot-client'
import {
  CALENDAR_HREF,
  CLOSURES_HREF,
  RENTALS_HREF,
  ZONES_HREF,
  ZONE_RULES_BULK_URL,
  ZONE_RULES_KEY,
  codedMessage,
  errorMessage,
  useCalendarFeatures,
  usePlaceOptions,
  usePlaceRows,
  usePlaceZoneRules,
  type PlaceOptionRow,
  type ZoneRuleRow,
} from './facilities-client'
import { MAINTENANCE_API, flashFlagged, type MaintenanceTaskRow } from './maintenance-client'
import { RENTALS_KEY } from './rentals-client'
import {
  PLACES_CALENDAR_KEY,
  calendarErrorStatus,
  cancelInternalBooking,
  dayWindow,
  entriesOfDay,
  entryLabel,
  entryRange,
  minutesOf,
  timeOf,
  useStaffCalendar,
  zoneWallTime,
  zonedLocalInstant,
  zonedLocalValue,
  type CalendarEntry,
} from './club-places/places-client'
import { DayAxis } from './day-axis/DayAxis'
import { ChipRow, DayChips } from './day-axis/DayChips'
import { DayEntries } from './day-axis/DayEntries'

const REQUESTS_HREF = '/backend/facilities/requests'
const PLACE_CREATE_HREF = '/backend/club/places/create'
const placeSettingsHref = (placeId: string) => `/backend/club/places/${encodeURIComponent(placeId)}/edit`

/** The calendar's address of a place and a day. */
export const calendarHref = (placeId: string, date: string) =>
  `${CALENDAR_HREF}?place=${encodeURIComponent(placeId)}&date=${encodeURIComponent(date)}`

function SaveSummary({ result }: { result: BulkResult }) {
  const t = useT()
  const { clubOccurrencesInWindows, pendingRequestsOutside } = result.warnings
  return (
    <div className="flex flex-col gap-2" data-testid="facilities-availability-result">
      <Alert status="success">
        <AlertTitle>{t('facilities.availability.saved.title')}</AlertTitle>
        <AlertDescription>
          {t('facilities.availability.saved.counts', { created: result.created, removed: result.removed })}
        </AlertDescription>
      </Alert>
      {clubOccurrencesInWindows > 0 || pendingRequestsOutside > 0 ? (
        <Alert status="warning">
          <AlertTitle>{t('facilities.availability.warnings.title')}</AlertTitle>
          <AlertDescription>
            <ul className="flex flex-col gap-1">
              {clubOccurrencesInWindows > 0 ? (
                <li>{t('facilities.availability.warnings.clubSessions', { count: clubOccurrencesInWindows })}</li>
              ) : null}
              {pendingRequestsOutside > 0 ? (
                <li>{t('facilities.availability.warnings.pendingRequests', { count: pendingRequestsOutside })}</li>
              ) : null}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  )
}

/** The availability card (REQ-R03): a `details` element, open when the place has no bookable window. */
function AvailabilityCard({
  rows,
  acceptsOnline,
  manage,
  busyDay,
  onRemove,
}: {
  rows: readonly ZoneRuleRow[]
  acceptsOnline: boolean
  manage: boolean
  busyDay: number | null
  onRemove: (day: number) => void
}) {
  const t = useT()
  const today = useClubToday()
  const byDay = React.useMemo(() => bookableWindowsByDay(rows, today), [rows, today])
  // Open when the place opens without a bookable window; afterwards the reader decides (a save never folds it away).
  const [open, setOpen] = React.useState(byDay.size === 0)
  return (
    <details
      className="rounded-md border p-4"
      open={open}
      onToggle={(event) => {
        setOpen(event.currentTarget.open)
      }}
      data-testid="facilities-availability-card"
    >
      <summary className="cursor-pointer text-sm">
        <span className="font-semibold">{t('facilities.calendar.availabilityCard.title')}</span>{' '}
        <span className="text-muted-foreground" data-testid="facilities-availability-online">
          {t('facilities.calendar.availabilityCard.summary', {
            state: t(
              acceptsOnline
                ? 'facilities.calendar.availabilityCard.acceptsOnline'
                : 'facilities.calendar.availabilityCard.noOnline',
            ),
          })}
        </span>
      </summary>
      <ul className="mt-3 flex flex-col divide-y" data-testid="facilities-weekly-availability">
        {ISO_WEEKDAYS.map((day) => {
          const windows = byDay.get(day) ?? []
          const removable = windows.some((window) => window.source === 'availability')
          return (
            <li
              key={day}
              className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between"
              data-testid={`facilities-weekly-day-${String(day)}`}
            >
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
                <span className="text-sm font-medium sm:w-32">{t(`facilities.weekdays.long.${String(day)}`)}</span>
                {windows.length === 0 ? (
                  <span className="text-muted-foreground text-sm">
                    {t('facilities.calendar.availabilityCard.none')}
                  </span>
                ) : (
                  <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                    {windows.map((window) => (
                      <li key={`${window.id}-${window.from}`} className="tabular-nums">
                        {window.from}–{window.to}
                        {window.validTo ? (
                          <span className="text-muted-foreground">
                            {' '}
                            {t('facilities.calendar.availabilityCard.until', { date: window.validTo })}
                          </span>
                        ) : null}
                        {window.source === 'regulations' ? (
                          <span className="text-muted-foreground">
                            {' '}
                            {t('facilities.calendar.availabilityCard.regulations')}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {manage && removable ? (
                <div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busyDay !== null}
                    data-testid={`facilities-availability-remove-${String(day)}`}
                    onClick={() => {
                      onRemove(day)
                    }}
                  >
                    {t('facilities.calendar.availability.remove')}
                    <span className="sr-only"> {t(`facilities.weekdays.long.${String(day)}`)}</span>
                  </Button>
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>
      <p className="text-muted-foreground mt-2 text-xs">{t('facilities.calendar.availabilityCard.note')}</p>
    </details>
  )
}

/** "2 club groups at a time" in the locale's plural form. */
function capacityText(t: ReturnType<typeof useT>, locale: string, count: number): string {
  const form = new Intl.PluralRules(locale).select(count)
  const key = ['one', 'few', 'many'].includes(form) ? form : 'other'
  return t(`facilities.calendar.capacity.${key}`, { n: count })
}

function PlaceDay({
  place,
  placeId,
  date,
  onDate,
}: {
  place: PlaceOptionRow | null
  placeId: string
  date: string
  onDate: (date: string) => void
}) {
  const t = useT()
  const locale = useLocale()
  const queryClient = useQueryClient()
  const features = useCalendarFeatures()
  const placeOptions = usePlaceOptions()
  const clubZone = useClubTimeZone()
  const { confirm, ConfirmDialogElement } = useConfirmDialog()
  const today = useClubToday()
  const [toMove, setToMove] = React.useState(false)
  const [busyDay, setBusyDay] = React.useState<number | null>(null)
  const [result, setResult] = React.useState<BulkResult | null>(null)
  const [dialogKey, setDialogKey] = React.useState(0)
  const slotKinds = useSlotKinds()
  const [slotPreset, setSlotPreset] = React.useState<SlotPreset | null>(null)
  const [slotKey, setSlotKey] = React.useState(0)
  const [task, setTask] = React.useState<{ row: MaintenanceTaskRow; placeName: string; key: number } | null>(null)
  const filterId = React.useId()

  // The seven chip days are read once; "Other day" reads its day alone.
  const zone = clubZone ?? browserTimeZone()
  const inChips = date >= today && date < addDays(today, CHIP_DAYS)
  const window = React.useMemo(
    () =>
      inChips
        ? { from: dayWindow(today, zone).from, to: dayWindow(addDays(today, CHIP_DAYS - 1), zone).to, placeId }
        : { ...dayWindow(date, zone), placeId },
    [inChips, today, date, zone, placeId],
  )
  const query = useStaffCalendar(window)
  const rules = usePlaceZoneRules(placeId)
  const rows = rules.data?.items ?? []

  const calendar = query.data
  const timeZone = calendar?.timeZone ?? zone
  const shown = calendar?.places.find((entry) => entry.id === placeId) ?? null
  const day = calendar?.days.find((entry) => entry.date === date) ?? null
  const dayEntries = calendar ? entriesOfDay(calendar.entries, date, timeZone) : []
  const entries = toMove ? dayEntries.filter((entry) => entry.needsReschedule) : dayEntries
  const redacted = calendar?.maintenance?.redacted === true
  const canBook = slotKinds.kinds.length > 0 && !redacted
  const flagged = React.useMemo(() => {
    if (!toMove || !calendar || !inChips) return null
    return new Map(
      chipDates(today).map((chip) => [
        chip,
        entriesOfDay(calendar.entries, chip, timeZone).filter((entry) => entry.needsReschedule).length,
      ]),
    )
  }, [toMove, calendar, inChips, today, timeZone])
  const name = shown?.name ?? place?.name ?? ''
  const capacity = shown?.capacityGroups ?? place?.capacityGroups ?? 1
  const acceptsOnline = shown?.acceptsOnlineRequests ?? place?.acceptsOnlineRequests ?? false

  const refreshCalendar = () => queryClient.invalidateQueries({ queryKey: [PLACES_CALENDAR_KEY] })
  const refreshRules = () => queryClient.invalidateQueries({ queryKey: [ZONE_RULES_KEY] })

  const removeDay = async (weekday: number) => {
    const dayName = t(`facilities.weekdays.long.${String(weekday)}`)
    // The day the click happens in the club zone: the removal takes effect from it (#231).
    const from = clubToday(new Date(), clubZone)
    const confirmed = await confirm({
      title: t('facilities.calendar.availability.confirm.title', { day: dayName }),
      text: t('facilities.calendar.availability.confirm.text', { day: dayName, date: from }),
      confirmText: t('facilities.calendar.availability.remove'),
      cancelText: t('facilities.common.cancel'),
      variant: 'destructive',
    })
    if (!confirmed) return
    setBusyDay(weekday)
    try {
      await apiCallOrThrow<BulkResult>(
        ZONE_RULES_BULK_URL,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            placeIds: [placeId],
            mode: 'replace',
            weekdays: [weekday],
            windows: [],
            validFrom: from,
          }),
        },
        { errorMessage: t('facilities.availability.errors.save') },
      )
      setResult(null)
      flash(t('facilities.calendar.availability.removed', { day: dayName }), 'success')
    } catch (error: unknown) {
      flash(codedMessage(error, t) ?? errorMessage(error, t('facilities.availability.errors.save')), 'error')
    } finally {
      setBusyDay(null)
      await Promise.all([refreshRules(), refreshCalendar()])
    }
  }

  const cancelling = React.useRef(new Set<string>())
  const cancelBooking = async (entry: CalendarEntry) => {
    // A second click while the first cancellation runs would send the old version and answer 409.
    if (cancelling.current.has(entry.id)) return
    const label = entryLabel(t, entry)
    const confirmed = await confirm({
      title: t('facilities.places.cancel.title'),
      text: t('facilities.places.cancel.text', { label, time: entryRange(entry, timeZone) }),
      confirmText: t('facilities.places.cancel.confirm'),
      cancelText: t('facilities.places.cancel.keep'),
      variant: 'destructive',
    })
    if (!confirmed) return
    cancelling.current.add(entry.id)
    const outcome = await cancelInternalBooking(entry).finally(() => cancelling.current.delete(entry.id))
    if (outcome.ok) flash(t('facilities.places.cancel.done', { label }), 'success')
    else if (outcome.status === 409) flash(t('facilities.places.cancel.stale'), 'error')
    else if (outcome.status === 403) flash(t('facilities.places.errors.denied'), 'error')
    else flash(t('facilities.places.cancel.failed'), 'error')
    await refreshCalendar()
  }

  const openTask = async (entry: CalendarEntry) => {
    try {
      const list = await fetchCrudList<MaintenanceTaskRow>(MAINTENANCE_API, {
        placeId: entry.placeId,
        status: 'planned',
        pageSize: 100,
      })
      const row = list.items.find((item) => item.id === entry.id)
      if (!row) {
        flash(t('facilities.calendar.errors.taskGone'), 'error')
        await refreshCalendar()
        return
      }
      setTask((current) => ({ row, placeName: entry.placeName ?? name, key: (current?.key ?? 0) + 1 }))
    } catch (error: unknown) {
      flash(errorMessage(error, t('facilities.calendar.errors.task')), 'error')
    }
  }

  const of = (entry: CalendarEntry) => (
    <span className="sr-only">
      {' '}
      {t('facilities.places.cancel.of', { label: entryLabel(t, entry, redacted), time: entryRange(entry, timeZone) })}
    </span>
  )
  const actionOf = (entry: CalendarEntry): React.ReactNode => {
    if (redacted) return null
    if (entry.kind === 'booking' && (entry.own || entry.canCancel)) {
      return (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void cancelBooking(entry)}
          data-testid={`facilities-day-entry-cancel-${entry.id}`}
        >
          {t('facilities.places.cancel.action')}
          {of(entry)}
        </Button>
      )
    }
    if (entry.kind === 'rental' && entry.canOpen) {
      return (
        <Button asChild variant="outline" size="sm">
          <Link href={RENTALS_HREF} data-testid={`facilities-day-entry-open-${entry.id}`}>
            {t('facilities.calendar.actions.openRental')}
            {of(entry)}
          </Link>
        </Button>
      )
    }
    if (entry.kind === 'request' && features.approve) {
      return (
        <Button asChild variant="outline" size="sm">
          <Link href={REQUESTS_HREF} data-testid={`facilities-day-entry-decide-${entry.id}`}>
            {t('facilities.calendar.actions.decide')}
            {of(entry)}
          </Link>
        </Button>
      )
    }
    if (entry.kind === 'closure') {
      return (
        <Button asChild variant="outline" size="sm">
          <Link href={CLOSURES_HREF} data-testid={`facilities-day-entry-closures-${entry.id}`}>
            {t('facilities.calendar.actions.closures')}
            {of(entry)}
          </Link>
        </Button>
      )
    }
    if (entry.kind === 'maintenance' && features.maintenance) {
      return (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void openTask(entry)}
          data-testid={`facilities-day-entry-task-${entry.id}`}
        >
          {t('facilities.calendar.actions.task')}
          {of(entry)}
        </Button>
      )
    }
    return null
  }

  let body: React.ReactNode
  if (!calendar && query.isFetching) {
    body = (
      <Skeleton
        className="h-96 w-full"
        aria-label={t('facilities.calendar.loading')}
        data-testid="facilities-calendar-loading"
      />
    )
  } else if (!calendar && calendarErrorStatus(query.error) === 403) {
    body = (
      <Alert status="warning" data-testid="facilities-calendar-denied">
        <AlertDescription>{t('facilities.calendar.errors.forbidden')}</AlertDescription>
      </Alert>
    )
  } else if (!calendar) {
    body = (
      <ErrorMessage
        label={t('facilities.calendar.errors.load')}
        action={
          <Button type="button" variant="outline" onClick={() => void query.refetch()}>
            {t('facilities.calendar.retry')}
          </Button>
        }
      />
    )
  } else {
    body = (
      <>
        {rules.isSuccess && rows.length === 0 ? (
          <Alert status="information" data-testid="facilities-calendar-empty">
            <AlertDescription className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span>{t('facilities.calendar.empty')}</span>
              {features.manage ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={ZONES_HREF}>{t('facilities.calendar.empty.action')}</Link>
                </Button>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}
        <DayAxis
          date={date}
          timeZone={timeZone}
          day={day}
          entries={entries}
          occupying={dayEntries}
          today={today}
          nowMinutes={zoneWallTime(new Date(), timeZone).minutes}
          redacted={redacted}
          canBook={canBook}
          onBookHour={(time) => {
            const minute = minutesOf(time)
            const opening = day?.opening?.map((window) => ({ from: minutesOf(window.from), to: minutesOf(window.to) }))
            const zones = (day?.zones ?? []).map((zone) => ({
              from: minutesOf(zone.from),
              to: minutesOf(zone.to),
              zone: zone.zone,
            }))
            const closing = closingAfter(opening ?? null, minute)
            setSlotKey((current) => current + 1)
            setSlotPreset({
              placeId,
              placeName: name,
              date,
              time,
              zone: zoneAtMinute(zones, minute),
              closing: closing === null ? null : timeOf(closing),
              heldRequests: dayEntries.filter((entry) => entry.kind === 'request'),
            })
          }}
        />
        <DayEntries
          entries={entries}
          timeZone={timeZone}
          placeId={placeId}
          redacted={redacted}
          filtered={toMove}
          actionOf={actionOf}
        />
      </>
    )
  }

  return (
    <>
      {features.manage ? (
        <div className="flex justify-end">
          <Button
            type="button"
            data-testid="facilities-availability-open"
            onClick={() => {
              setDialogKey((current) => current + 1)
            }}
          >
            {t('facilities.availability.open')}
          </Button>
        </div>
      ) : null}
      {result ? <SaveSummary result={result} /> : null}
      {rules.isSuccess ? (
        <AvailabilityCard
          rows={rows}
          acceptsOnline={acceptsOnline}
          manage={features.manage}
          busyDay={busyDay}
          onRemove={(weekday) => void removeDay(weekday)}
        />
      ) : null}
      <nav aria-label={t('facilities.calendar.links.label')} className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <Link href={ZONES_HREF} className="text-primary underline" data-testid="facilities-calendar-zones-link">
          {t('facilities.calendar.links.zones')}
        </Link>
        {features.places ? (
          <Link
            href={placeSettingsHref(placeId)}
            className="text-primary underline"
            data-testid="facilities-calendar-place-link"
          >
            {t('facilities.calendar.links.place')}
          </Link>
        ) : null}
      </nav>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold break-words" data-testid="facilities-calendar-place-name">
            {name}
          </h2>
          <p className="text-muted-foreground text-sm" aria-live="polite" data-testid="facilities-calendar-day-heading">
            {formatDayHeading(date, locale)} · {capacityText(t, locale, capacity)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id={filterId}
            checked={toMove}
            onCheckedChange={(value) => {
              setToMove(value === true)
            }}
            data-testid="facilities-calendar-to-move"
          />
          <Label htmlFor={filterId}>{t('facilities.calendar.toMove')}</Label>
        </div>
      </div>
      <DayChips today={today} date={date} onSelect={onDate} flagged={flagged} />
      {canBook ? <p className="text-muted-foreground text-sm">{t('facilities.calendar.clickHint')}</p> : null}
      {body}
      {features.manage && dialogKey > 0 ? (
        <AvailabilityDialog
          key={dialogKey}
          open
          onOpenChange={(open) => {
            if (!open) setDialogKey(0)
          }}
          places={placeOptions.options}
          initialPlaceId={placeId}
          onSaved={async (saved) => {
            setResult(saved)
            flash(t('facilities.availability.saved.title'), 'success')
            await Promise.all([refreshRules(), refreshCalendar()])
          }}
        />
      ) : null}
      {canBook && slotPreset ? (
        <SlotDialog
          key={slotKey}
          open
          onOpenChange={(open) => {
            if (!open) setSlotPreset(null)
          }}
          kinds={slotKinds.kinds}
          groups={slotKinds.groups}
          preset={slotPreset}
          places={placeOptions.options}
          onSaved={async () => {
            await Promise.all([queryClient.invalidateQueries({ queryKey: [RENTALS_KEY] }), refreshCalendar()])
          }}
        />
      ) : null}
      {task ? (
        <MaintenanceTaskDialog
          key={task.key}
          open
          onOpenChange={(open) => {
            if (!open) setTask(null)
          }}
          places={[{ value: task.row.placeId, label: task.placeName }]}
          task={task.row}
          toInstant={(local) => zonedLocalInstant(local, timeZone)}
          toLocal={(iso) => zonedLocalValue(iso, timeZone)}
          windowHelp={t('facilities.maintenance.plan.zone', { zone: timeZone })}
          onRefresh={() => void refreshCalendar()}
          onSaved={async (saved) => {
            flashFlagged(t, saved, t('facilities.calendar.taskSaved'))
            await refreshCalendar()
          }}
        />
      ) : null}
      {ConfirmDialogElement}
    </>
  )
}

export function FacilityCalendar() {
  const t = useT()
  const router = useRouter()
  const searchParams = useSearchParams()
  const today = useClubToday()
  const features = useCalendarFeatures()
  const placeRows = usePlaceRows()
  const all = placeRows.data ?? []
  const bookable = all
    .filter(isBookablePlace)
    .sort((a, b) => (a.parentName ?? '').localeCompare(b.parentName ?? '') || a.name.localeCompare(b.name))
  const requestedPlace = searchParams.get('place')
  const requestedDate = searchParams.get('date')
  const placeId = requestedPlace || (bookable.at(0)?.id ?? null)
  const date = requestedDate && isCalendarDate(requestedDate) ? requestedDate : today
  const place = all.find((row) => row.id === placeId) ?? null
  // A place named in the address but not bookable (a parent, an external hall) keeps its chip while it is shown.
  const chips = place && !bookable.includes(place) ? [...bookable, place] : bookable

  // The address always names the place and the day shown, without a new history entry.
  React.useEffect(() => {
    if (!placeId || (requestedPlace === placeId && requestedDate === date)) return
    router.replace(calendarHref(placeId, date))
  }, [placeId, date, requestedPlace, requestedDate, router])

  let body: React.ReactNode
  if (placeRows.isPending && !requestedPlace) {
    body = (
      <Skeleton
        className="h-96 w-full"
        aria-label={t('facilities.calendar.loading')}
        data-testid="facilities-calendar-loading"
      />
    )
  } else if (placeRows.isError && !requestedPlace) {
    body = (
      <ErrorMessage
        label={t('facilities.calendar.errors.places')}
        action={
          <Button type="button" variant="outline" onClick={() => void placeRows.refetch()}>
            {t('facilities.calendar.retry')}
          </Button>
        }
      />
    )
  } else if (!placeId) {
    body = (
      <section className="flex flex-col gap-3 rounded-md border p-4" data-testid="facilities-calendar-no-places">
        <p className="text-sm">{t('facilities.calendar.noPlaces')}</p>
        {features.places ? (
          <div>
            <Button asChild variant="outline">
              <Link href={PLACE_CREATE_HREF}>{t('facilities.calendar.addPlace')}</Link>
            </Button>
          </div>
        ) : null}
      </section>
    )
  } else {
    body = (
      <>
        {chips.length > 0 ? (
          <ChipRow
            label={t('facilities.calendar.placeChips')}
            chips={chips.map((row) => ({ value: row.id, label: row.name }))}
            current={placeId}
            onSelect={(next) => {
              router.replace(calendarHref(next, date))
            }}
            testId="facilities-calendar-place"
          />
        ) : null}
        <PlaceDay
          key={placeId}
          place={place}
          placeId={placeId}
          date={date}
          onDate={(next) => {
            router.replace(calendarHref(placeId, next))
          }}
        />
      </>
    )
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t('facilities.calendar.title')}</h1>
        <p className="text-muted-foreground text-sm">{t('facilities.calendar.subtitle')}</p>
      </div>
      {body}
    </div>
  )
}
