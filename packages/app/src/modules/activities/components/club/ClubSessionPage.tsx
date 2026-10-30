'use client'
// `/club/occurrences/[id]` (club spec UI row `/club/occurrences/[id]`, REQ-006, REQ-007; #32): one session for the
// member — activity, group, section, date, time, place with its address and a map link, coach — and, per concerned
// person (the member or each ward), the declaration status with the buttons the club's model offers; a guardian's
// decision on a ward's pending declaration ("Approve" / "Reject"); the called-up children the club setting and the
// consents allow; "declarations closed" once the session started; "only your guardian declares" under
// `guardian_only`. A session outside the caller's (or the wards') calendar is "not found".
import * as React from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { Alert } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { badgeVariant, formatDayHeading, formatTimeRange } from '@vereino/ui'
import { ActivitiesClubFrame } from './ActivitiesClubFrame'
import {
  CALENDAR_QUERY_KEY,
  CLUB_CALENDAR_HREF,
  SESSION_QUERY_KEY,
  declarationChoices,
  declarationLabel,
  declarationState,
  decideDeclaration,
  declareAttendance,
  errorText,
  fullName,
  mapHref,
  useMemberSession,
  type CalendarEntry,
  type CalendarPerson,
  type ClubProfile,
  type DeclaredValue,
} from './club-client'

type Perspective = 'self' | 'guardian'

function PersonDeclaration({
  entry,
  person,
  as,
  busy,
  onDeclare,
  onDecide,
}: {
  entry: CalendarEntry
  person: CalendarPerson
  as: Perspective
  busy: boolean
  onDeclare: (person: CalendarPerson, declared: DeclaredValue) => void
  onDecide: (person: CalendarPerson, approve: boolean) => void
}) {
  const t = useT()
  const state = declarationState(entry.declarationKind, person.declaration)
  const pending = person.declaration?.declarationStatus === 'pending_guardian'
  return (
    <li className="bg-card flex flex-col gap-3 rounded-lg border p-4" data-testid="club-session-person">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold">{fullName(person)}</span>
        <StatusBadge variant={badgeVariant(state.tone)} data-testid="club-session-declaration">
          {declarationLabel(t, entry.declarationKind, person.declaration)}
        </StatusBadge>
      </div>
      {person.guardianOnly ? (
        <p className="text-muted-foreground text-sm">{t('activities.club.session.guardianOnly')}</p>
      ) : null}
      {as === 'self' && person.needsGuardianConfirmation && person.canDeclare ? (
        <p className="text-muted-foreground text-sm">{t('activities.club.session.needsGuardian')}</p>
      ) : null}
      {as === 'guardian' && pending && entry.declarationsOpen ? (
        <div className="flex flex-col gap-2" data-testid="club-session-decision">
          <p className="text-sm">
            {t('activities.club.session.pendingDecision', {
              name: person.firstName,
              answer: t(`activities.club.declared.${person.declaration?.declared ?? 'unknown'}`),
            })}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              className="min-h-11"
              disabled={busy}
              onClick={() => {
                onDecide(person, true)
              }}
            >
              {t('activities.club.actions.approve')}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={busy}
              onClick={() => {
                onDecide(person, false)
              }}
            >
              {t('activities.club.actions.reject')}
            </Button>
          </div>
        </div>
      ) : null}
      {entry.declarationsOpen && person.canDeclare ? (
        <div className="flex flex-wrap gap-2">
          {declarationChoices(entry.declarationKind, person.declaration).map((choice) => {
            const current =
              person.declaration?.declarationStatus === 'final' && person.declaration.declared === choice.declared
            return (
              <Button
                key={choice.declared}
                type="button"
                variant={choice.tone === 'primary' ? 'default' : 'outline'}
                className="min-h-11"
                disabled={busy || current}
                aria-pressed={current}
                data-declared={choice.declared}
                onClick={() => {
                  onDeclare(person, choice.declared)
                }}
              >
                {t(`activities.club.actions.${choice.key}`)}
              </Button>
            )
          })}
        </div>
      ) : null}
    </li>
  )
}

function Session({ profile, id }: { profile: ClubProfile; id: string }) {
  const t = useT()
  const locale = useLocale()
  const queryClient = useQueryClient()
  const searchParams = useSearchParams()
  const requested = searchParams.get('as')
  const as: Perspective =
    requested === 'guardian' || (requested !== 'self' && profile.wards.length > 0) ? 'guardian' : 'self'
  const personId = searchParams.get('personId')
  const query = useMemberSession(id, as, personId)
  const [busy, setBusy] = React.useState(false)
  const [announcement, setAnnouncement] = React.useState('')

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: [SESSION_QUERY_KEY] })
    await queryClient.invalidateQueries({ queryKey: [CALENDAR_QUERY_KEY] })
  }

  const run = async (write: () => Promise<void>, success: string, failure: string) => {
    setBusy(true)
    try {
      await write()
      setAnnouncement(success)
      flash(success, 'success')
    } catch (error: unknown) {
      flash(errorText(error, failure), 'error')
    } finally {
      setBusy(false)
      await refresh()
    }
  }

  const back = (
    <Link href={CLUB_CALENDAR_HREF} className="text-primary inline-flex min-h-11 items-center text-sm underline">
      {t('activities.club.session.back')}
    </Link>
  )

  if (!query.data && query.isFetching) return <LoadingMessage label={t('activities.club.session.loading')} />
  if (!query.data) {
    return (
      <ErrorMessage
        label={t('activities.club.errors.session')}
        action={
          <Button type="button" variant="outline" className="min-h-11" onClick={() => void query.refetch()}>
            {t('activities.club.actions.retry')}
          </Button>
        }
      />
    )
  }
  if (query.data.status === 'not_found') {
    return (
      <>
        {back}
        <Alert status="warning" data-testid="club-session-missing">
          <p className="max-w-prose">{t('activities.club.session.notFound')}</p>
        </Alert>
      </>
    )
  }
  const { entry } = query.data
  const { occurrence } = entry
  const startsAt = new Date(occurrence.startAt)
  const map = mapHref(occurrence.placeGeoLat, occurrence.placeGeoLng)
  const rows: Array<[string, React.ReactNode]> = [
    [t('activities.club.session.date'), formatDayHeading(occurrence.occurrenceDate, locale)],
    [t('activities.club.session.time'), formatTimeRange(startsAt, new Date(occurrence.endAt), locale, entry.timeZone)],
    [t('activities.club.session.group'), [occurrence.groupName, occurrence.sectionName].filter(Boolean).join(' · ')],
    [
      t('activities.club.session.place'),
      <span key="place" className="flex flex-col gap-1">
        <span>{occurrence.placeName ?? t('activities.common.empty')}</span>
        {occurrence.placeAddress ? (
          <span className="text-muted-foreground text-sm" data-testid="club-session-address">
            {occurrence.placeAddress}
          </span>
        ) : null}
        {map ? (
          <a
            href={map}
            target="_blank"
            rel="noreferrer noopener"
            className="text-primary inline-flex min-h-11 items-center text-sm underline"
            data-testid="club-session-map"
          >
            {t('activities.club.session.map')}
          </a>
        ) : null}
      </span>,
    ],
    [t('activities.club.session.coach'), occurrence.coachName],
  ]

  return (
    <>
      {back}
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold" data-testid="club-session-title">
          {occurrence.activityName ?? t('activities.club.session.untitled')}
        </h1>
        <div className="flex flex-wrap gap-2">
          <StatusBadge variant="neutral">{t(`activities.club.kind.${entry.declarationKind}`)}</StatusBadge>
          {occurrence.status !== 'planned' ? (
            <StatusBadge variant={occurrence.status === 'cancelled' ? 'error' : 'success'}>
              {t(`activities.occurrences.status.${occurrence.status}`)}
            </StatusBadge>
          ) : null}
        </div>
      </div>
      {occurrence.status === 'cancelled' ? (
        <Alert status="error" data-testid="club-session-cancelled">
          <p className="max-w-prose">
            {occurrence.cancelReason
              ? t('activities.occurrences.cancelled.reason', { reason: occurrence.cancelReason })
              : t('activities.occurrences.cancelled.title')}
          </p>
        </Alert>
      ) : null}
      <section className="bg-card rounded-lg border p-4" aria-label={t('activities.club.session.details')}>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          {rows.map(([label, value]) => (
            <div key={label} className="flex min-w-0 flex-col gap-1">
              <dt className="text-muted-foreground text-xs">{label}</dt>
              <dd className="text-sm break-words">{value || t('activities.common.empty')}</dd>
            </div>
          ))}
        </dl>
      </section>
      {!entry.declarationsOpen && occurrence.status === 'planned' ? (
        <Alert status="information" data-testid="club-session-closed">
          <p className="max-w-prose">{t('activities.club.session.closed')}</p>
        </Alert>
      ) : null}
      <section aria-labelledby="club-session-declarations" className="flex flex-col gap-3">
        <h2 id="club-session-declarations" className="text-lg font-semibold">
          {t('activities.club.session.declarations')}
        </h2>
        <ul className="flex flex-col gap-3">
          {entry.persons.map((person) => (
            <PersonDeclaration
              key={person.personId}
              entry={entry}
              person={person}
              as={as}
              busy={busy}
              onDeclare={(target, declared) =>
                void run(
                  () =>
                    declareAttendance(
                      { occurrenceId: occurrence.id, personId: target.personId, declared },
                      t('activities.club.errors.declare'),
                    ),
                  t('activities.club.flash.declared'),
                  t('activities.club.errors.declare'),
                )
              }
              onDecide={(target, approve) => {
                const attendanceId = target.declaration?.attendanceId
                if (!attendanceId) return
                void run(
                  () => decideDeclaration(attendanceId, approve, t('activities.club.errors.decide')),
                  t(approve ? 'activities.club.flash.approved' : 'activities.club.flash.rejected'),
                  t('activities.club.errors.decide'),
                )
              }}
            />
          ))}
        </ul>
        <p className="sr-only" aria-live="polite" data-testid="club-session-announcement">
          {announcement}
        </p>
      </section>
      {entry.calledUpChildren ? (
        <section aria-labelledby="club-session-called-up" className="flex flex-col gap-2">
          <h2 id="club-session-called-up" className="text-lg font-semibold">
            {t('activities.club.session.calledUp')}
          </h2>
          {entry.calledUpChildren.length > 0 ? (
            <ul className="flex flex-wrap gap-2" data-testid="club-session-called-up">
              {entry.calledUpChildren.map((child) => (
                <li key={child.personId}>
                  <StatusBadge variant="neutral">{fullName(child)}</StatusBadge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground text-sm">{t('activities.club.session.calledUpEmpty')}</p>
          )}
        </section>
      ) : null}
    </>
  )
}

export function ClubSessionPage({ id }: { id: string }) {
  return <ActivitiesClubFrame>{(profile) => <Session profile={profile} id={id} />}</ActivitiesClubFrame>
}
