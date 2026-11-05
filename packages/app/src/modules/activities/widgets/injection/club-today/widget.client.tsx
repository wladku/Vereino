'use client'
// The calendar and attendance tiles of `/club` — Today (club spec `/club` wireframe and *Behavior*; REQ-006, REQ-007;
// #32): the sessions of today and tomorrow for every ward (or the member's own), each a link to its session page, and —
// for a guardian — the wards' declarations waiting for a decision in the next two weeks. The calendar tile is always
// rendered (with "No classes today or tomorrow" and the way to the calendar); the attendance tile only when something
// waits (no empty placeholders). The header's acting context (E06-S19 #101) narrows both: one ward, the member's own
// sessions, or — acting as a coach — "My sessions today" with the way into each attendance list.
import * as React from 'react'
import Link from 'next/link'
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
const PENDING_WINDOW_DAYS = 13

function entryLine(entry: CalendarEntry, guardian: boolean): string {
  const names = guardian ? entry.persons.map((person) => person.firstName).join(', ') : ''
  const title = entry.occurrence.activityName ?? entry.occurrence.groupName ?? ''
  return names ? `${names} · ${title}` : title
}

export default function ClubTodayTilesWidget({
  context,
}: InjectionWidgetComponentProps<ClubTodayContext, Record<string, unknown>>) {
  const t = useT()
  const locale = useLocale()
  const timeZone = context.profile?.club?.timezone ?? 'Europe/Warsaw'
  const person = context.profile?.person
  const profile = person
    ? { person, wards: context.profile?.wards ?? [], contexts: context.profile?.contexts ?? [] }
    : null
  const [selection] = useMemberContext(profile)
  const scope = profile ? memberCalendarScope(profile, selection) : { as: 'self' as const, personId: null }
  const guardian = scope.as === 'guardian'
  const coach = scope.as === 'coach'
  const today = calendarDateInZone(new Date(), timeZone)
  const tomorrow = addCalendarDays(today, 1)
  const query = useMemberCalendar({
    as: scope.as,
    from: today,
    to: addCalendarDays(today, PENDING_WINDOW_DAYS),
    personId: scope.personId,
  })
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
              href={
                scope.as === 'coach'
                  ? attendanceHref(entry.occurrence.id)
                  : sessionHref(entry.occurrence.id, scope.as, scope.personId)
              }
              className="hover:bg-accent focus-visible:shadow-focus flex min-h-11 flex-col rounded-md px-2 py-1 outline-none"
              data-testid="club-today-session"
            >
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
                {formatTimeRange(
                  new Date(entry.occurrence.startAt),
                  new Date(entry.occurrence.endAt),
                  locale,
                  timeZone,
                )}
                {entry.occurrence.status === 'cancelled' ? (
                  <>
                    {' '}
                    <StatusBadge variant="error">{t('activities.occurrences.status.cancelled')}</StatusBadge>
                  </>
                ) : null}
              </span>
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
        <li>
          <div className={TILE_CLASS} data-testid="club-tile-calendar">
            <h3 className="font-semibold">
              {coach ? t('activities.club.today.coachSessions') : t('activities.club.today.calendar')}
            </h3>
            {calendarBody}
            <Link
              href={CLUB_CALENDAR_HREF}
              className="text-primary inline-flex min-h-11 items-center text-sm underline"
            >
              {t('activities.club.today.openCalendar')}
            </Link>
          </div>
        </li>
        {pending.length > 0 ? (
          <li>
            <div className={TILE_CLASS} data-testid="club-tile-attendance">
              <h3 className="font-semibold">{t('activities.club.today.attendance')}</h3>
              <ul className="flex flex-col gap-2">
                {pending.map(({ entry, person }) => (
                  <li key={`${entry.occurrence.id}:${person.personId}`}>
                    <Link
                      href={sessionHref(entry.occurrence.id, 'guardian', person.personId)}
                      className="hover:bg-accent focus-visible:shadow-focus flex min-h-11 flex-col rounded-md px-2 py-1 outline-none"
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
