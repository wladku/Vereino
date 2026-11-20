'use client'
// `/club/calendar` (club spec UI row `/club/calendar` "week/month calendar", REQ-006, REQ-007; README M-03; foundation
// II P-23 `CalendarList`; #32; E06-S18 #100): the sessions as the member sees them — a guardian one calendar of every
// ward across every section (optionally one ward), a participant their own sessions, a coach their groups — with the
// section legend and each card's section marker (a colour and the section's name), place, address, coach and times in
// the club's time zone, each ward's declaration and the declaration buttons the club's model offers ("Report absence"
// for an `absence_only` activity type, "Attending / Not attending" for `confirm`). Whose sessions it shows follows the
// header's acting context and ward switcher (E06-S19 #101). A Week/Month switch (owner, Q1 of
// #100): the week is the default, the month is a list of the days that have sessions — no grid, so it reads at 375 px.
// The toolbar moves by whole weeks or months, and an empty week or month offers the next one. A link may open a range
// (`?from=&to=`); a range the API refuses as longer than 62 days is read again trimmed, with a notice. The declaration
// result is announced through an `aria-live` region. Acting in the staff context, the heading carries "New event"
// (#140). In the member context a person who coaches sees the member side and the coached sessions in one list by
// start time, a shared session once and opened as the coach; when one of the two reads fails, the other list shows with
// a retry line (spec N, REQ-N07). E10-S08 (#273, REQ-A10): in the staff context a section coordinator gets the
// section calendar (`?as=coordinator`) — on its own when they do not coach, behind the "My sessions / Section" switch
// when they do — with a section filter (more than one section) and the view chips All / Needing a coach / Needs a new
// time / Unsettled / Cancelled as a tablist that scrolls at 375 px; "All" is the section's week or month, every other
// view the list of the panel's sessions view, with an empty state that leads back to All. The cards open the session
// as the coordinator.
import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { surfaceRecordConflict } from '@open-mercato/ui/backend/conflicts'
import { ErrorMessage } from '@open-mercato/ui/backend/detail'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { Alert } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import { SegmentedControl, SegmentedControlItem } from '@open-mercato/ui/primitives/segmented-control'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@open-mercato/ui/primitives/tabs'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import {
  CALENDAR_RANGE_MAX_DAYS,
  calendarDateInZone,
  groupCalendarItemsByDay,
  type CalendarDate,
  type DateWindow,
} from '@vereino/core'
import {
  CalendarList,
  memberCalendarScopes,
  memberStaffScopes,
  useMemberContext,
  MemberSkeleton,
  type MemberLinkProps,
} from '@vereino/ui'
import {
  CALENDAR_VIEWS,
  calendarViewWindow,
  isCalendarView,
  mergeCalendarEntries,
  requestedCalendarRange,
  shiftCalendarAnchor,
  windowContains,
  type CalendarView,
} from '../../lib/member-calendar'
import { formatDeadline } from '../../lib/confirm-by'
import {
  CLUB_CALENDAR_PATH,
  SECTION_VIEWS,
  sectionCalendarHref,
  sectionViewOf,
  staffCalendarChoice,
  type SectionListView,
  type SectionView,
  type StaffCalendarMode,
} from '../../lib/coordinator-sessions'
import { ActivitiesClubFrame } from './ActivitiesClubFrame'
import {
  CALENDAR_QUERY_KEY,
  SESSION_QUERY_KEY,
  declareAttendance,
  errorText,
  newEventHref,
  parseActionId,
  sectionSessionEntry,
  toCalendarItem,
  useCoordinatorSections,
  useMemberCalendar,
  useSectionSessions,
  type ClubProfile,
  type SectionOption,
} from './club-client'

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

/** The shared labels of the session cards. */
function useListLabels() {
  const t = useT()
  return {
    done: t('activities.occurrences.status.done'),
    cancelled: t('activities.occurrences.status.cancelled'),
    sections: t('activities.club.calendar.sections'),
    coach: t('activities.club.calendar.coach'),
    gathering: t('activities.gathering.label'),
    map: t('activities.club.card.map'),
  }
}

/** "My sessions / Section" for a coordinator who also coaches (#273), kept in the URL (`?as=`). */
function StaffCalendarSwitch({ mode }: { mode: StaffCalendarMode }) {
  const t = useT()
  const router = useRouter()
  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-medium" id="club-calendar-mode-label">
        {t('activities.club.section.switch')}
      </span>
      <SegmentedControl
        value={mode}
        onValueChange={(value: string) => {
          if (value === mode) return
          router.push(value === 'section' ? sectionCalendarHref('all') : `${CLUB_CALENDAR_PATH}?as=coach`)
        }}
        aria-labelledby="club-calendar-mode-label"
        className="h-auto"
        data-testid="club-calendar-mode"
      >
        <SegmentedControlItem value="mine" className="h-11 px-4" data-testid="club-calendar-mode-mine">
          {t('activities.club.section.mine')}
        </SegmentedControlItem>
        <SegmentedControlItem value="section" className="h-11 px-4" data-testid="club-calendar-mode-section">
          {t('activities.club.section.section')}
        </SegmentedControlItem>
      </SegmentedControl>
    </div>
  )
}

const ALL_SECTIONS = 'all'

/** The section filter (more than one section) and the view chips of the section calendar (#273). */
function SectionControls({
  view,
  sectionId,
  sections,
}: {
  view: SectionView
  sectionId: string | null
  sections: SectionOption[]
}) {
  const t = useT()
  const router = useRouter()
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {sections.length > 1 ? (
        <div className="flex flex-col gap-1 sm:max-w-xs">
          <span className="text-sm font-medium" id="club-calendar-section-label">
            {t('activities.club.section.filter')}
          </span>
          <Select
            value={sectionId ?? ALL_SECTIONS}
            onValueChange={(value: string) => {
              router.push(sectionCalendarHref(view, value === ALL_SECTIONS ? null : value))
            }}
          >
            <SelectTrigger
              className="min-h-11"
              aria-labelledby="club-calendar-section-label"
              data-testid="club-calendar-section"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_SECTIONS}>{t('activities.club.section.allSections')}</SelectItem>
              {sections.map((section) => (
                <SelectItem key={section.id} value={section.id}>
                  {section.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      {/* The tablist of the section page's `Tabs` (`SectionTabs`); each view's content is its panel. */}
      <div className="-mx-1 overflow-x-auto px-1 pb-1" data-testid="club-calendar-section-views">
        <TabsList aria-label={t('activities.club.section.views')} className="h-auto whitespace-nowrap">
          {SECTION_VIEWS.map((value) => (
            <TabsTrigger key={value} value={value} className="min-h-11">
              {t(`activities.club.section.view.${value}`)}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
    </div>
  )
}

/** The section page's view chips and panels (#273): the `Tabs` root around the whole page, so the tablist in the
 * header controls the panel that holds the list. */
function SectionTabs({
  view,
  sectionId,
  children,
}: {
  view: SectionView
  sectionId: string | null
  children: React.ReactNode
}) {
  const router = useRouter()
  return (
    <Tabs
      value={view}
      className="flex flex-col gap-6"
      onValueChange={(value: string) => {
        if (value !== view) router.push(sectionCalendarHref(sectionViewOf(value), sectionId))
      }}
    >
      {children}
    </Tabs>
  )
}

/** The content of a section view, as the panel of its chip; outside the section page, the content alone. */
function ViewPanel({ view, children }: { view: SectionView | null; children: React.ReactNode }) {
  if (view === null) return <>{children}</>
  return (
    <TabsContent value={view} className="flex flex-col gap-6">
      {children}
    </TabsContent>
  )
}

/** A section view other than "All": the panel's sessions view as cards, by start time (#273). */
function SectionViewList({
  profile,
  view,
  sectionId,
  header,
}: {
  profile: ClubProfile
  view: SectionListView
  sectionId: string | null
  header: React.ReactNode
}) {
  const t = useT()
  const locale = useLocale()
  const labels = useListLabels()
  const timeZone = profile.club.timezone
  const today = calendarDateInZone(new Date(), timeZone)
  const query = useSectionSessions(view, today, sectionId)
  const days = React.useMemo(
    () =>
      groupCalendarItemsByDay(
        (query.data?.items ?? []).map((row) =>
          toCalendarItem(sectionSessionEntry(row), 'coordinator', t, (at) => formatDeadline(at, locale, timeZone)),
        ),
        timeZone,
      ),
    [query.data, t, locale, timeZone],
  )
  let content: React.ReactNode
  if (!query.data && !query.isError)
    content = <MemberSkeleton shape="rows" label={t('activities.club.calendar.loading')} />
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
        labels={{ ...labels, empty: t(`activities.club.section.empty.${view}`) }}
        Link={MemberLink}
        emptyAction={
          <Button asChild variant="outline" className="min-h-11">
            <Link href={sectionCalendarHref('all', sectionId)} data-testid="club-calendar-section-all">
              {t('activities.club.section.backToAll')}
            </Link>
          </Button>
        }
      />
    )
  return (
    <>
      <h1 className="text-2xl font-semibold">{t('activities.club.calendar.title')}</h1>
      {header}
      <ViewPanel view={view}>
        {query.data && query.data.total > query.data.items.length ? (
          <Alert status="information" data-testid="club-calendar-section-more">
            <p className="max-w-prose">
              {t('activities.club.section.more', { shown: query.data.items.length, total: query.data.total })}
            </p>
          </Alert>
        ) : null}
        {content}
      </ViewPanel>
    </>
  )
}

function Calendar({
  profile,
  header,
  section,
}: {
  profile: ClubProfile
  /** The staff switch and the section controls (#273), under the heading. */
  header?: React.ReactNode
  /** The section calendar's "All" view (`as=coordinator`), optionally one section (#273). */
  section?: { sectionId: string | null }
}) {
  const t = useT()
  const locale = useLocale()
  const queryClient = useQueryClient()
  const searchParams = useSearchParams()
  const labels = useListLabels()
  const [selection] = useMemberContext(profile)
  const inSection = section !== undefined
  const scopes = inSection ? [] : memberCalendarScopes(profile, selection)
  const memberScope = scopes.find((scope) => scope.as !== 'coach') ?? null
  const coaching = scopes.some((scope) => scope.as === 'coach')
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
  const memberQuery = useMemberCalendar(
    memberScope ? { as: memberScope.as, from: shown.from, to: shown.to, personId: memberScope.personId } : null,
  )
  const coachQuery = useMemberCalendar(coaching ? { as: 'coach', from: shown.from, to: shown.to } : null)
  const sectionQuery = useMemberCalendar(
    section ? { as: 'coordinator', from: shown.from, to: shown.to, sectionId: section.sectionId } : null,
  )
  const reads = [memberScope ? memberQuery : null, coaching ? coachQuery : null, section ? sectionQuery : null].filter(
    (read) => read !== null,
  )
  const answered = reads.filter((read) => read.data)
  const failed = reads.filter((read) => !read.data && read.isError)
  // Until every read has settled the page shows loading, so a half list never offers "Next week" by mistake.
  const loading = reads.some((read) => !read.data && !read.isError)
  const retry = () => {
    for (const read of failed) void read.refetch()
  }
  const memberAs = memberScope?.as ?? null
  const items = React.useMemo(
    () =>
      mergeCalendarEntries([
        memberAs ? (memberQuery.data?.items ?? []).map((entry) => ({ entry, as: memberAs })) : [],
        coaching ? (coachQuery.data?.items ?? []).map((entry) => ({ entry, as: 'coach' as const })) : [],
        inSection ? (sectionQuery.data?.items ?? []).map((entry) => ({ entry, as: 'coordinator' as const })) : [],
      ]).map(({ entry, as }) => toCalendarItem(entry, as, t, (at) => formatDeadline(at, locale, timeZone))),
    [memberQuery.data, coachQuery.data, sectionQuery.data, memberAs, coaching, inSection, t, locale, timeZone],
  )
  const days = React.useMemo(() => groupCalendarItemsByDay(items, timeZone), [items, timeZone])

  const onAction = async (itemId: string, id: string) => {
    const action = parseActionId(id)
    if (!action) return
    setBusyItemId(itemId)
    const shownDeclaration = memberQuery.data?.items
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

  // The range the API served: after a refused range, the trimmed one (both reads trim alike).
  const servedBy = answered[0]?.data
  const served = servedBy?.trimmed ? { from: servedBy.from, to: servedBy.to } : shown
  const label = rangeLabel(locale, linkRange ? 'link' : view, served)
  const viewLabels = VIEW_LABELS[view]

  let content: React.ReactNode
  if (loading) content = <MemberSkeleton shape="rows" label={t('activities.club.calendar.loading')} />
  else if (answered.length === 0)
    content = (
      <ErrorMessage
        label={t('activities.club.errors.calendar')}
        action={
          <Button type="button" variant="outline" className="min-h-11" onClick={retry}>
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
        labels={{ ...labels, empty: linkRange ? t('activities.club.calendar.empty') : t(viewLabels.empty) }}
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">{t('activities.club.calendar.title')}</h1>
        {selection.role === 'staff' ? (
          <Button asChild className="min-h-11">
            <Link href={newEventHref()} data-testid="club-calendar-new-event">
              {t('activities.club.event.new')}
            </Link>
          </Button>
        ) : null}
      </div>
      {header}
      <ViewPanel view={inSection ? 'all' : null}>
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end" data-testid="club-calendar-toolbar">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium" id="club-calendar-view-label">
              {t('activities.club.calendar.view')}
            </span>
            <SegmentedControl
              value={linkRange ? '' : view}
              onValueChange={switchView}
              aria-labelledby="club-calendar-view-label"
              className="h-auto"
              data-testid="club-calendar-view"
            >
              {CALENDAR_VIEWS.map((entry) => (
                <SegmentedControlItem
                  key={entry}
                  value={entry}
                  className="h-11 px-4"
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
        {answered.length > 0 && failed.length > 0 ? (
          <Alert status="warning" data-testid="club-calendar-partial">
            <div className="flex flex-wrap items-center gap-2">
              <p className="max-w-prose">{t('activities.club.calendar.partial')}</p>
              <Button type="button" variant="outline" className="min-h-11" onClick={retry}>
                {t('activities.club.actions.retry')}
              </Button>
            </div>
          </Alert>
        ) : null}
        {servedBy?.trimmed ? (
          <Alert status="information" data-testid="club-calendar-trimmed">
            <p className="max-w-prose">{t('activities.club.calendar.trimmed', { days: CALENDAR_RANGE_MAX_DAYS })}</p>
          </Alert>
        ) : null}
        <p className="sr-only" aria-live="polite">
          {announcement}
        </p>
        {content}
      </ViewPanel>
    </>
  )
}

/**
 * Which calendar the person sees (#273): their own (member side and coached sessions), or — in the staff context with
 * the coordinator scope — the section calendar, with the switch between both for a coordinator who coaches.
 */
function CalendarPage({ profile }: { profile: ClubProfile }) {
  const searchParams = useSearchParams()
  const [selection] = useMemberContext(profile)
  const choice = staffCalendarChoice(searchParams.get('as'), {
    staff: selection.role === 'staff',
    scopes: memberStaffScopes(profile),
  })
  const sectionMode = choice.mode === 'section'
  const sections = useCoordinatorSections(sectionMode)
  const view = sectionViewOf(searchParams.get('view'))
  const requestedSection = searchParams.get('section')
  // A section the person does not read (an old link) is ignored rather than answering an empty list.
  const sectionId = sections.data?.some((option) => option.id === requestedSection) ? requestedSection : null
  const header =
    choice.switcher || sectionMode ? (
      <>
        {choice.switcher ? <StaffCalendarSwitch mode={choice.mode} /> : null}
        {sectionMode ? <SectionControls view={view} sectionId={sectionId} sections={sections.data ?? []} /> : null}
      </>
    ) : undefined
  if (!sectionMode) return <Calendar profile={profile} header={header} />
  return (
    <SectionTabs view={view} sectionId={sectionId}>
      {view === 'all' ? (
        <Calendar profile={profile} header={header} section={{ sectionId }} />
      ) : (
        <SectionViewList profile={profile} view={view} sectionId={sectionId} header={header} />
      )}
    </SectionTabs>
  )
}

export function ClubCalendarPage() {
  return <ActivitiesClubFrame>{(profile) => <CalendarPage profile={profile} />}</ActivitiesClubFrame>
}
