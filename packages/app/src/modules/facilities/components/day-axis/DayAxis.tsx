'use client'
// The day axis (facilities parity spec DD-R01, DD-R02, REQ-R01; #276): one club-zone day of one place on an hour axis,
// 08:00–22:00 widened by whole hours to the day's opening windows and entries. Zone bands run down the left edge of
// the lanes; every entry is a block with its time and text; overlapping entries stand side by side in lanes. Each
// free open hour is a button named `facilities.axis.bookFrom` when the reader may book; a closed day says so and has
// no buttons. 40 px per hour, a 48 px hour column, lanes of at least 96 px: a wider day scrolls sideways inside the
// axis, never the page. The blocks repeat what "Wpisy dnia" lists as text, so they are hidden from assistive
// technology. A recorded exception to the shared components (DD-R01): colours come from the semantic status tokens of
// `KIND_TAGS` and the zone legend, no hard-coded colours, and nothing animates under reduced motion.
import * as React from 'react'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import {
  axisBounds,
  axisHours,
  axisLength,
  axisOffset,
  freeOpenHours,
  isClosedDay,
  layoutLanes,
  maxLanes,
  type Span,
} from '../../lib/day-axis'
import { ZONES } from '../../lib/zones'
import { KIND_TAGS, ZONE_TAGS } from './tags'
import {
  ENTRY_KINDS,
  entryRange,
  minutesOf,
  minutesOnDate,
  timeOf,
  type CalendarDay,
  type CalendarEntry,
  type CalendarEntryKind,
} from '../club-places/places-client'
import { dayEntryText } from './DayEntries'

/** The status tokens of each `Tag` variant, for the blocks, bands and swatches (the classes `Tag` itself uses). */
const TONES: Record<string, string> = {
  success: 'border-status-success-border bg-status-success-bg text-status-success-text',
  warning: 'border-status-warning-border bg-status-warning-bg text-status-warning-text',
  error: 'border-status-error-border bg-status-error-bg text-status-error-text',
  info: 'border-status-info-border bg-status-info-bg text-status-info-text',
  neutral: 'border-status-neutral-border bg-status-neutral-bg text-status-neutral-text',
  pink: 'border-status-pink-border bg-status-pink-bg text-status-pink-text',
}

/** A second cue besides the colour: a dashed request, a double closure, a dotted maintenance window. */
const KIND_BORDERS: Record<CalendarEntryKind, string> = {
  session: 'border-solid',
  booking: 'border-solid',
  rental: 'border-solid',
  request: 'border-dashed',
  closure: 'border-double border-4',
  maintenance: 'border-dotted border-2',
}

const HOUR_COLUMN = 48
const MIN_LANE = 96
/** The zone band's width at the left edge of the lanes. */
const BAND = 12

export function AxisLegend() {
  const t = useT()
  const headingId = React.useId()
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-1" data-testid="facilities-axis-legend">
      <h3 id={headingId} className="text-sm font-medium">
        {t('facilities.axis.legend.title')}
      </h3>
      <ul className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {ZONES.map((zone) => (
          <li key={zone} className="flex items-center gap-1.5">
            <span aria-hidden="true" className={`inline-block size-3 rounded-sm border ${TONES[ZONE_TAGS[zone]]}`} />
            {t(`facilities.zones.zone.${zone}`)}
          </li>
        ))}
        {ENTRY_KINDS.map((kind) => (
          <li key={kind} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className={`inline-block size-3 rounded-sm border ${TONES[KIND_TAGS[kind]]} ${KIND_BORDERS[kind]}`}
            />
            {t(`facilities.axis.legend.${kind}`)}
          </li>
        ))}
      </ul>
    </section>
  )
}

export type DayAxisProps = {
  date: string
  timeZone: string
  day: CalendarDay | null
  /** The entries to draw (already filtered by the page). */
  entries: readonly CalendarEntry[]
  /** Every entry of the day: a free hour has none of them, whatever the filter shows. */
  occupying?: readonly CalendarEntry[]
  today: string
  /** The minutes of now on `today` in the club's zone. */
  nowMinutes: number
  redacted?: boolean
  /** Whether the free open hours are buttons. */
  canBook: boolean
  /** DD-R17: the earliest past day whose free hours are buttons too (the club administrator's past club booking). */
  pastFrom?: string | null
  onBookHour?: (time: string) => void
  /**
   * A tap on a block (M-11): a pointer shortcut only — the blocks stay hidden from assistive technology, and "Wpisy
   * dnia" gives every entry the same action as a button.
   */
  onEntry?: (entry: CalendarEntry) => void
}

export function DayAxis({
  date,
  timeZone,
  day,
  entries,
  occupying = entries,
  today,
  nowMinutes,
  redacted = false,
  canBook,
  pastFrom = null,
  onBookHour,
  onEntry,
}: DayAxisProps) {
  const t = useT()
  const spanOf = React.useCallback(
    (entry: CalendarEntry) => ({
      entry,
      from: minutesOnDate(entry.start, date, timeZone),
      to: minutesOnDate(entry.end, date, timeZone),
    }),
    [date, timeZone],
  )
  const drawn = entries.map(spanOf).filter((item) => item.to > item.from)
  const busy = occupying.map(spanOf).filter((item) => item.to > item.from)
  const opening: Span[] | null = day?.opening
    ? day.opening.map((window) => ({ from: minutesOf(window.from), to: minutesOf(window.to) }))
    : null
  const zones = (day?.zones ?? []).map((zone) => ({
    from: minutesOf(zone.from),
    to: minutesOf(zone.to),
    zone: zone.zone,
  }))
  const bounds = axisBounds(opening, busy)
  const hours = axisHours(bounds)
  const laned = layoutLanes(drawn)
  const lanes = maxLanes(laned)
  const closed = isClosedDay(opening)
  const free = new Set(
    canBook ? freeOpenHours({ bounds, opening, zones, entries: busy, date, today, nowMinutes, pastFrom }) : [],
  )
  const clip = (span: Span) => ({ from: Math.max(span.from, bounds.from), to: Math.min(span.to, bounds.to) })

  return (
    <div className="flex flex-col gap-3" data-testid="facilities-day-axis">
      <AxisLegend />
      {closed ? (
        <p className="text-sm font-medium" data-testid="facilities-axis-closed">
          {t('facilities.axis.closedDay')}
        </p>
      ) : null}
      <div
        role="region"
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a horizontally scrolling region must be keyboard-focusable (WCAG 2.1.1, axe `scrollable-region-focusable` with four parallel entries at 375 px)
        tabIndex={0}
        aria-label={t('facilities.axis.label', { from: timeOf(bounds.from), to: timeOf(bounds.to) })}
        className="focus-visible:focus-indicator max-w-full overflow-x-auto rounded-md border"
        data-testid="facilities-axis-scroll"
      >
        <div
          className="relative"
          style={{ minWidth: HOUR_COLUMN + BAND + lanes * MIN_LANE, height: axisLength(bounds) }}
          data-from={timeOf(bounds.from)}
          data-to={timeOf(bounds.to)}
          data-testid="facilities-axis"
        >
          <ol className="absolute inset-0">
            {hours.map((hour) => {
              const label = timeOf(hour)
              const bookable = free.has(hour)
              return (
                <li key={hour} className="border-border/60 flex h-10 border-b last:border-b-0">
                  <span className="text-muted-foreground w-12 shrink-0 px-1 pt-0.5 text-xs tabular-nums">{label}</span>
                  {bookable ? (
                    <button
                      type="button"
                      aria-label={t('facilities.axis.bookFrom', { hour: String(hour / 60) })}
                      className="hover:bg-muted focus-visible:bg-muted focus-visible:focus-indicator-inset flex-1 motion-safe:transition-colors"
                      onClick={() => {
                        onBookHour?.(label)
                      }}
                      data-testid={`facilities-axis-hour-${label}`}
                    />
                  ) : (
                    <span className="flex-1" />
                  )}
                </li>
              )
            })}
          </ol>
          <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 left-12">
            {zones.map((zone) => {
              const span = clip(zone)
              if (span.to <= span.from) return null
              return (
                <div
                  key={`${zone.zone}-${String(zone.from)}`}
                  title={t(`facilities.zones.zone.${zone.zone}`)}
                  className={`absolute left-0 w-2 border ${TONES[ZONE_TAGS[zone.zone]]}`}
                  style={{ top: axisOffset(span.from, bounds), height: axisLength(span) }}
                  data-zone={zone.zone}
                />
              )
            })}
            {laned.map(({ item, lane, lanes: groupLanes }) => (
              // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- a pointer shortcut of an aria-hidden block; the keyboard reaches the same action in "Wpisy dnia"
              <div
                key={`${item.entry.kind}:${item.entry.id}`}
                className={`absolute overflow-hidden rounded-md border p-1 text-xs leading-tight break-words ${onEntry ? 'pointer-events-auto cursor-pointer' : ''} ${TONES[KIND_TAGS[item.entry.kind]]} ${KIND_BORDERS[item.entry.kind]}`}
                style={{
                  top: axisOffset(item.from, bounds) + 1,
                  height: Math.max(axisLength(item) - 2, 14),
                  left: `calc(${String(BAND)}px + (100% - ${String(BAND)}px) * ${String(lane)} / ${String(groupLanes)})`,
                  width: `calc((100% - ${String(BAND)}px) / ${String(groupLanes)} - 4px)`,
                }}
                data-testid={`facilities-axis-entry-${item.entry.id}`}
                data-kind={item.entry.kind}
                data-lane={lane}
                data-lanes={groupLanes}
                // Last: the design-system check reads an opening tag up to its first `>`, which an arrow would end.
                onClick={
                  onEntry
                    ? () => {
                        onEntry(item.entry)
                      }
                    : undefined
                }
              >
                <strong className="tabular-nums">{entryRange(item.entry, timeZone)}</strong>{' '}
                {dayEntryText(t, item.entry, redacted)}
                {item.entry.needsReschedule ? ` · ${t('facilities.places.entry.needsReschedule')}` : null}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
