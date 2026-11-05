'use client'
// The calendar and attendance tiles of `/club` — Today (club spec `/club` wireframe and *Behavior*; REQ-006, REQ-007;
// #32): the sessions of today and tomorrow for every ward (or the member's own), each a link to its session page, and —
// for a guardian — the wards' declarations waiting for a decision in the next two weeks. The calendar tile is always
// rendered (with "No classes today or tomorrow" and the way to the calendar); the attendance tile only when something
// waits (no empty placeholders). The header's acting context (E06-S19 #101) narrows both to one ward or the member's
// own sessions. A person who coaches also gets "My sessions today and tomorrow" (E06-S15 #97): each session leads to
// its page as the coach, with an "Attendance list" button and a "Needs a coach" marker. The coach tile is added to the
// member tiles, so a coach who is also a guardian sees both; acting as a coach (the header switcher) leaves it alone.
import * as React from 'react'
import Link from 'next/link'
import { Button } from '@open-mercato/ui/primitives/button'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import type { InjectionWidgetComponentProps } from '@open-mercato/shared/modules/widgets/injection'
import { addCalendarDays, calendarDateInZone } from '@vereino/core'
import { formatClockTime, formatTimeRange, memberCalendarScope, useMemberContext } from '@vereino/ui'
import {
  CLUB_CALENDAR_HREF,
  attendanceHref,
  sessionHref,
  useMemberCalendar,
  type CalendarEntry,
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
const ROW_LINK_CLASS =
  'hover:bg-accent focus-visible:shadow-focus flex min-h-11 flex-col rounded-md px-2 py-1 outline-none'
const PENDING_WINDOW_DAYS = 13

function entryLine(entry: CalendarEntry, guardian: boolean): string {
  const names = guardian ? entry.persons.map((person) => person.firstName).join(', ') : ''
  const title = entry.occurrence.activityName ?? entry.occurrence.groupName ?? ''
  return names ? `${names} · ${title}` : title
}

function SessionWhen({ entry, today, timeZone }: { entry: CalendarEntry; today: string; timeZone: string }) {
  const t = useT()
  const locale = useLocale()
  return (
    <span className="text-sm font-medium">
      {entry.occurrence.occurrenceDate === today
        ? t('activities.club.today.today')
        : t('activities.club.today.tomorrow')}{' '}
      {entry.occurrence.gatheringAt ? (
        <span data-testid="club-today-gathering">
          {t('activities.gathering.at', {
            time: formatClockTime(new Date(entry.occurrence.gatheringAt), locale, timeZone),
          })}
          {' · '}
        </span>
      ) : null}
      {formatTimeRange(new Date(entry.occurrence.startAt), new Date(entry.occurrence.endAt), locale, timeZone)}
      {entry.occurrence.status === 'cancelled' ? (
        <>
          {' '}
          <StatusBadge variant="error">{t('activities.occurrences.status.cancelled')}</StatusBadge>
        </>
      ) : null}
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
            <Link href={sessionHref(entry.occurrence.id, 'coach')} className={ROW_LINK_CLASS}>
              <SessionWhen entry={entry} today={today} timeZone={timeZone} />
              <span className="text-sm">
                {[entry.occurrence.activityName, entry.occurrence.groupName].filter(Boolean).join(' · ')}
              </span>
              {entry.occurrence.placeName ? (
                <span className="text-muted-foreground text-xs">{entry.occurrence.placeName}</span>
              ) : null}
            </Link>
            <div className="flex flex-wrap items-center gap-2 px-2">
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

export default function ClubTodayTilesWidget({
  context,
}: InjectionWidgetComponentProps<ClubTodayContext, Record<string, unknown>>) {
  const t = useT()
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
  const entries = query.data?.items ?? []
  const soon = entries.filter(
    (entry) => entry.occurrence.occurrenceDate === today || entry.occurrence.occurrenceDate === tomorrow,
  )
  const pending = guardian
    ? entries.flatMap((entry) =>
        entry.declarationsOpen
          ? entry.persons
              .filter((person) => person.declaration?.declarationStatus === 'pending_guardian')
              .map((person) => ({ entry, person }))
          : [],
      )
    : []

  let calendarBody: React.ReactNode
  if (!query.data && query.isFetching) {
    calendarBody = <p className="text-muted-foreground text-sm">{t('activities.club.today.loading')}</p>
  } else if (!query.data) {
    calendarBody = <p className="text-muted-foreground text-sm">{t('activities.club.errors.calendar')}</p>
  } else if (soon.length === 0) {
    calendarBody = <p className="text-muted-foreground text-sm">{t('activities.club.today.empty')}</p>
  } else {
    calendarBody = (
      <ul className="flex flex-col gap-2">
        {soon.map((entry) => (
          <li key={entry.occurrence.id}>
            <Link
              href={sessionHref(entry.occurrence.id, scope.as, scope.personId)}
              className={ROW_LINK_CLASS}
              data-testid="club-today-session"
            >
              <SessionWhen entry={entry} today={today} timeZone={timeZone} />
              <span className="text-sm">{entryLine(entry, guardian)}</span>
              {entry.occurrence.placeName ? (
                <span className="text-muted-foreground text-xs">{entry.occurrence.placeName}</span>
              ) : null}
            </Link>
          </li>
        ))}
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
                      className={ROW_LINK_CLASS}
                      data-testid="club-today-pending"
                    >
                      <span className="text-sm">
                        {t('activities.club.today.waiting', {
                          name: person.firstName,
                          activity: entry.occurrence.activityName ?? '',
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
