'use client'
// The "Calendar" perspective of `/backend/activities/occurrences` (README B-15; club spec UI table, REQ-006; foundation
// II P-23, REQ-G06, DD-G08, DD-G09; E06-S12 #94): the coordinator's sections in the installed `ScheduleView` (week by
// default; day, month and agenda through its toolbar), fed by `GET /api/activities/calendar?as=coordinator` through
// `toScheduleItem`, under a Vereino filter bar with the section. A session opens its record; the club administrator
// reads the whole club. The grid buckets its days in the browser's zone, so the range it shows is read by those dates.
import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { ScheduleView, type ScheduleRange, type ScheduleViewMode } from '@open-mercato/ui/backend/schedule'
import { getScheduleLocale } from '@open-mercato/ui/backend/schedule/localization'
import { endOfWeek } from 'date-fns/endOfWeek'
import { startOfWeek } from 'date-fns/startOfWeek'
import { ErrorMessage } from '@open-mercato/ui/backend/detail'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { Button } from '@open-mercato/ui/primitives/button'
import { Label } from '@open-mercato/ui/primitives/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { useOrganizationScopeVersion } from '@open-mercato/shared/lib/frontend/useOrganizationScope'
import type { CalendarItem } from '@vereino/core'
import { toScheduleItem } from '@vereino/ui'
import { scheduleRangeWindow } from '../lib/occurrence-list'
import type { CalendarEntry, CalendarResponse } from './club/club-client'
import { OWN_FORBIDDEN_STATE, occurrenceHref, sectionOptions, tolerant, type Translate } from './client-helpers'

const ALL_SECTIONS = 'all'

/** The week (browser time, the locale's first weekday — as the grid renders it) that holds `now`. */
function currentWeek(now: Date, locale: string): ScheduleRange {
  const options = { locale: getScheduleLocale(locale) }
  return { start: startOfWeek(now, options), end: endOfWeek(now, options) }
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

export function CoordinatorCalendar() {
  const t = useT()
  const locale = useLocale()
  const router = useRouter()
  const scopeVersion = useOrganizationScopeVersion()
  const sectionFieldId = React.useId()
  const [view, setView] = React.useState<ScheduleViewMode>('week')
  const [range, setRange] = React.useState<ScheduleRange>(() => currentWeek(new Date(), locale))
  const [sectionId, setSectionId] = React.useState(ALL_SECTIONS)
  const dates = scheduleRangeWindow(range)

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
        <Select value={sectionId} onValueChange={setSectionId}>
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
      {notice}
      <ScheduleView
        items={items}
        view={view}
        range={range}
        timezone={query.data?.status === 'ok' ? query.data.data.timeZone : undefined}
        onRangeChange={setRange}
        onViewChange={setView}
        onItemClick={(item) => {
          router.push(occurrenceHref(item.id))
        }}
      />
    </section>
  )
}
