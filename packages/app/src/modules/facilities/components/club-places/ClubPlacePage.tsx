'use client'
// `/club/places/[placeId]` — one place's day (README M-11; REQ-023, REQ-027; #123): the day picker (previous and
// next day, a date input; the arrow keys move the day), the 08:00–22:00 timeline of the chosen day in the club's
// time zone with its zones and blocks and a text legend, and — for a user with `facilities.bookings.create` — the
// booking range (from / to; picking a free segment fills it) with "Book", which opens the booking dialog. A booking
// the user may cancel shows "Cancel" (with a confirmation; the booking's version travels as the lock token). States:
// a timeline skeleton while loading, an error with retry, and "no zone rules" when the day has none.
import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { useConfirmDialog } from '@open-mercato/ui/backend/confirm-dialog'
import { ErrorMessage } from '@open-mercato/ui/backend/detail'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { Alert } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Skeleton } from '@open-mercato/ui/primitives/skeleton'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { addDays, calendarDateInZone, isCalendarDate, isLocalTime } from '@vereino/core'
import { formatDayHeading } from '@vereino/ui'
import { BookDialog } from './BookDialog'
import { FacilitiesClubFrame, type PlacesProfile } from './FacilitiesClubFrame'
import { PlaceTimeline, TimelineLegend } from './PlaceTimeline'
import {
  CLUB_PLACES_HREF,
  PLACES_CALENDAR_KEY,
  cancelInternalBooking,
  compactRange,
  dayWindow,
  daySegments,
  entriesOfDay,
  entryLabel,
  entryRange,
  placeHref,
  shortWeekday,
  usePlacesFeatures,
  useStaffCalendar,
  type CalendarEntry,
} from './places-client'

function TimelineSkeleton({ label }: { label: string }) {
  return (
    <div className="flex flex-col gap-2" aria-busy="true" data-testid="club-place-loading">
      <span className="sr-only">{label}</span>
      {[0, 1, 2, 3, 4].map((index) => (
        <Skeleton key={index} className="h-16 w-full" />
      ))}
    </div>
  )
}

function PlaceDay({ profile, placeId }: { profile: PlacesProfile; placeId: string }) {
  const t = useT()
  const locale = useLocale()
  const router = useRouter()
  const searchParams = useSearchParams()
  const queryClient = useQueryClient()
  const features = usePlacesFeatures()
  const { confirm, ConfirmDialogElement } = useConfirmDialog()
  const id = React.useId()
  const zone = profile.club.timezone
  const requested = searchParams.get('date')
  const date = requested && isCalendarDate(requested) ? requested : calendarDateInZone(new Date(), zone)
  const window = React.useMemo(() => ({ ...dayWindow(date, zone), placeId }), [date, zone, placeId])
  const query = useStaffCalendar(window)
  const [from, setFrom] = React.useState('')
  const [to, setTo] = React.useState('')
  const [rangeProblem, setRangeProblem] = React.useState<string | null>(null)
  const [dialogOpen, setDialogOpen] = React.useState(false)

  const goTo = (next: string) => {
    if (!isCalendarDate(next)) return
    setFrom('')
    setTo('')
    setRangeProblem(null)
    router.replace(placeHref(placeId, next))
  }

  // On the day buttons the left and right arrow keys move the day (the date input keeps its own arrow keys).
  const moveByArrow = (event: React.KeyboardEvent) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    goTo(addDays(date, event.key === 'ArrowLeft' ? -1 : 1))
  }

  const refresh = () => queryClient.invalidateQueries({ queryKey: [PLACES_CALENDAR_KEY] })

  const calendar = query.data
  const timeZone = calendar?.timeZone ?? zone
  const place = calendar?.places.find((entry) => entry.id === placeId) ?? null
  const day = calendar?.days.find((entry) => entry.date === date) ?? null
  const entries = calendar ? entriesOfDay(calendar.entries, date, timeZone) : []
  const segments = calendar ? daySegments(day, entries, date, timeZone) : []

  const openBooking = () => {
    if (!isLocalTime(from) || !isLocalTime(to)) {
      setRangeProblem(t('facilities.places.range.required'))
      return
    }
    if (to <= from) {
      setRangeProblem(t('facilities.places.range.endBeforeStart'))
      return
    }
    setRangeProblem(null)
    setDialogOpen(true)
  }

  const onBooked = () => {
    setDialogOpen(false)
    flash(
      t('facilities.places.booked', {
        when: `${shortWeekday(date, locale)} ${compactRange(from, to)}`,
        place: place?.name ?? '',
      }),
      'success',
    )
    setFrom('')
    setTo('')
    void refresh()
  }

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
    body = <TimelineSkeleton label={t('facilities.places.loading')} />
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
          <Alert status="information" data-testid="club-place-no-zones">
            <p className="max-w-prose">{t('facilities.places.noZones')}</p>
          </Alert>
        ) : null}
        <PlaceTimeline
          segments={segments}
          timeZone={timeZone}
          placeId={placeId}
          places={calendar.places}
          selected={from && to ? { from, to } : null}
          canBook={features.book}
          onPick={(nextFrom, nextTo) => {
            setFrom(nextFrom)
            setTo(nextTo)
            setRangeProblem(null)
            document.getElementById(`${id}-from`)?.focus()
          }}
          onCancel={(entry) => void cancel(entry)}
        />
        <TimelineLegend />
      </>
    )
  }

  return (
    <>
      <Link href={CLUB_PLACES_HREF} className="text-primary inline-flex min-h-11 items-center text-sm underline">
        {t('facilities.places.back')}
      </Link>
      <h1 className="text-2xl font-semibold break-words" data-testid="club-place-title">
        {place?.name ?? t('facilities.places.title')}
      </h1>
      {place?.parentName ? <p className="text-muted-foreground text-sm break-words">{place.parentName}</p> : null}
      <nav
        aria-label={t('facilities.places.day.label')}
        className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end"
        data-testid="club-place-day-picker"
      >
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => {
              goTo(addDays(date, -1))
            }}
            onKeyDown={moveByArrow}
            data-testid="club-place-day-prev"
          >
            {t('facilities.places.day.previous')}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => {
              goTo(addDays(date, 1))
            }}
            onKeyDown={moveByArrow}
            data-testid="club-place-day-next"
          >
            {t('facilities.places.day.next')}
          </Button>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`${id}-date`}>{t('facilities.places.day.date')}</Label>
          <Input
            id={`${id}-date`}
            type="date"
            className="min-h-11"
            value={date}
            onChange={(event) => {
              goTo(event.target.value)
            }}
            data-testid="club-place-date"
          />
        </div>
      </nav>
      <h2 className="text-lg font-semibold" aria-live="polite" data-testid="club-place-day-heading">
        {formatDayHeading(date, locale)}
      </h2>
      <p className="text-muted-foreground text-sm">{t('facilities.places.day.zone', { zone: timeZone })}</p>
      {features.book && calendar && place ? (
        <section
          aria-labelledby={`${id}-range`}
          className="flex flex-col gap-2 rounded-md border p-3"
          data-testid="club-place-range"
        >
          <h2 id={`${id}-range`} className="text-sm font-medium">
            {t('facilities.places.range.title')}
          </h2>
          <p className="text-muted-foreground text-xs">{t('facilities.places.range.help')}</p>
          <div className="grid grid-cols-2 gap-3 sm:flex sm:items-end">
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${id}-from`}>{t('facilities.places.range.from')}</Label>
              <Input
                id={`${id}-from`}
                type="time"
                className="min-h-11"
                value={from}
                aria-invalid={rangeProblem ? true : undefined}
                aria-describedby={rangeProblem ? `${id}-range-problem` : undefined}
                onChange={(event) => {
                  setFrom(event.target.value)
                }}
                data-testid="club-place-from"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${id}-to`}>{t('facilities.places.range.to')}</Label>
              <Input
                id={`${id}-to`}
                type="time"
                className="min-h-11"
                value={to}
                aria-invalid={rangeProblem ? true : undefined}
                aria-describedby={rangeProblem ? `${id}-range-problem` : undefined}
                onChange={(event) => {
                  setTo(event.target.value)
                }}
                data-testid="club-place-to"
              />
            </div>
            <Button type="button" className="col-span-2 min-h-11" onClick={openBooking} data-testid="club-place-book">
              {t('facilities.places.book.open')}
            </Button>
          </div>
          {rangeProblem ? (
            <p id={`${id}-range-problem`} className="text-destructive text-sm" role="alert">
              {rangeProblem}
            </p>
          ) : null}
        </section>
      ) : null}
      {body}
      {dialogOpen && place ? (
        <BookDialog
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          place={place}
          date={date}
          from={from}
          to={to}
          timeZone={timeZone}
          groupEvents={features.groupEvents}
          onBooked={onBooked}
        />
      ) : null}
      {ConfirmDialogElement}
    </>
  )
}

export function ClubPlacePage({ placeId }: { placeId: string }) {
  return <FacilitiesClubFrame>{(profile) => <PlaceDay profile={profile} placeId={placeId} />}</FacilitiesClubFrame>
}
