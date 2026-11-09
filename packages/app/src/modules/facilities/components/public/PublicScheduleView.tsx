'use client'
// `/p/[clubSlug]/places/[placeSlug]?month=YYYY-MM` — one facility's public month (facilities spec P-04, REQ-014,
// glossary *Public facility calendar*; #124). The month is a list of days on a phone and a month grid from `md` up;
// every stretch of a day is written as its time and a state label ("Taken by the club", "Booked", "Requested —
// pending", "Closed", "Unavailable" for planned maintenance work — #128, …), and a text legend explains the states —
// colour is only an extra cue from the status tokens.
// "Earlier" and "Later" move a month within the readable range and keep it in the URL, so a QR code or a permalink
// opens the same month. Below the month: the opening hours, the rates per 90 minutes, the rules, the club phone and
// the photos — only what the API sends, never a name of a renter, a group or a person. A bookable stretch that a guest
// could request offers "Request a booking", which opens the request dialog (P-04, E08-S05 #125).
// States: loading, error with retry, 404, "the club does not share facility calendars", a month that cannot be shown,
// and a month without any published stretch.
import * as React from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Button } from '@open-mercato/ui/primitives/button'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { PublicRequestDialog, type RequestTarget } from './PublicRequestDialog'
import {
  PublicFacilitiesDisabled,
  PublicFacilitiesError,
  PublicFacilitiesFrame,
  PublicFacilitiesLoading,
  PublicFacilitiesNotice,
} from './PublicFacilitiesFrame'
import {
  LEGEND_STATES,
  STATE_TONE,
  TONE_CLASSES,
  clubHref,
  dayHasContent,
  formatAmount,
  formatDayHeading,
  formatMonth,
  formatMonthDay,
  isAllDay,
  isoWeekday,
  monthParam,
  phoneHref,
  placeHref,
  placesHref,
  timeRange,
  usePublicSchedule,
  weekdayName,
  type OpeningHours,
  type PublicScheduleDay,
  type PublicScheduleView as ScheduleView,
  type PublicSlot,
  type PublicSlotState,
} from './public-client'

const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const

/** Opens the request dialog for a slot of a day; null while the place takes no requests. */
const RequestContext = React.createContext<((target: RequestTarget) => void) | null>(null)

function StateLabel({ state }: { state: PublicSlotState }) {
  const t = useT()
  return (
    <span
      className={`inline-flex items-center rounded-sm border px-1.5 text-xs font-medium ${TONE_CLASSES[STATE_TONE[state]]}`}
      data-state={state}
    >
      {t(`facilities.public.state.${state}`)}
    </span>
  )
}

function SlotLine({ date, slot, compact = false }: { date: string; slot: PublicSlot; compact?: boolean }) {
  const t = useT()
  const locale = useLocale()
  const request = React.useContext(RequestContext)
  const range = isAllDay(slot) ? t('facilities.public.schedule.allDay') : timeRange(slot)
  return (
    <li className={`flex flex-wrap items-center gap-x-2 gap-y-1 ${compact ? 'text-xs' : 'text-sm'}`}>
      <span className="tabular-nums">{range}</span>
      <StateLabel state={slot.state} />
      {slot.canRequest && request ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={compact ? 'h-auto min-h-6 px-1.5 py-0.5 text-xs' : 'min-h-11 sm:min-h-8'}
          aria-label={t('facilities.public.request.open.label', {
            slot: `${formatDayHeading(date, locale)}, ${range}`,
          })}
          data-testid={`public-request-open-${date}-${slot.from.replace(':', '')}`}
          onClick={() => {
            request({ date, slot })
          }}
        >
          {compact ? t('facilities.public.request.open.short') : t('facilities.public.request.open')}
        </Button>
      ) : null}
      {slot.canRequest && !request && !compact ? (
        <span className="text-muted-foreground text-xs">{t('facilities.public.schedule.canRequest')}</span>
      ) : null}
    </li>
  )
}

function ClosedAllDay({ compact = false }: { compact?: boolean }) {
  const t = useT()
  return (
    <p className={`flex items-center gap-2 ${compact ? 'text-xs' : 'text-sm'}`}>
      <span className={`inline-flex items-center rounded-sm border px-1.5 text-xs font-medium ${TONE_CLASSES.error}`}>
        {t('facilities.public.schedule.closedAllDay')}
      </span>
    </p>
  )
}

function DayContent({ day, compact = false }: { day: PublicScheduleDay; compact?: boolean }) {
  if (day.opening !== null && day.opening.length === 0 && day.slots.length === 0) {
    return <ClosedAllDay compact={compact} />
  }
  return (
    <ul className="flex flex-col gap-1">
      {day.slots.map((slot) => (
        <SlotLine key={`${slot.from}-${slot.to}-${slot.state}`} date={day.date} slot={slot} compact={compact} />
      ))}
    </ul>
  )
}

/** The month on a phone: the days with something to show, one after another. */
function DayList({ days }: { days: PublicScheduleDay[] }) {
  const t = useT()
  const locale = useLocale()
  const shown = days.filter(dayHasContent)
  return (
    <div className="flex flex-col gap-2 md:hidden" data-testid="public-schedule-list">
      <ol className="flex flex-col gap-3">
        {shown.map((day) => (
          <li
            key={day.date}
            className="bg-card flex flex-col gap-2 rounded-lg border p-3"
            data-testid={`public-schedule-day-${day.date}`}
          >
            <h3 className="font-medium">{formatDayHeading(day.date, locale)}</h3>
            <DayContent day={day} />
          </li>
        ))}
      </ol>
      <p className="text-muted-foreground text-sm">{t('facilities.public.schedule.listHint')}</p>
    </div>
  )
}

/** The month from `md` up: weeks from Monday, each day with its stretches written out. */
function MonthGrid({ days }: { days: PublicScheduleDay[] }) {
  const locale = useLocale()
  const leading = days.length > 0 ? isoWeekday(days[0].date) - 1 : 0
  return (
    <div className="hidden md:block" data-testid="public-schedule-grid">
      <div aria-hidden="true" className="text-muted-foreground grid grid-cols-7 gap-1 pb-1 text-xs font-medium">
        {WEEKDAYS.map((weekday) => (
          <span key={weekday} className="px-1">
            {weekdayName(weekday, locale)}
          </span>
        ))}
      </div>
      <ol className="grid grid-cols-7 gap-1">
        {Array.from({ length: leading }, (_unused, index) => (
          <li key={`blank-${String(index)}`} aria-hidden="true" />
        ))}
        {days.map((day) => (
          <li
            key={day.date}
            className={`flex min-h-24 flex-col gap-1 rounded-md border p-1.5 ${dayHasContent(day) ? 'bg-card' : 'bg-muted'}`}
            data-testid={`public-schedule-cell-${day.date}`}
          >
            <span className="text-sm font-medium">
              <span aria-hidden="true">{Number(day.date.slice(8))}</span>
              <span className="sr-only">{formatDayHeading(day.date, locale)}</span>
            </span>
            {dayHasContent(day) ? <DayContent day={day} compact /> : null}
          </li>
        ))}
      </ol>
    </div>
  )
}

function Legend() {
  const t = useT()
  return (
    <section
      className="flex flex-col gap-2"
      aria-labelledby="public-schedule-legend"
      data-testid="public-schedule-legend"
    >
      <h2 id="public-schedule-legend" className="text-lg font-semibold">
        {t('facilities.public.legend.title')}
      </h2>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {LEGEND_STATES.map((state) => (
          <li key={state} className="flex flex-wrap items-baseline gap-2 text-sm">
            <StateLabel state={state} />
            <span className="text-muted-foreground">{t(`facilities.public.state.${state}.help`)}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Block({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2" aria-labelledby={`public-block-${id}`} data-testid={`public-block-${id}`}>
      <h2 id={`public-block-${id}`} className="text-lg font-semibold">
        {title}
      </h2>
      {children}
    </section>
  )
}

function OpeningHoursBlock({ hours }: { hours: OpeningHours | null }) {
  const t = useT()
  const locale = useLocale()
  if (!hours || hours.seasons.length === 0) {
    return <p className="text-sm">{t('facilities.public.hours.noLimit')}</p>
  }
  return (
    <div className="flex flex-col gap-3">
      {hours.seasons.map((season) => (
        <div key={`${season.from}-${season.to}`} className="flex flex-col gap-1">
          <h3 className="text-sm font-medium">
            {season.from === '01-01' && season.to === '12-31'
              ? t('facilities.public.hours.allYear')
              : t('facilities.public.hours.season', {
                  from: formatMonthDay(season.from, locale),
                  to: formatMonthDay(season.to, locale),
                })}
          </h3>
          <dl className="grid grid-cols-3 gap-x-3 gap-y-0.5 text-sm sm:grid-cols-4">
            {WEEKDAYS.map((weekday) => {
              const windows = season.windows
                .filter((window) => window.weekday === weekday)
                .sort((a, b) => a.from.localeCompare(b.from))
              return (
                <React.Fragment key={weekday}>
                  <dt className="text-muted-foreground">{weekdayName(weekday, locale, 'long')}</dt>
                  <dd className="col-span-2 tabular-nums sm:col-span-3">
                    {windows.length === 0
                      ? t('facilities.public.hours.closed')
                      : windows
                          .map((window) =>
                            isAllDay(window) ? t('facilities.public.schedule.allDay') : timeRange(window),
                          )
                          .join(', ')}
                  </dd>
                </React.Fragment>
              )
            })}
          </dl>
        </div>
      ))}
    </div>
  )
}

function RatesBlock({ page }: { page: ScheduleView }) {
  const t = useT()
  const locale = useLocale()
  return (
    <ul className="flex flex-col gap-2 text-sm">
      {page.rates.map((rate, index) => (
        <li key={`${rate.category}-${String(index)}`} className="flex flex-col">
          <span>
            <span className="font-medium">{t(`facilities.public.rates.category.${rate.category}`)}</span>
            {': '}
            {t('facilities.public.rates.price', { amount: formatAmount(rate.pricePer90, page.currency, locale) })}
          </span>
          <span className="text-muted-foreground">
            {rate.seasonFrom && rate.seasonTo
              ? t('facilities.public.rates.season', {
                  from: formatMonthDay(rate.seasonFrom, locale),
                  to: formatMonthDay(rate.seasonTo, locale),
                })
              : t('facilities.public.rates.allYear')}
            {rate.includesLighting ? ` · ${t('facilities.public.rates.lighting')}` : ''}
          </span>
        </li>
      ))}
    </ul>
  )
}

function Breadcrumb({ page }: { page: ScheduleView }) {
  const t = useT()
  const link =
    'text-muted-foreground hover:text-foreground inline-flex min-h-11 items-center underline-offset-4 hover:underline sm:min-h-6'
  return (
    <nav aria-label={t('facilities.public.breadcrumb.label')} data-testid="public-breadcrumb">
      <ol className="flex flex-wrap items-center gap-x-2 text-sm">
        <li>
          <Link href={clubHref(page.club.slug)} className={link}>
            {page.club.name}
          </Link>
        </li>
        <li className="flex items-center gap-x-2">
          <span aria-hidden="true" className="text-muted-foreground">
            ›
          </span>
          <Link href={placesHref(page.club.slug)} className={link} data-testid="public-breadcrumb-places">
            {t('facilities.public.places.title')}
          </Link>
        </li>
        <li className="flex items-center gap-x-2">
          <span aria-hidden="true" className="text-muted-foreground">
            ›
          </span>
          <span aria-current="page" className="text-foreground font-medium">
            {page.place.name}
          </span>
        </li>
      </ol>
    </nav>
  )
}

function MonthNavigation({ page, busy }: { page: ScheduleView; busy: boolean }) {
  const t = useT()
  const locale = useLocale()
  const move = (month: string | null, label: string, testId: string) =>
    month ? (
      <Button asChild variant="outline" className="min-h-11">
        <Link href={placeHref(page.club.slug, page.place.slug, month)} scroll={false} data-testid={testId}>
          {label}
        </Link>
      </Button>
    ) : (
      <Button type="button" variant="outline" className="min-h-11" disabled data-testid={testId}>
        {label}
      </Button>
    )
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      {move(page.previousMonth, t('facilities.public.schedule.earlier'), 'public-schedule-earlier')}
      <h2
        id="public-schedule-month"
        className="text-lg font-semibold"
        aria-live="polite"
        aria-busy={busy}
        data-testid="public-schedule-month"
        data-month={page.month}
      >
        {formatMonth(page.month, locale)}
      </h2>
      {move(page.nextMonth, t('facilities.public.schedule.later'), 'public-schedule-later')}
    </div>
  )
}

function SchedulePage({ page, busy, onRefresh }: { page: ScheduleView; busy: boolean; onRefresh: () => void }) {
  const t = useT()
  const { place } = page
  const hasContent = page.days.some(dayHasContent)
  const [target, setTarget] = React.useState<RequestTarget | null>(null)
  // A new key per opening starts the dialog fresh.
  const [targetKey, setTargetKey] = React.useState(0)
  const openRequest = React.useCallback((next: RequestTarget) => {
    setTargetKey((current) => current + 1)
    setTarget(next)
  }, [])
  return (
    <RequestContext.Provider value={place.acceptsOnlineRequests ? openRequest : null}>
      <PublicFacilitiesFrame club={page.club} wide>
        <Breadcrumb page={page} />
        <section className="flex flex-col gap-1" aria-labelledby="public-place-title">
          <h1 id="public-place-title" className="text-2xl font-semibold" data-testid="public-place-title">
            {place.name}
          </h1>
          {place.address ? <p className="text-muted-foreground text-sm">{place.address}</p> : null}
          {place.surface ? (
            <p className="text-sm">{t('facilities.public.places.surface', { surface: place.surface })}</p>
          ) : null}
          <p className="text-sm font-medium" data-testid="public-place-requests">
            {place.acceptsOnlineRequests
              ? t('facilities.public.places.onlineRequests')
              : t('facilities.public.places.byPhone')}
          </p>
        </section>
        <section className="flex flex-col gap-3" aria-labelledby="public-schedule-month" data-testid="public-schedule">
          <MonthNavigation page={page} busy={busy} />
          {hasContent ? (
            <>
              <DayList days={page.days} />
              <MonthGrid days={page.days} />
            </>
          ) : (
            <p className="text-muted-foreground" data-testid="public-schedule-empty">
              {t('facilities.public.schedule.empty')}
            </p>
          )}
        </section>
        <Legend />
        <Block id="hours" title={t('facilities.public.hours.title')}>
          <OpeningHoursBlock hours={page.openingHours} />
        </Block>
        {page.rates.length > 0 ? (
          <Block id="rates" title={t('facilities.public.rates.title')}>
            <RatesBlock page={page} />
          </Block>
        ) : null}
        {place.regulationsText || place.regulationsUrl ? (
          <Block id="rules" title={t('facilities.public.rules.title')}>
            {place.regulationsText ? (
              <p className="max-w-prose text-sm whitespace-pre-line">{place.regulationsText}</p>
            ) : null}
            {place.regulationsUrl ? (
              <p className="text-sm">
                <a
                  className="inline-flex min-h-11 items-center underline underline-offset-4 sm:min-h-6"
                  href={place.regulationsUrl}
                  target="_blank"
                  rel="noreferrer"
                  data-testid="public-place-regulations"
                >
                  {t('facilities.public.rules.pdf')}
                </a>
              </p>
            ) : null}
          </Block>
        ) : null}
        {page.phone ? (
          <Block id="phone" title={t('facilities.public.phone.title')}>
            <p className="text-sm">
              <a
                className="inline-flex min-h-11 items-center underline underline-offset-4 sm:min-h-6"
                href={phoneHref(page.phone)}
              >
                {page.phone}
              </a>
            </p>
          </Block>
        ) : null}
        {place.photoUrls.length > 0 ? (
          <Block id="photos" title={t('facilities.public.photos.title')}>
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
              {place.photoUrls.map((url, index) => (
                <li key={url}>
                  <Image
                    src={url}
                    alt={t('facilities.public.photos.alt', { place: place.name, number: index + 1 })}
                    width={640}
                    height={480}
                    unoptimized
                    className="bg-muted aspect-4/3 w-full rounded-md object-cover"
                  />
                </li>
              ))}
            </ul>
          </Block>
        ) : null}
      </PublicFacilitiesFrame>
      {target ? (
        <PublicRequestDialog
          key={targetKey}
          page={page}
          target={target}
          open
          onOpenChange={(open) => {
            if (!open) setTarget(null)
          }}
          onSlotTaken={onRefresh}
        />
      ) : null}
    </RequestContext.Provider>
  )
}

export function PublicScheduleView({
  clubSlug,
  placeSlug,
  month,
}: {
  clubSlug: string
  placeSlug: string
  month: string | null
}) {
  const t = useT()
  const query = usePublicSchedule(clubSlug, placeSlug, month)
  const load = query.data

  if (!load && query.isFetching) return <PublicFacilitiesLoading />
  if (!load) return <PublicFacilitiesError onRetry={() => void query.refetch()} />
  if (load.status === 'not_found') {
    return (
      <PublicFacilitiesFrame club={null}>
        <PublicFacilitiesNotice
          title={t('facilities.public.notFound.title')}
          message={t('facilities.public.schedule.notFound')}
          testId="public-schedule-not-found"
        />
      </PublicFacilitiesFrame>
    )
  }
  if (load.status === 'disabled') return <PublicFacilitiesDisabled club={null} />
  if (load.status === 'month_invalid') {
    return (
      <PublicFacilitiesFrame club={null}>
        <PublicFacilitiesNotice
          title={t('facilities.public.schedule.monthInvalid.title')}
          message={t('facilities.public.schedule.monthInvalid.message')}
          testId="public-schedule-month-invalid"
        >
          <p>
            <Link
              className="inline-flex min-h-11 items-center underline underline-offset-4"
              href={placeHref(clubSlug, placeSlug)}
            >
              {t('facilities.public.schedule.monthInvalid.current')}
            </Link>
          </p>
        </PublicFacilitiesNotice>
      </PublicFacilitiesFrame>
    )
  }
  return <SchedulePage page={load.page} busy={query.isFetching} onRefresh={() => void query.refetch()} />
}

function ScheduleFromUrl({ clubSlug, placeSlug }: { clubSlug: string; placeSlug: string }) {
  const searchParams = useSearchParams()
  return <PublicScheduleView clubSlug={clubSlug} placeSlug={placeSlug} month={monthParam(searchParams.get('month'))} />
}

/** The page body: the month of `?month=` (`useSearchParams` needs a Suspense boundary while the page prerenders). */
export function PublicScheduleRoute({ clubSlug, placeSlug }: { clubSlug: string; placeSlug: string }) {
  return (
    <React.Suspense fallback={<PublicFacilitiesLoading />}>
      <ScheduleFromUrl clubSlug={clubSlug} placeSlug={placeSlug} />
    </React.Suspense>
  )
}
