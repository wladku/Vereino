// The one range switch of every calendar (calendar range switch spec REQ-W02, DD-W01, DD-W02; D-040; the mockup's
// `rangeSwitch`): the views as one segmented row of links — a view's own extra tabs (M-03 "Upcoming" before, B-15
// "Agenda" after), then Day / Week / Month — with `aria-current="page"` on the shown one; then "Earlier", "Today" and
// "Later" with their full names for screen readers, and the range's heading in a polite live region. Links, not
// buttons: a view change pushes a history entry, an arrow replaces it, so the back button returns to the previous
// view. "Today" hides while the range holds today; an arrow that would leave the readable window is disabled. An
// extra tab has no arrows. Every target is at least 44 px high below `sm`. The module passes the labels, the link
// component and the addresses; `useWideCalendar` tells a page whether to open on Week (from `md`) or Day.
import * as React from 'react'
import { Button } from '@open-mercato/ui/primitives/button'
import type { CalendarDate } from '@vereino/core'
import {
  CALENDAR_RANGES,
  WIDE_CALENDAR_QUERY,
  canShiftRange,
  formatRangeLabel,
  isCalendarRange,
  mediaQueryStore,
  rangeOf,
  shiftRange,
  windowHolds,
  type CalendarRange,
  type CalendarRangeLimits,
  type MediaQueryWindow,
} from '#src/member/calendar-range'

export type CalendarRangeLabels = {
  /** The accessible name of the views' group ("Range"). */
  group: string
  day: string
  week: string
  month: string
  earlier: string
  later: string
  today: string
  /** The full names of the arrows per view, for screen readers ("previous week"). */
  previous: Record<CalendarRange, string>
  next: Record<CalendarRange, string>
}

export type CalendarRangeLinkProps = {
  href: string
  className?: string
  children: React.ReactNode
  'aria-current'?: 'page'
  'data-testid'?: string
  /** An arrow replaces the history entry; a view change pushes one. */
  replace?: boolean
}

export type CalendarRangeTab = { id: string; label: string }

export type CalendarRangeSwitchProps = {
  /** The shown view: Day, Week, Month or one of the extra tabs. */
  range: string
  anchor: CalendarDate
  today: CalendarDate
  locale: string
  labels: CalendarRangeLabels
  hrefFor: (range: string, anchor: CalendarDate) => string
  Link: React.ComponentType<CalendarRangeLinkProps>
  /** Tabs before Day (M-03 "Upcoming"). */
  before?: readonly CalendarRangeTab[]
  /** Tabs after Month (B-15 "Agenda"). */
  after?: readonly CalendarRangeTab[]
  limits?: CalendarRangeLimits
  /** The prefix of the `data-testid`s: `{prefix}-view-{id}`, `-previous`, `-today`, `-next`, `-range`. */
  testId?: string
  className?: string
}

const TAB = 'min-h-11 rounded-none border-0 px-3 first:rounded-l-md last:rounded-r-md sm:min-h-9'
const ARROW = 'min-h-11 sm:min-h-9'

export function CalendarRangeSwitch({
  range,
  anchor,
  today,
  locale,
  labels,
  hrefFor,
  Link,
  before = [],
  after = [],
  limits,
  testId = 'calendar-range',
  className,
}: CalendarRangeSwitchProps) {
  const views: CalendarRangeTab[] = [...before, ...CALENDAR_RANGES.map((id) => ({ id, label: labels[id] })), ...after]
  const ranged = isCalendarRange(range) ? range : null
  const arrow = (current: CalendarRange, step: -1 | 1) => {
    const text = step < 0 ? labels.earlier : labels.later
    const full = (step < 0 ? labels.previous : labels.next)[current]
    const id = `${testId}-${step < 0 ? 'previous' : 'next'}`
    const content = (
      <>
        <span aria-hidden="true">{text}</span>
        <span className="sr-only">{full}</span>
      </>
    )
    if (!canShiftRange(current, anchor, step, limits)) {
      return (
        <Button type="button" variant="outline" className={ARROW} disabled data-testid={id}>
          {content}
        </Button>
      )
    }
    return (
      <Button asChild variant="outline" className={ARROW}>
        <Link href={hrefFor(current, shiftRange(current, anchor, step))} replace data-testid={id}>
          {content}
        </Link>
      </Button>
    )
  }
  return (
    <div
      className={['flex flex-wrap items-center gap-x-3 gap-y-2', className].filter(Boolean).join(' ')}
      data-testid={testId}
      data-range={range}
      data-date={anchor}
    >
      <div
        role="group"
        aria-label={labels.group}
        className="border-input bg-background inline-flex max-w-full flex-wrap divide-x rounded-md border"
      >
        {views.map((view) => {
          const current = view.id === range
          return (
            <Button key={view.id} asChild variant={current ? 'default' : 'ghost'} className={TAB}>
              <Link
                href={hrefFor(view.id, anchor)}
                aria-current={current ? 'page' : undefined}
                data-testid={`${testId}-view-${view.id}`}
              >
                {view.label}
              </Link>
            </Button>
          )
        })}
      </div>
      {ranged ? (
        <div className="flex flex-wrap items-center gap-2">
          {arrow(ranged, -1)}
          {windowHolds(rangeOf(ranged, anchor), today) ? null : (
            <Button asChild variant="outline" className={ARROW}>
              <Link href={hrefFor(range, today)} replace data-testid={`${testId}-today`}>
                {labels.today}
              </Link>
            </Button>
          )}
          {arrow(ranged, 1)}
        </div>
      ) : null}
      {ranged ? (
        <p className="text-sm font-medium" aria-live="polite" data-testid={`${testId}-range`}>
          {formatRangeLabel(ranged, anchor, locale)}
        </p>
      ) : null}
    </div>
  )
}

const browserWindow = (): MediaQueryWindow | undefined =>
  typeof window === 'undefined' || typeof window.matchMedia !== 'function' ? undefined : window

/**
 * Whether the screen is wide enough to open on Week (`md`, DD-W03). The server and the first client render assume a
 * wide screen, so the HTML matches; a phone switches to Day right after hydration.
 */
export function useWideCalendar(query: string = WIDE_CALENDAR_QUERY): boolean {
  const store = React.useMemo(() => mediaQueryStore(query, browserWindow()), [query])
  return React.useSyncExternalStore(store.subscribe, store.getSnapshot, () => true)
}
