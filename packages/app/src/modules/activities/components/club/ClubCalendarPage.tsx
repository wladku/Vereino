'use client'
// `/club/calendar` (club spec UI row `/club/calendar`, REQ-006, REQ-007; foundation II P-23 `CalendarList`; #32): one
// week of sessions as the member sees them — a guardian one calendar of every ward across every section (optionally
// one ward), a participant their own sessions, a coach their groups — with place, address and times in the club's time
// zone, each ward's declaration and the declaration buttons the club's model offers ("Report absence" for an
// `absence_only` activity type, "Attending / Not attending" for `confirm`). The toolbar moves by whole weeks; no month
// on a phone. The declaration result is announced through an `aria-live` region.
import * as React from 'react'
import Link from 'next/link'
import { useQueryClient } from '@tanstack/react-query'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { Button } from '@open-mercato/ui/primitives/button'
import { Label } from '@open-mercato/ui/primitives/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { calendarDateInZone, calendarWeek, groupCalendarItemsByDay } from '@vereino/core'
import { CalendarList, type MemberLinkProps } from '@vereino/ui'
import { ActivitiesClubFrame } from './ActivitiesClubFrame'
import {
  CALENDAR_QUERY_KEY,
  SESSION_QUERY_KEY,
  declareAttendance,
  errorText,
  fullName,
  parseActionId,
  perspectivesOf,
  toCalendarItem,
  useMemberCalendar,
  type ClubProfile,
  type MemberPerspective,
} from './club-client'

const ALL_WARDS = 'all'

function MemberLink({ href, className, children }: MemberLinkProps) {
  return (
    <Link href={href} className={className}>
      {children}
    </Link>
  )
}

function Calendar({ profile }: { profile: ClubProfile }) {
  const t = useT()
  const locale = useLocale()
  const queryClient = useQueryClient()
  const perspectives = perspectivesOf(profile)
  const [as, setAs] = React.useState<MemberPerspective>(perspectives[0] ?? 'self')
  const [ward, setWard] = React.useState<string>(ALL_WARDS)
  const [offset, setOffset] = React.useState(0)
  const [busyItemId, setBusyItemId] = React.useState<string | null>(null)
  const [announcement, setAnnouncement] = React.useState('')
  const timeZone = profile.club.timezone
  const today = calendarDateInZone(new Date(), timeZone)
  const week = calendarWeek(today, offset)
  const query = useMemberCalendar({
    as,
    from: week.from,
    to: week.to,
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
    try {
      await declareAttendance({ occurrenceId: itemId, ...action }, t('activities.club.errors.declare'))
      const message = t('activities.club.flash.declared')
      setAnnouncement(message)
      flash(message, 'success')
    } catch (error: unknown) {
      flash(errorText(error, t('activities.club.errors.declare')), 'error')
    } finally {
      setBusyItemId(null)
      await queryClient.invalidateQueries({ queryKey: [CALENDAR_QUERY_KEY] })
      await queryClient.invalidateQueries({ queryKey: [SESSION_QUERY_KEY] })
    }
  }

  const rangeLabel = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', timeZone: 'UTC' }).formatRange(
    new Date(`${week.from}T12:00:00Z`),
    new Date(`${week.to}T12:00:00Z`),
  )

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
          empty: t('activities.club.calendar.empty'),
          done: t('activities.occurrences.status.done'),
          cancelled: t('activities.occurrences.status.cancelled'),
        }}
        Link={MemberLink}
        onAction={(itemId, actionId) => void onAction(itemId, actionId)}
        busyItemId={busyItemId}
      />
    )

  return (
    <>
      <h1 className="text-2xl font-semibold">{t('activities.club.calendar.title')}</h1>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end" data-testid="club-calendar-toolbar">
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
        <nav aria-label={t('activities.club.calendar.range')} className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => {
              setOffset((value) => value - 1)
            }}
            data-testid="club-calendar-previous"
          >
            {t('activities.club.calendar.previous')}
          </Button>
          <Button
            type="button"
            variant={offset === 0 ? 'default' : 'outline'}
            className="min-h-11"
            onClick={() => {
              setOffset(0)
            }}
          >
            {t('activities.club.calendar.thisWeek')}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => {
              setOffset((value) => value + 1)
            }}
            data-testid="club-calendar-next"
          >
            {t('activities.club.calendar.next')}
          </Button>
        </nav>
      </div>
      <p className="text-muted-foreground text-sm" aria-live="polite" data-testid="club-calendar-range">
        {rangeLabel}
      </p>
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
