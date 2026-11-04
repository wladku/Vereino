'use client'
// `/club/calendar` (club spec UI row `/club/calendar`, REQ-006, REQ-007; foundation II P-23 `CalendarList`; #32): one
// week of sessions as the member sees them — a guardian one calendar of every ward across every section (optionally
// one ward), a participant their own sessions, a coach their groups — with place, address and times in the club's time
// zone, each ward's declaration and the declaration buttons the club's model offers ("Report absence" for an
// `absence_only` activity type, "Attending / Not attending" for `confirm`). Whose sessions it shows follows the header's
// acting context and ward switcher (E06-S19 #101). The toolbar moves by whole weeks; no month on a phone. The
// declaration result is announced through an `aria-live` region.
// `/club/calendar` (club spec UI row `/club/calendar` "week/month calendar", REQ-006, REQ-007; README M-03; foundation
// II P-23 `CalendarList`; #32; E06-S18 #100): the sessions as the member sees them — a guardian one calendar of every
// ward across every section (optionally one ward), a participant their own sessions, a coach their groups — with the
// section legend and each card's section marker (a colour and the section's name), place, address, coach and times in
// the club's time zone, each ward's declaration and the declaration buttons the club's model offers ("Report absence"
// for an `absence_only` activity type, "Attending / Not attending" for `confirm`). A Week/Month switch (owner, Q1 of
// #100): the week is the default, the month is a list of the days that have sessions — no grid, so it reads at 375 px.
// The toolbar moves by whole weeks or months, and an empty week or month offers the next one. A link may open a range
// (`?from=&to=`); a range the API refuses as longer than 62 days is read again trimmed, with a notice. The declaration
// result is announced through an `aria-live` region.
import * as React from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { surfaceRecordConflict } from '@open-mercato/ui/backend/conflicts'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { Alert } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { calendarDateInZone, calendarWeek, groupCalendarItemsByDay } from '@vereino/core'
import { CalendarList, memberCalendarScope, useMemberContext, type MemberLinkProps } from '@vereino/ui'
import { Label } from '@open-mercato/ui/primitives/label'
import { SegmentedControl, SegmentedControlItem } from '@open-mercato/ui/primitives/segmented-control'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import {
  CALENDAR_RANGE_MAX_DAYS,
  calendarDateInZone,
  groupCalendarItemsByDay,
  type CalendarDate,
  type DateWindow,
} from '@vereino/core'
import { CalendarList, type MemberLinkProps } from '@vereino/ui'
import {
  CALENDAR_VIEWS,
  calendarViewWindow,
  isCalendarView,
  requestedCalendarRange,
  shiftCalendarAnchor,
  windowContains,
  type CalendarView,
} from '../../lib/member-calendar'
import { ActivitiesClubFrame } from './ActivitiesClubFrame'
import {
  CALENDAR_QUERY_KEY,
  SESSION_QUERY_KEY,
  declareAttendance,
  errorText,
  parseActionId,
  toCalendarItem,
  useMemberCalendar,
  type ClubProfile,
} from './club-client'

const ALL_WARDS = 'all'

/** The toolbar and empty-state labels of each view. */
const VIEW_LABELS = {
  week: {
    view: 'activities.club.calendar.viewWeek',
    range: 'activities.club.calendar.range',
    previous: 'activities.club.calendar.previous',
    current: 'activities.club.calendar.thisWeek',
    next: 'activities.club.calendar.next',
    empty: 'activities.club.calendar.emptyWeek',
  },
  month: {
    view: 'activities.club.calendar.viewMonth',
    range: 'activities.club.calendar.rangeMonth',
    previous: 'activities.club.calendar.previousMonth',
    current: 'activities.club.calendar.thisMonth',
    next: 'activities.club.calendar.nextMonth',
    empty: 'activities.club.calendar.emptyMonth',
  },
} as const satisfies Record<CalendarView, Record<string, string>>

function MemberLink({ href, className, children }: MemberLinkProps) {
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  )
}

/** The heading of the shown range: the week's days, the month and its year, or a linked range's dates. */
function rangeLabel(locale: string, kind: CalendarView | 'link', window: DateWindow): string {
  const at = (date: CalendarDate) => new Date(`${date}T12:00:00Z`)
  if (kind === 'month')
    return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(at(window.from))
  const options: Intl.DateTimeFormatOptions =
    kind === 'week'
      ? { day: 'numeric', month: 'long', timeZone: 'UTC' }
      : { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }
  return new Intl.DateTimeFormat(locale, options).formatRange(at(window.from), at(window.to))
}

function Calendar({ profile }: { profile: ClubProfile }) {
  const t = useT()
  const locale = useLocale()
  const queryClient = useQueryClient()
  const [selection] = useMemberContext(profile)
  const { as, personId } = memberCalendarScope(profile, selection)
  const [offset, setOffset] = React.useState(0)
  const searchParams = useSearchParams()
  const perspectives = perspectivesOf(profile)
  const [as, setAs] = React.useState<MemberPerspective>(perspectives[0] ?? 'self')
  const [ward, setWard] = React.useState<string>(ALL_WARDS)
  const [view, setView] = React.useState<CalendarView>('week')
  // A date in the shown week or month; null follows today.
  const [anchor, setAnchor] = React.useState<CalendarDate | null>(null)
  // The range a link opened (`?from=&to=`), until the member moves or switches the view.
  const [linkRange, setLinkRange] = React.useState<DateWindow | null>(() =>
    requestedCalendarRange(searchParams.get('from'), searchParams.get('to')),
  )
  const [busyItemId, setBusyItemId] = React.useState<string | null>(null)
  const [announcement, setAnnouncement] = React.useState('')
  const timeZone = profile.club.timezone
  const today = calendarDateInZone(new Date(), timeZone)
  const shown = linkRange ?? calendarViewWindow(view, anchor ?? today)
  const isCurrent = linkRange === null && windowContains(shown, today)
  const query = useMemberCalendar({
    as,
    from: week.from,
    to: week.to,
    personId,
    from: shown.from,
    to: shown.to,
    personId: as === 'guardian' && ward !== ALL_WARDS ? ward : null,
  })
  const items = React.useMemo(
    () => (query.data?.items ?? []).map((entry) => toCalendarItem(entry, as, t)),
    [query.data, as, t],
  )
  const days = React.useMemo(() => groupCalendarItemsByDay(items, timeZone), [items, timeZone])

  const onAction = async (itemId: string, id: string) => {
    const action = parseActionId(id)
    if (!action) return
    setBusyItemId(itemId)
    const shownDeclaration = query.data?.items
      .find((entry) => entry.occurrence.id === itemId)
      ?.persons.find((person) => person.personId === action.personId)?.declaration
    try {
      await declareAttendance(
        { occurrenceId: itemId, ...action },
        t('activities.club.errors.declare'),
        shownDeclaration?.updatedAt ?? null,
      )
      const message = t('activities.club.flash.declared')
      setAnnouncement(message)
      flash(message, 'success')
    } catch (error: unknown) {
      if (!surfaceRecordConflict(error, t)) flash(errorText(error, t('activities.club.errors.declare')), 'error')
    } finally {
      setBusyItemId(null)
      await queryClient.invalidateQueries({ queryKey: [CALENDAR_QUERY_KEY] })
      await queryClient.invalidateQueries({ queryKey: [SESSION_QUERY_KEY] })
    }
  }

  const move = (step: number) => {
    setAnchor(shiftCalendarAnchor(view, linkRange?.from ?? anchor ?? today, step))
    setLinkRange(null)
  }
  const showCurrent = () => {
    setAnchor(null)
    setLinkRange(null)
  }
  const switchView = (value: string) => {
    if (!isCalendarView(value)) return
    if (linkRange) setAnchor(linkRange.from)
    setLinkRange(null)
    setView(value)
  }

  // The range the API served: after a refused range, the trimmed one.
  const served = query.data?.trimmed ? { from: query.data.from, to: query.data.to } : shown
  const label = rangeLabel(locale, linkRange ? 'link' : view, served)
  const viewLabels = VIEW_LABELS[view]

  let content: React.ReactNode
  if (!query.data && query.isFetching) content = <LoadingMessage label={t('activities.club.calendar.loading')} />
  else if (!query.data)
    content = (
      <ErrorMessage
        label={t('activities.club.errors.calendar')}
        action={
          <Button type="button" variant="outline" className="min-h-11" onClick={() => void query.refetch()}>
            {t('activities.club.actions.retry')}
          </Button>
        }
      />
    )
  else
    content = (
      <CalendarList
        days={days}
        locale={locale}
        timeZone={timeZone}
        labels={{
          empty: linkRange ? t('activities.club.calendar.empty') : t(viewLabels.empty),
          done: t('activities.occurrences.status.done'),
          cancelled: t('activities.occurrences.status.cancelled'),
          sections: t('activities.club.calendar.sections'),
          coach: t('activities.club.calendar.coach'),
        }}
        Link={MemberLink}
        onAction={(itemId, actionId) => void onAction(itemId, actionId)}
        busyItemId={busyItemId}
        emptyAction={
          linkRange ? undefined : (
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              onClick={() => {
                move(1)
              }}
              data-testid="club-calendar-empty-next"
            >
              {t(viewLabels.next)}
            </Button>
          )
        }
      />
    )

  return (
    <>
      <h1 className="text-2xl font-semibold">{t('activities.club.calendar.title')}</h1>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end" data-testid="club-calendar-toolbar">
        <nav aria-label={t('activities.club.calendar.range')} className="flex flex-wrap items-center gap-2">
        {perspectives.length > 1 ? (
          <div className="flex flex-col gap-1">
            <Label htmlFor="club-calendar-as">{t('activities.club.calendar.as')}</Label>
            <Select
              value={as}
              onValueChange={(value) => {
                setAs(value as MemberPerspective)
                setWard(ALL_WARDS)
              }}
            >
              <SelectTrigger id="club-calendar-as" className="min-h-11 sm:w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {perspectives.map((perspective) => (
                  <SelectItem key={perspective} value={perspective}>
                    {t(`activities.club.perspective.${perspective}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        {as === 'guardian' && profile.wards.length > 1 ? (
          <div className="flex flex-col gap-1">
            <Label htmlFor="club-calendar-ward">{t('activities.club.calendar.ward')}</Label>
            <Select value={ward} onValueChange={setWard}>
              <SelectTrigger id="club-calendar-ward" className="min-h-11 sm:w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL_WARDS}>{t('activities.club.calendar.allWards')}</SelectItem>
                {profile.wards.map((entry) => (
                  <SelectItem key={entry.personId} value={entry.personId}>
                    {fullName(entry)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium" id="club-calendar-view-label">
            {t('activities.club.calendar.view')}
          </span>
          <SegmentedControl
            value={linkRange ? '' : view}
            onValueChange={switchView}
            aria-labelledby="club-calendar-view-label"
            className="h-11"
            data-testid="club-calendar-view"
          >
            {CALENDAR_VIEWS.map((entry) => (
              <SegmentedControlItem
                key={entry}
                value={entry}
                className="h-10 px-4"
                data-testid={`club-calendar-view-${entry}`}
              >
                {t(VIEW_LABELS[entry].view)}
              </SegmentedControlItem>
            ))}
          </SegmentedControl>
        </div>
        <nav aria-label={t(viewLabels.range)} className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => {
              move(-1)
            }}
            data-testid="club-calendar-previous"
          >
            {t(viewLabels.previous)}
          </Button>
          <Button
            type="button"
            variant={isCurrent ? 'default' : 'outline'}
            className="min-h-11"
            onClick={showCurrent}
            data-testid="club-calendar-current"
          >
            {t(viewLabels.current)}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => {
              move(1)
            }}
            data-testid="club-calendar-next"
          >
            {t(viewLabels.next)}
          </Button>
        </nav>
      </div>
      <p className="text-muted-foreground text-sm" aria-live="polite" data-testid="club-calendar-range">
        {label}
      </p>
      {query.data?.trimmed ? (
        <Alert status="information" data-testid="club-calendar-trimmed">
          <p className="max-w-prose">{t('activities.club.calendar.trimmed', { days: CALENDAR_RANGE_MAX_DAYS })}</p>
        </Alert>
      ) : null}
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      {content}
    </>
  )
}

export function ClubCalendarPage() {
  return <ActivitiesClubFrame>{(profile) => <Calendar profile={profile} />}</ActivitiesClubFrame>
}
