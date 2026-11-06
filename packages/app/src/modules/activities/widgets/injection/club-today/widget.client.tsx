'use client'
// The calendar and attendance tiles of `/club` — Today (club spec `/club` wireframe and *Behavior*; README M-02; REQ-006,
// REQ-007; #32, E06-S16 #98): the sessions of today and tomorrow for every ward (or the member's own), each a card with
// a link to its session page — time, activity, group, section and place — and, per concerned person, the declaration
// status with the buttons the session's kind offers ("Report absence" for an absence-only kind, "Attending / Not
// attending" for a confirm kind), so a declaration takes two taps; the badges "declarations closed" and "cancelled:
// {reason}"; and — for a guardian — the wards' declarations waiting for a decision in the next two weeks, with their
// date and time. With nothing today or tomorrow the tile names the next session; a failed read offers "Try again". The
// attendance tile renders only when something waits (no empty placeholders). The header's acting context (E06-S19 #101)
// narrows both to one ward or the member's own sessions. A person who coaches also gets "My sessions today and
// tomorrow" (E06-S15 #97): each session leads to its page as the coach, with an "Attendance list" button and a "Needs a
// coach" marker. The coach tile is added to the member tiles, so a coach who is also a guardian sees both; acting as a
// coach (the header switcher) leaves it alone.
import * as React from 'react'
import Link from 'next/link'
import { useQueryClient } from '@tanstack/react-query'
import { surfaceRecordConflict } from '@open-mercato/ui/backend/conflicts'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { Button } from '@open-mercato/ui/primitives/button'
import { ButtonGroup } from '@open-mercato/ui/primitives/button-group'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import type { InjectionWidgetComponentProps } from '@open-mercato/shared/modules/widgets/injection'
import { addCalendarDays, calendarDateInZone } from '@vereino/core'
import { badgeVariant, formatClockTime, formatTimeRange, memberCalendarScope, useMemberContext } from '@vereino/ui'
import {
  declarationButtons,
  savedDeclarationKey,
  sessionMoment,
  splitTodaySessions,
  todayEntryNotice,
  weekdayAndTime,
} from '../../../lib/club-today'
import {
  CALENDAR_QUERY_KEY,
  CLUB_CALENDAR_HREF,
  SESSION_QUERY_KEY,
  attendanceHref,
  declarationChoices,
  declarationLabel,
  declarationState,
  declareAttendance,
  errorText,
  sessionHref,
  useMemberCalendar,
  type CalendarEntry,
  type CalendarPerson,
  type DeclaredValue,
  type MemberPerspective,
} from '../../../components/club/club-client'
import { needsCoach } from '../../../lib/activities-rules'

/** The slice of `people`'s member profile the Today page passes as the spot context. */
export type ClubTodayContext = {
  profile?: {
    person?: { id: string }
    wards?: { personId: string; firstName: string; lastName: string }[]
    contexts?: string[]
    club?: { timezone?: string }
  }
}

const TILE_CLASS = 'bg-card flex h-full flex-col gap-2 rounded-lg border p-4'
const LINK_CLASS = 'hover:bg-accent focus-visible:shadow-focus flex min-h-11 flex-col rounded-md px-2 py-1 outline-none'
const PENDING_WINDOW_DAYS = 13
/** Beyond this many days a weekday alone is ambiguous, so the next session also names its date. */
const WEEK_AHEAD_DAYS = 6

function entryLine(entry: CalendarEntry, guardian: boolean): string {
  const names = guardian ? entry.persons.map((person) => person.firstName).join(', ') : ''
  const title = entry.occurrence.activityName ?? entry.occurrence.groupName ?? ''
  return names ? `${names} · ${title}` : title
}

/** "Today" / "Tomorrow", the gathering time (DD-43) and the time range of a session row. */
function SessionWhen({ entry, today, timeZone }: { entry: CalendarEntry; today: string; timeZone: string }) {
  const t = useT()
  const locale = useLocale()
  const { occurrence } = entry
  return (
    <span className="text-sm font-medium">
      {occurrence.occurrenceDate === today ? t('activities.club.today.today') : t('activities.club.today.tomorrow')}{' '}
      {occurrence.gatheringAt ? (
        <span data-testid="club-today-gathering">
          {t('activities.gathering.at', {
            time: formatClockTime(new Date(occurrence.gatheringAt), locale, timeZone),
          })}
          {' · '}
        </span>
      ) : null}
      {formatTimeRange(new Date(occurrence.startAt), new Date(occurrence.endAt), locale, timeZone)}
    </span>
  )
}

/** The coach's sessions of today and tomorrow (E06-S15 #97): the session page as the coach and its attendance list. */
function CoachTile({
  entries,
  loading,
  failed,
  onRetry,
  today,
  timeZone,
}: {
  entries: CalendarEntry[]
  loading: boolean
  failed: boolean
  onRetry: () => void
  today: string
  timeZone: string
}) {
  const t = useT()
  let body: React.ReactNode
  if (loading) body = <p className="text-muted-foreground text-sm">{t('activities.club.today.loading')}</p>
  else if (failed) {
    body = (
      <div className="flex flex-col items-start gap-2">
        <p className="text-muted-foreground text-sm">{t('activities.club.errors.calendar')}</p>
        <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={onRetry}>
          {t('activities.club.actions.retry')}
        </Button>
      </div>
    )
  } else if (entries.length === 0)
    body = <p className="text-muted-foreground text-sm">{t('activities.club.today.coachEmpty')}</p>
  else {
    body = (
      <ul className="flex flex-col gap-3">
        {entries.map((entry) => (
          <li key={entry.occurrence.id} className="flex flex-col gap-1" data-testid="club-today-coach-session">
            <Link href={sessionHref(entry.occurrence.id, 'coach')} className={LINK_CLASS}>
              <SessionWhen entry={entry} today={today} timeZone={timeZone} />
              <span className="text-sm">
                {[entry.occurrence.activityName, entry.occurrence.groupName].filter(Boolean).join(' · ')}
              </span>
              {entry.occurrence.placeName ? (
                <span className="text-muted-foreground text-xs">{entry.occurrence.placeName}</span>
              ) : null}
            </Link>
            <div className="flex flex-wrap items-center gap-2 px-2">
              {entry.occurrence.status === 'cancelled' ? (
                <StatusBadge variant="error">{t('activities.occurrences.status.cancelled')}</StatusBadge>
              ) : null}
              {needsCoach(entry.occurrence) ? (
                <span data-testid="club-today-needs-coach">
                  <StatusBadge variant="warning">{t('activities.club.session.needsCoach')}</StatusBadge>
                </span>
              ) : null}
              {entry.occurrence.status !== 'cancelled' ? (
                <Button asChild size="sm" variant="outline" className="min-h-11">
                  <Link href={attendanceHref(entry.occurrence.id)} data-testid="club-today-attendance-list">
                    {t('activities.club.session.attendanceList')}
                  </Link>
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    )
  }
  return (
    <div className={TILE_CLASS} data-testid="club-tile-coach">
      <h3 className="font-semibold">{t('activities.club.today.coachSessions')}</h3>
      {body}
      <Link href={CLUB_CALENDAR_HREF} className="text-primary inline-flex min-h-11 items-center text-sm underline">
        {t('activities.club.today.openCalendar')}
      </Link>
    </div>
  )
}

function PersonDeclaration({
  entry,
  person,
  as,
  named,
  busy,
  onDeclare,
}: {
  entry: CalendarEntry
  person: CalendarPerson
  as: MemberPerspective
  named: boolean
  busy: boolean
  onDeclare: (person: CalendarPerson, declared: DeclaredValue) => void
}) {
  const t = useT()
  const buttons = declarationButtons(entry, person, as)
  const state = declarationState(entry.declarationKind, person.declaration)
  return (
    <div className="flex flex-col gap-2 px-2" data-testid="club-today-person" data-person-id={person.personId}>
      <div className="flex flex-wrap items-center gap-2">
        {named ? <span className="text-sm font-medium">{person.firstName}</span> : null}
        <span data-testid="club-today-declaration">
          <StatusBadge variant={badgeVariant(state.tone)}>
            {declarationLabel(t, entry.declarationKind, person.declaration)}
          </StatusBadge>
        </span>
      </div>
      {person.guardianOnly ? (
        <p className="text-muted-foreground text-sm">{t('activities.club.session.guardianOnly')}</p>
      ) : null}
      {as === 'self' && person.needsGuardianConfirmation && buttons === 'enabled' ? (
        <p className="text-muted-foreground text-sm">{t('activities.club.session.needsGuardian')}</p>
      ) : null}
      {buttons !== 'hidden' ? (
        <ButtonGroup aria-label={t('activities.club.today.declareFor', { name: person.firstName })}>
          {declarationChoices(entry.declarationKind, person.declaration).map((choice) => {
            const current =
              person.declaration?.declarationStatus === 'final' && person.declaration.declared === choice.declared
            return (
              <Button
                key={choice.declared}
                type="button"
                variant={current ? 'default' : 'outline'}
                className="min-h-11"
                disabled={buttons === 'disabled' || busy}
                aria-pressed={current}
                data-declared={choice.declared}
                onClick={() => {
                  // The chosen answer stays readable at full contrast; tapping it again sends nothing.
                  if (!current) onDeclare(person, choice.declared)
                }}
              >
                {t(`activities.club.actions.${choice.key}`)}
                {named ? <span className="sr-only"> — {person.firstName}</span> : null}
              </Button>
            )
          })}
        </ButtonGroup>
      ) : null}
    </div>
  )
}

export default function ClubTodayTilesWidget({
  context,
}: InjectionWidgetComponentProps<ClubTodayContext, Record<string, unknown>>) {
  const t = useT()
  const locale = useLocale()
  const queryClient = useQueryClient()
  const timeZone = context.profile?.club?.timezone ?? 'Europe/Warsaw'
  const person = context.profile?.person
  const profile = person
    ? { person, wards: context.profile?.wards ?? [], contexts: context.profile?.contexts ?? [] }
    : null
  const [selection] = useMemberContext(profile)
  const coaches = profile?.contexts.includes('coach') ?? false
  // Acting as a coach, the member tiles step aside; otherwise the coach tile is added to them.
  const actingAsMember = selection.role === 'member'
  const scope = profile
    ? memberCalendarScope(profile, { ...selection, role: 'member' })
    : { as: 'self' as const, personId: null }
  const guardian = scope.as === 'guardian'
  const today = calendarDateInZone(new Date(), timeZone)
  const tomorrow = addCalendarDays(today, 1)
  const query = useMemberCalendar(
    actingAsMember
      ? { as: scope.as, from: today, to: addCalendarDays(today, PENDING_WINDOW_DAYS), personId: scope.personId }
      : null,
  )
  const coachQuery = useMemberCalendar(coaches ? { as: 'coach', from: today, to: tomorrow } : null)
  const [busy, setBusy] = React.useState(false)
  const [announcement, setAnnouncement] = React.useState('')
  const entries = query.data?.items ?? []
  const { soon, next } = splitTodaySessions(entries, today, tomorrow)
  const pending = guardian
    ? entries.flatMap((entry) =>
        entry.declarationsOpen
          ? entry.persons
              .filter((person) => person.declaration?.declarationStatus === 'pending_guardian')
              .map((person) => ({ entry, person }))
          : [],
      )
    : []

  const declare = async (entry: CalendarEntry, target: CalendarPerson, declared: DeclaredValue) => {
    setBusy(true)
    try {
      await declareAttendance(
        { occurrenceId: entry.occurrence.id, personId: target.personId, declared },
        t('activities.club.errors.declare'),
        target.declaration?.updatedAt ?? null,
      )
      const success = t(
        scope.as === 'self' && target.needsGuardianConfirmation
          ? 'activities.club.flash.savedPendingGuardian'
          : savedDeclarationKey(declared),
        { name: target.firstName },
      )
      setAnnouncement(success)
      flash(success, 'success')
    } catch (error: unknown) {
      // A change made meanwhile (another guardian, the ward) shows the shared conflict bar; the tile then refreshes.
      if (!surfaceRecordConflict(error, t)) flash(errorText(error, t('activities.club.errors.declare')), 'error')
    } finally {
      setBusy(false)
      await queryClient.invalidateQueries({ queryKey: [CALENDAR_QUERY_KEY] })
      await queryClient.invalidateQueries({ queryKey: [SESSION_QUERY_KEY] })
    }
  }

  let calendarBody: React.ReactNode
  if (!query.data && query.isFetching) {
    calendarBody = <p className="text-muted-foreground text-sm">{t('activities.club.today.loading')}</p>
  } else if (!query.data) {
    calendarBody = (
      <div className="flex flex-col items-start gap-2" data-testid="club-today-error">
        <p className="text-sm">{t('activities.club.errors.calendar')}</p>
        <Button type="button" variant="outline" className="min-h-11" onClick={() => void query.refetch()}>
          {t('activities.club.actions.retry')}
        </Button>
      </div>
    )
  } else if (soon.length === 0) {
    const nextAt = next
      ? weekdayAndTime(
          new Date(next.occurrence.startAt),
          locale,
          timeZone,
          next.occurrence.occurrenceDate > addCalendarDays(today, WEEK_AHEAD_DAYS),
        )
      : null
    calendarBody = (
      <p className="text-muted-foreground text-sm" data-testid="club-today-empty">
        {next && nextAt
          ? t('activities.club.today.emptyNext', {
              day: nextAt.day,
              time: nextAt.time,
              section: next.occurrence.sectionName ?? next.occurrence.activityName ?? next.occurrence.groupName ?? '',
            })
          : t('activities.club.today.empty')}
      </p>
    )
  } else {
    calendarBody = (
      <ul className="flex flex-col gap-3">
        {soon.map((entry) => {
          const { occurrence } = entry
          const notice = todayEntryNotice(entry)
          const named = guardian || entry.persons.length > 1
          const groupLine = [occurrence.groupName, occurrence.sectionName].filter(Boolean).join(' · ')
          return (
            <li
              key={occurrence.id}
              className="flex flex-col gap-2 rounded-md border p-2"
              data-testid="club-today-card"
              data-occurrence-id={occurrence.id}
            >
              <Link
                href={sessionHref(occurrence.id, scope.as, scope.personId)}
                className={LINK_CLASS}
                data-testid="club-today-session"
              >
                <SessionWhen entry={entry} today={today} timeZone={timeZone} />
                <span className="text-sm">{entryLine(entry, guardian)}</span>
                {groupLine ? <span className="text-muted-foreground text-xs">{groupLine}</span> : null}
                {occurrence.placeName ? (
                  <span className="text-muted-foreground text-xs">{occurrence.placeName}</span>
                ) : null}
              </Link>
              {notice ? (
                <span className="px-2" data-testid="club-today-notice" data-notice={notice.kind}>
                  <StatusBadge variant={notice.kind === 'cancelled' ? 'error' : 'neutral'}>
                    {notice.kind === 'closed'
                      ? t('activities.club.today.closed')
                      : notice.reason
                        ? t('activities.club.today.cancelledReason', { reason: notice.reason })
                        : t('activities.occurrences.status.cancelled')}
                  </StatusBadge>
                </span>
              ) : null}
              {occurrence.status === 'cancelled'
                ? null
                : entry.persons.map((target) => (
                    <PersonDeclaration
                      key={target.personId}
                      entry={entry}
                      person={target}
                      as={scope.as}
                      named={named}
                      busy={busy}
                      onDeclare={(chosen, declared) => void declare(entry, chosen, declared)}
                    />
                  ))}
            </li>
          )
        })}
      </ul>
    )
  }

  return (
    <section aria-labelledby="club-today-activities" className="flex flex-col gap-3">
      <h2 id="club-today-activities" className="sr-only">
        {t('activities.club.today.title')}
      </h2>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {coaches ? (
          <li>
            <CoachTile
              entries={coachQuery.data?.items ?? []}
              loading={!coachQuery.data && coachQuery.isFetching}
              failed={!coachQuery.data && !coachQuery.isFetching}
              onRetry={() => void coachQuery.refetch()}
              today={today}
              timeZone={timeZone}
            />
          </li>
        ) : null}
        {actingAsMember ? (
          <li>
            <div className={TILE_CLASS} data-testid="club-tile-calendar">
              <h3 className="font-semibold">{t('activities.club.today.calendar')}</h3>
              {calendarBody}
              <Link
                href={CLUB_CALENDAR_HREF}
                className="text-primary inline-flex min-h-11 items-center text-sm underline"
              >
                {t('activities.club.today.openCalendar')}
              </Link>
              <p className="sr-only" aria-live="polite" data-testid="club-today-announcement">
                {announcement}
              </p>
            </div>
          </li>
        ) : null}
        {pending.length > 0 ? (
          <li>
            <div className={TILE_CLASS} data-testid="club-tile-attendance">
              <h3 className="font-semibold">{t('activities.club.today.attendance')}</h3>
              <ul className="flex flex-col gap-2">
                {pending.map(({ entry, person }) => (
                  <li key={`${entry.occurrence.id}:${person.personId}`}>
                    <Link
                      href={sessionHref(entry.occurrence.id, 'guardian', person.personId)}
                      className={LINK_CLASS}
                      data-testid="club-today-pending"
                    >
                      <span className="text-sm">
                        {t('activities.club.today.waiting', {
                          name: person.firstName,
                          activity: entry.occurrence.activityName ?? '',
                          when: sessionMoment(new Date(entry.occurrence.startAt), locale, timeZone),
                        })}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </li>
        ) : null}
      </ul>
    </section>
  )
}
