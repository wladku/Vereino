'use client'
// The "Calendar" perspective of `/backend/activities/occurrences` (README B-15; club spec UI table, REQ-006; foundation
// II P-23, REQ-G06, DD-G08, DD-G09; E06-S12 #94): the coordinator's sections in the installed schedule grid, fed by
// `GET /api/activities/calendar?as=coordinator` through `toScheduleItem`, under a Vereino filter bar with the section.
// A session opens its record; the club administrator reads the whole club. The grid buckets its days in the browser's
// zone, so the range it shows is read by those dates. Calendar range switch spec REQ-W07 (#784, A-W02, A-W03): the
// shared switch "Day · Week · Month · Agenda" above the grid replaces the installed toolbar (the grid is rendered
// without it); the view, its day and the section live in the address (`?view=calendar&range=&date=&section=`), so a
// reload and a shared link reopen them; a phone opens on Day, a wider screen on Week.
import * as React from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import type { ScheduleRange, ScheduleViewMode } from '@open-mercato/ui/backend/schedule'
import type { ScheduleCalendarProps } from '@open-mercato/ui/backend/schedule/ScheduleCalendar'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { Button } from '@open-mercato/ui/primitives/button'
import { Label } from '@open-mercato/ui/primitives/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { useOrganizationScopeVersion } from '@open-mercato/shared/lib/frontend/useOrganizationScope'
import type { CalendarDate, CalendarItem } from '@vereino/core'
import {
  CalendarRangeSwitch,
  calendarRangeLabels,
  toScheduleItem,
  useWideCalendar,
  type CalendarRangeLinkProps,
} from '@vereino/ui'
import {
  AGENDA_VIEW,
  coordinatorCalendarHref,
  coordinatorCalendarState,
  coordinatorGridDates,
  coordinatorReadWindow,
  type CoordinatorView,
} from '../lib/coordinator-calendar'
import { localCalendarDate } from '../lib/occurrence-list'
import type { CalendarEntry, CalendarResponse } from './club/club-client'
import {
  OCCURRENCES_HREF,
  OWN_FORBIDDEN_STATE,
  occurrenceHref,
  sectionOptions,
  tolerant,
  type Translate,
} from './client-helpers'

const ALL_SECTIONS = 'all'

function GridLoading() {
  const t = useT()
  return (
    <div className="flex h-96 items-center justify-center">
      <LoadingMessage label={t('activities.occurrences.calendar.loading')} />
    </div>
  )
}

/** The installed grid without its toolbar: the shared switch drives it (A-W03). */
const ScheduleCalendar = dynamic<ScheduleCalendarProps>(
  () => import('@open-mercato/ui/backend/schedule/ScheduleCalendar'),
  { ssr: false, loading: GridLoading },
)

function RangeLink({ replace, ...props }: CalendarRangeLinkProps) {
  return <Link {...props} replace={replace} scroll={false} />
}

/** A club-zone date as the grid's local midnight, and the end of that local day. */
function localDay(date: CalendarDate, end = false): Date {
  const [year, month, day] = date.split('-').map(Number)
  return end ? new Date(year, month - 1, day, 23, 59, 59, 999) : new Date(year, month - 1, day)
}

function calendarItemOf(entry: CalendarEntry, t: Translate): CalendarItem {
  const { occurrence } = entry
  const title = [occurrence.activityName, occurrence.groupName].filter(Boolean).join(' · ')
  return {
    id: occurrence.id,
    title: title || t('activities.club.session.untitled'),
    startsAt: new Date(occurrence.startAt),
    endsAt: new Date(occurrence.endAt),
    status: occurrence.status,
    place: occurrence.placeName,
    group: occurrence.groupName,
    href: occurrenceHref(occurrence.id),
  }
}

type CalendarRead = { status: 'ok'; data: CalendarResponse } | { status: 'denied' }

/**
 * Makes the installed grid's scroll containers — the hours of the week and day views, and the agenda list —
 * keyboard-reachable (WCAG 2.1.1, axe `scrollable-region-focusable`, #248): a week without timed sessions has nothing
 * focusable inside the hours, so the region itself takes focus and a name. react-big-calendar renders the containers
 * without these attributes and replaces them when the view changes, so they are set again on every change of the
 * subtree.
 */
function useFocusableScrollRegions(
  root: React.RefObject<HTMLElement | null>,
  labels: { hours: string; agenda: string },
) {
  const { hours, agenda } = labels
  React.useEffect(() => {
    const container = root.current
    if (!container) return
    const regions: [string, string][] = [
      ['.rbc-time-content', hours],
      ['.rbc-agenda-content', agenda],
    ]
    const mark = () => {
      for (const [selector, label] of regions) {
        for (const region of container.querySelectorAll<HTMLElement>(selector)) {
          if (region.getAttribute('tabindex') !== '0') region.setAttribute('tabindex', '0')
          if (region.getAttribute('role') !== 'region') region.setAttribute('role', 'region')
          if (region.getAttribute('aria-label') !== label) region.setAttribute('aria-label', label)
        }
      }
    }
    mark()
    const observer = new MutationObserver(mark)
    observer.observe(container, { childList: true, subtree: true })
    return () => {
      observer.disconnect()
    }
  }, [root, hours, agenda])
}

export function CoordinatorCalendar() {
  const t = useT()
  const locale = useLocale()
  const router = useRouter()
  const scopeVersion = useOrganizationScopeVersion()
  const sectionFieldId = React.useId()
  const gridRef = React.useRef<HTMLDivElement>(null)
  useFocusableScrollRegions(gridRef, {
    hours: t('activities.occurrences.calendar.scrollRegion'),
    agenda: t('activities.occurrences.calendar.agendaRegion'),
  })
  const searchParams = useSearchParams()
  const wide = useWideCalendar()
  // The grid buckets days in the browser's zone, so "today" is the browser's date too.
  const today = localCalendarDate(new Date())
  const state = coordinatorCalendarState(searchParams, wide, today)
  const { range: view, anchor } = state
  const sectionId = state.sectionId ?? ALL_SECTIONS
  const dates = coordinatorReadWindow(view, anchor, today)
  const gridDates = coordinatorGridDates(view, anchor, today)
  const grid: ScheduleRange = { start: localDay(gridDates.from), end: localDay(gridDates.to, true) }
  const hrefFor = (next: string, date: CalendarDate) =>
    coordinatorCalendarHref(OCCURRENCES_HREF, searchParams, next, date)
  // A drill-down inside the grid (a day's header in the month) names the view first, then the range.
  const pendingView = React.useRef<CoordinatorView | null>(null)

  const sections = useQuery({
    queryKey: ['activities-calendar-sections', scopeVersion],
    queryFn: tolerant(sectionOptions),
    staleTime: 5 * 60 * 1000,
  })
  const query = useQuery({
    queryKey: ['activities-coordinator-calendar', dates.from, dates.to, sectionId, scopeVersion],
    queryFn: async (): Promise<CalendarRead> => {
      const params = new URLSearchParams({ as: 'coordinator', from: dates.from, to: dates.to })
      if (sectionId !== ALL_SECTIONS) params.set('sectionId', sectionId)
      const call = await apiCall<CalendarResponse>(`/api/activities/calendar?${params.toString()}`, OWN_FORBIDDEN_STATE)
      if (call.status === 403) return { status: 'denied' }
      if (!call.ok || !call.result) throw new Error(t('activities.occurrences.calendar.errors.load'))
      return { status: 'ok', data: call.result }
    },
  })

  const items = React.useMemo(
    () =>
      query.data?.status === 'ok' ? query.data.data.items.map((entry) => toScheduleItem(calendarItemOf(entry, t))) : [],
    [query.data, t],
  )

  let notice: React.ReactNode = null
  if (query.isLoading) {
    notice = (
      <p className="text-muted-foreground text-sm" role="status">
        {t('activities.occurrences.calendar.loading')}
      </p>
    )
  } else if (query.error) {
    notice = (
      <div className="flex flex-col items-start gap-2" data-testid="occurrences-calendar-error">
        <ErrorMessage label={t('activities.occurrences.calendar.errors.load')} />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            void query.refetch()
          }}
        >
          {t('activities.occurrences.calendar.retry')}
        </Button>
      </div>
    )
  } else if (query.data?.status === 'denied') {
    notice = (
      <p className="text-muted-foreground text-sm" role="status" data-testid="occurrences-calendar-denied">
        {t('activities.occurrences.calendar.denied')}
      </p>
    )
  } else if (items.length === 0) {
    notice = (
      <p className="text-muted-foreground text-sm" role="status" data-testid="occurrences-calendar-empty">
        {t('activities.occurrences.calendar.empty')}
      </p>
    )
  }

  return (
    <section
      className="flex min-w-0 flex-col gap-4"
      aria-label={t('activities.occurrences.perspectives.calendar')}
      data-testid="occurrences-calendar"
    >
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
        <Label htmlFor={sectionFieldId}>{t('activities.occurrences.filters.section')}</Label>
        <Select
          value={sectionId}
          onValueChange={(value: string) => {
            router.replace(
              coordinatorCalendarHref(
                OCCURRENCES_HREF,
                searchParams,
                view,
                anchor,
                value === ALL_SECTIONS ? null : value,
              ),
            )
          }}
        >
          <SelectTrigger id={sectionFieldId} className="sm:w-64" data-testid="occurrences-calendar-section">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_SECTIONS}>{t('activities.occurrences.calendar.allSections')}</SelectItem>
            {(sections.data ?? []).map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <CalendarRangeSwitch
        range={view}
        anchor={anchor}
        today={today}
        locale={locale}
        labels={calendarRangeLabels(t, 'activities.rangeSwitch')}
        hrefFor={hrefFor}
        Link={RangeLink}
        after={[{ id: AGENDA_VIEW, label: t('activities.occurrences.calendar.agenda') }]}
        testId="occurrences-calendar-range"
      />
      {notice}
      <div ref={gridRef} className="schedule-view min-w-0">
        <div className="schedule-calendar border-border bg-card overflow-x-auto rounded-xl border shadow-xs">
          <ScheduleCalendar
            items={items}
            view={view as ScheduleViewMode}
            range={grid}
            onViewChange={(next) => {
              pendingView.current = next
            }}
            onRangeChange={(next) => {
              const nextView = pendingView.current ?? view
              pendingView.current = null
              router.push(hrefFor(nextView, localCalendarDate(next.start)))
            }}
            onItemClick={(item) => {
              router.push(occurrenceHref(item.id))
            }}
          />
        </div>
      </div>
    </section>
  )
}
