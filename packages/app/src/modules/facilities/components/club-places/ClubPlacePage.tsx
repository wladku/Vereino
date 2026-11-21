'use client'
// `/club/places/[placeId]?date=` — one place's day on the phone (README M-11; facilities parity spec REQ-R12, J-R03;
// #278): the name, the long date and the capacity; the seven day chips from today with "Other day" (DD-R03; the day
// lives in the address); the hint; the day axis (`DayAxis`, DD-R01) in the club's time zone. One tap on a free hour
// opens the slot dialog (`SlotDialog`, #277) with the kinds the user may save (DD-R04: a coach with groups starts on
// "For a group"); without any kind the hours are not buttons. "Wpisy dnia" repeats every entry as text; a tap on an
// entry (its line, or its block on the axis) opens the details sheet (`EntryDetails`), where an own booking is
// cancelled after a confirmation (the booking's version travels as the lock token). States: an axis skeleton while
// loading, an error with retry, a permission-denied state (403), "no zone rules" when the day has none and the axis's
// own closed-day line. Planned maintenance (#128): a user who may plan on the place (`maintenance.canPlan`, the place
// among `planPlaceIds` or every place) gets "Plan maintenance"; a place maintainer without `facilities.view` reads the
// day redacted and cannot book.
import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { useConfirmDialog } from '@open-mercato/ui/backend/confirm-dialog'
import { ErrorMessage } from '@open-mercato/ui/backend/detail'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { Alert } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import { Checkbox } from '@open-mercato/ui/primitives/checkbox'
import { Label } from '@open-mercato/ui/primitives/label'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { calendarDateInZone, isCalendarDate } from '@vereino/core'
import { formatDayHeading, MemberSkeleton, Notice } from '@vereino/ui'
import { MaintenanceTaskDialog } from '../MaintenanceTaskDialog'
import { flashFlagged } from '../maintenance-client'
import { RENTALS_KEY } from '../rentals-client'
import { isToMoveView } from '../../lib/reschedule-notice'
import { DayAxis } from '../day-axis/DayAxis'
import { DayChips } from '../day-axis/DayChips'
import { DayEntries } from '../day-axis/DayEntries'
import { SlotDialog, slotPresetAt, type SlotPreset } from '../slot/SlotDialog'
import { useSlotKinds } from '../slot/slot-client'
import { EntryDetails } from './EntryDetails'
import { FacilitiesClubFrame, type PlacesProfile } from './FacilitiesClubFrame'
import {
  CLUB_PLACES_HREF,
  PLACES_CALENDAR_KEY,
  calendarErrorStatus,
  canPlanMaintenance,
  cancelInternalBooking,
  capacityText,
  dayWindow,
  entriesOfDay,
  entryLabel,
  entryRange,
  placeHref,
  useStaffCalendar,
  zoneWallTime,
  zonedLocalInstant,
  zonedLocalValue,
  type CalendarEntry,
} from './places-client'

function PlaceDay({ profile, placeId }: { profile: PlacesProfile; placeId: string }) {
  const t = useT()
  const locale = useLocale()
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const slotKinds = useSlotKinds()
  const { confirm, ConfirmDialogElement } = useConfirmDialog()
  const zone = profile.club.timezone
  const today = calendarDateInZone(new Date(), zone)
  const requested = searchParams.get('date')
  const date = requested && isCalendarDate(requested) ? requested : today
  // `view=to_move` (the reschedule notice's link, AC-R14; #287): the day's list shows only the entries to be moved.
  const toMove = isToMoveView(searchParams.get('view'))
  const filterId = React.useId()
  const window = React.useMemo(() => ({ ...dayWindow(date, zone), placeId }), [date, zone, placeId])
  const query = useStaffCalendar(window)
  const [slotPreset, setSlotPreset] = React.useState<SlotPreset | null>(null)
  const [slotKey, setSlotKey] = React.useState(0)
  const [details, setDetails] = React.useState<CalendarEntry | null>(null)
  const [planKey, setPlanKey] = React.useState(0)

  const dayHref = (next: string, filtered: boolean) =>
    filtered ? `${placeHref(placeId, next)}&view=to_move` : placeHref(placeId, next)

  const goTo = (next: string) => {
    if (!isCalendarDate(next)) return
    router.replace(dayHref(next, toMove))
  }

  const refresh = () => queryClient.invalidateQueries({ queryKey: [PLACES_CALENDAR_KEY] })

  const calendar = query.data
  const timeZone = calendar?.timeZone ?? zone
  const place = calendar?.places.find((entry) => entry.id === placeId) ?? null
  const day = calendar?.days.find((entry) => entry.date === date) ?? null
  const entries = calendar ? entriesOfDay(calendar.entries, date, timeZone) : []
  const redacted = calendar?.maintenance?.redacted === true
  const canBook = slotKinds.kinds.length > 0 && !redacted
  const canPlan = calendar ? canPlanMaintenance(calendar, placeId) : false
  const name = place?.name ?? ''

  const cancelling = React.useRef(new Set<string>())
  const cancel = async (entry: CalendarEntry) => {
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
    const result = await cancelInternalBooking(entry).finally(() => cancelling.current.delete(entry.id))
    if (result.ok) flash(t('facilities.places.cancel.done', { label }), 'success')
    else if (result.status === 409) flash(t('facilities.places.cancel.stale'), 'error')
    else if (result.status === 403) flash(t('facilities.places.errors.denied'), 'error')
    else flash(t('facilities.places.cancel.failed'), 'error')
    await refresh()
  }

  let body: React.ReactNode
  if (!calendar && query.isFetching) {
    body = <MemberSkeleton shape="rows" label={t('facilities.places.loading')} data-testid="club-place-loading" />
  } else if (!calendar && calendarErrorStatus(query.error) === 403) {
    body = (
      <Alert style="light" status="warning" data-testid="club-place-denied">
        <p className="max-w-prose">{t('facilities.places.errors.forbidden')}</p>
      </Alert>
    )
  } else if (!calendar) {
    body = (
      <ErrorMessage
        label={t('facilities.places.errors.loadPlace')}
        action={
          <Button type="button" variant="outline" className="min-h-11" onClick={() => void query.refetch()}>
            {t('facilities.places.retry')}
          </Button>
        }
      />
    )
  } else {
    body = (
      <>
        {!day || day.zones.length === 0 ? (
          <Notice data-testid="club-place-no-zones">
            <p className="max-w-prose">{t('facilities.places.noZones')}</p>
          </Notice>
        ) : null}
        <DayAxis
          date={date}
          timeZone={timeZone}
          day={day}
          entries={entries}
          today={today}
          nowMinutes={zoneWallTime(new Date(), timeZone).minutes}
          redacted={redacted}
          canBook={canBook}
          onBookHour={(time) => {
            setSlotKey((current) => current + 1)
            setSlotPreset(slotPresetAt({ placeId, placeName: name, date, time, day, entries }))
          }}
          onEntry={setDetails}
        />
        <DayEntries
          entries={toMove ? entries.filter((entry) => entry.needsReschedule) : entries}
          filtered={toMove}
          timeZone={timeZone}
          placeId={placeId}
          redacted={redacted}
          onOpen={setDetails}
        />
      </>
    )
  }

  return (
    <>
      <Link href={CLUB_PLACES_HREF} className="text-primary inline-flex min-h-11 items-center text-sm underline">
        {t('facilities.places.back')}
      </Link>
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="text-2xl font-semibold break-words" data-testid="club-place-title">
          {place?.name ?? t('facilities.places.title')}
        </h1>
        {place?.parentName ? <p className="text-muted-foreground text-sm break-words">{place.parentName}</p> : null}
        <p className="text-muted-foreground text-sm" aria-live="polite" data-testid="club-place-day-heading">
          {formatDayHeading(date, locale)}
          {place ? ` · ${capacityText(t, locale, place.capacityGroups)}` : null}
        </p>
      </div>
      <DayChips today={today} date={date} onSelect={goTo} />
      <div className="flex min-h-11 items-center gap-2">
        <Checkbox
          id={filterId}
          checked={toMove}
          onCheckedChange={(value) => {
            router.replace(dayHref(date, value === true))
          }}
          data-testid="club-place-to-move"
        />
        <Label htmlFor={filterId}>{t('facilities.places.toMoveFilter')}</Label>
      </div>
      {canBook ? (
        <p className="text-muted-foreground text-sm" data-testid="club-place-hint">
          {t('facilities.places.clickHint')}
        </p>
      ) : null}
      {canPlan && place ? (
        <div>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => {
              setPlanKey((current) => current + 1)
            }}
            data-testid="club-place-plan-maintenance"
          >
            {t('facilities.maintenance.actions.plan')}
          </Button>
        </div>
      ) : null}
      {body}
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
          places={[]}
          onSaved={async () => {
            await Promise.all([queryClient.invalidateQueries({ queryKey: [RENTALS_KEY] }), refresh()])
          }}
        />
      ) : null}
      {details ? (
        <EntryDetails
          entry={details}
          date={date}
          timeZone={timeZone}
          placeName={name}
          redacted={redacted}
          onOpenChange={(open) => {
            if (!open) setDetails(null)
          }}
          onCancel={(entry) => {
            // The confirmation replaces the sheet rather than stacking a second dialog on it.
            setDetails(null)
            void cancel(entry)
          }}
        />
      ) : null}
      {planKey > 0 && place ? (
        <MaintenanceTaskDialog
          key={planKey}
          open
          onOpenChange={(open) => {
            if (!open) setPlanKey(0)
          }}
          places={[{ value: place.id, label: place.name }]}
          windowOnly
          initialWindow={{ startsAt: `${date}T08:00`, endsAt: `${date}T10:00` }}
          toInstant={(local) => zonedLocalInstant(local, timeZone)}
          toLocal={(iso) => zonedLocalValue(iso, timeZone)}
          windowHelp={t('facilities.maintenance.plan.zone', { zone: timeZone })}
          testId="club-place-maintenance-dialog"
          onSaved={async (result) => {
            flashFlagged(t, result, t('facilities.maintenance.flash.planned'))
            await refresh()
          }}
        />
      ) : null}
      {ConfirmDialogElement}
    </>
  )
}

export function ClubPlacePage({ placeId }: { placeId: string }) {
  return <FacilitiesClubFrame>{(profile) => <PlaceDay profile={profile} placeId={placeId} />}</FacilitiesClubFrame>
}
