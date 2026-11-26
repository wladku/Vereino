'use client'
// The Week and Month of the facility calendars B-23 and M-11 (calendar range switch spec REQ-W05, DD-W05, DD-W06;
// D-040, which revises D-031 §4): from `lg` a week is seven day axes side by side on one hour scale, each headed by its
// day as a link to that day, with the legend once above them; a free hour and an entry block act as on Day. Below
// `lg` a week, and a month at every width, is a list of the days that have entries — each day's heading links to the
// day, and its entries are the "Wpisy dnia" rows with their actions. The axes scroll sideways inside their own
// focusable region, never the page.
import * as React from 'react'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { formatDayHeading } from '@vereino/ui'
import { unionBounds } from '../../lib/day-axis'
import type { CalendarDay, CalendarEntry } from '../club-places/places-client'
import { AxisLegend, DayAxis, dayAxisBounds } from './DayAxis'
import { DayEntries } from './DayEntries'

export type RangeLinkComponent = React.ComponentType<{
  href: string
  className?: string
  children: React.ReactNode
  'data-testid'?: string
}>

/** "pon. 24.11" / "Mon 24.11": a week column's heading. */
export function shortDayLabel(date: string, locale: string): string {
  const at = new Date(`${date}T12:00:00Z`)
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(at)
  return `${weekday} ${date.slice(8, 10)}.${date.slice(5, 7)}`
}

type DayData = {
  date: string
  day: CalendarDay | null
  /** The entries to draw and list (the "to be moved" filter applied). */
  entries: readonly CalendarEntry[]
  /** Every entry of the day: a free hour has none of them. */
  occupying: readonly CalendarEntry[]
}

export function WeekAxes({
  days,
  timeZone,
  today,
  nowMinutes,
  redacted,
  canBook,
  pastFrom,
  onBookHour,
  onEntry,
  dayHref,
  Link,
}: {
  days: readonly DayData[]
  timeZone: string
  today: string
  nowMinutes: number
  redacted: boolean
  canBook: boolean
  pastFrom?: string | null
  onBookHour?: (date: string, time: string) => void
  onEntry?: (entry: CalendarEntry) => void
  dayHref: (date: string) => string
  Link: RangeLinkComponent
}) {
  const t = useT()
  const locale = useLocale()
  const bounds = unionBounds(days.map((day) => dayAxisBounds(day.date, timeZone, day.day, day.occupying)))
  return (
    <div className="flex flex-col gap-3" data-testid="facilities-week-axes">
      <AxisLegend />
      <div
        role="region"
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a horizontally scrolling region must be keyboard-focusable (WCAG 2.1.1, axe `scrollable-region-focusable`)
        tabIndex={0}
        aria-label={t('facilities.calendar.range.weekAxes')}
        className="focus-visible:focus-indicator max-w-full overflow-x-auto"
      >
        <ol className="grid min-w-3xl grid-cols-7 gap-2">
          {days.map((day) => (
            <li key={day.date} className="flex min-w-0 flex-col gap-2" data-testid={`facilities-week-day-${day.date}`}>
              <Link
                href={dayHref(day.date)}
                className={`text-primary min-h-11 text-sm font-medium underline-offset-2 hover:underline sm:min-h-6 ${day.date === today ? 'underline' : ''}`}
                data-testid={`facilities-week-day-open-${day.date}`}
              >
                {shortDayLabel(day.date, locale)}
                {/* The visible text starts the accessible name (WCAG 2.5.3); the long date follows for readers. */}
                <span className="sr-only">
                  {' '}
                  {t('facilities.calendar.range.openDay', { day: formatDayHeading(day.date, locale) })}
                </span>
              </Link>
              <DayAxis
                date={day.date}
                timeZone={timeZone}
                day={day.day}
                entries={day.entries}
                occupying={day.occupying}
                today={today}
                nowMinutes={nowMinutes}
                redacted={redacted}
                canBook={canBook}
                pastFrom={pastFrom}
                onBookHour={
                  onBookHour
                    ? (time) => {
                        onBookHour(day.date, time)
                      }
                    : undefined
                }
                onEntry={onEntry}
                bounds={bounds}
                legend={false}
              />
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}

/** The days of a week (below `lg`) or a month that have entries, each heading linking to its day (DD-W05). */
export function RangeEntryList({
  days,
  timeZone,
  placeId,
  redacted,
  filtered,
  actionOf,
  onOpen,
  dayHref,
  Link,
}: {
  days: readonly DayData[]
  timeZone: string
  placeId: string
  redacted: boolean
  filtered: boolean
  actionOf?: (entry: CalendarEntry) => React.ReactNode
  onOpen?: (entry: CalendarEntry) => void
  dayHref: (date: string) => string
  Link: RangeLinkComponent
}) {
  const t = useT()
  const locale = useLocale()
  const shown = days.filter((day) => day.entries.length > 0)
  if (shown.length === 0) {
    return (
      <p className="text-muted-foreground text-sm" data-testid="facilities-range-empty">
        {t(filtered ? 'facilities.calendar.dayEntries.emptyFiltered' : 'facilities.calendar.range.noEntries')}
      </p>
    )
  }
  return (
    <div className="flex flex-col gap-4" data-testid="facilities-range-list">
      {shown.map((day) => (
        <DayEntries
          key={day.date}
          date={day.date}
          title={
            <Link
              href={dayHref(day.date)}
              className="text-primary inline-flex min-h-11 items-center underline-offset-2 hover:underline sm:min-h-6"
              data-testid={`facilities-range-day-open-${day.date}`}
            >
              {formatDayHeading(day.date, locale)}
            </Link>
          }
          entries={day.entries}
          timeZone={timeZone}
          placeId={placeId}
          redacted={redacted}
          filtered={filtered}
          actionOf={actionOf}
          onOpen={onOpen}
        />
      ))}
    </div>
  )
}
