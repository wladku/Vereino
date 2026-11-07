'use client'
// `/club/occurrences/[id]` (club spec UI row `/club/occurrences/[id]`, REQ-006, REQ-007; #32): one session for the
// member — activity, group, section, date, time, place with its address and a map link, coach — and, per concerned
// person (the member or each ward), the declaration status with the buttons the club's model offers; a guardian's
// decision on a ward's pending declaration ("Approve" / "Reject"); the called-up children the club setting and the
// consents allow; "declarations closed" once the session started; "only your guardian declares" under
// `guardian_only`. A session outside the caller's (or the wards') calendar is "not found". A person who coaches also
// reads it as the coach (E06-S15 #97): the coach of its group or its assigned coach gets "Running the session"
// (attendance list, cancellation); a coach of another group sees "This is not your session" and none of its data; a
// coach who is also a guardian gets the declarations and the coach block together on a ward's session. The coach row
// marks "Needs a coach" and "(substitution)", and the assigned coach reports an absence from the coach block (E06-S13
// #95).
import * as React from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { surfaceRecordConflict } from '@open-mercato/ui/backend/conflicts'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { Alert } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import { StatusBadge } from '@open-mercato/ui/primitives/status-badge'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { badgeVariant, formatClockTime, formatDayHeading, formatTimeRange } from '@vereino/ui'
import { sessionPageView, sessionPerspectives, type SessionReadState } from '../../lib/member-session'
import { coachBadge } from '../../lib/occurrence-list'
import { ActivitiesClubFrame } from './ActivitiesClubFrame'
import { CoachSessionBlock } from './CoachSessionBlock'
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
  type SessionLoad,
} from './club-client'

type Perspective = 'self' | 'guardian'

function readState(enabled: boolean, query: { data?: SessionLoad; isError: boolean }): SessionReadState {
  if (!enabled) return 'off'
  if (query.data) return query.data.status
  return query.isError ? 'error' : 'loading'
}

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
        <span data-testid="club-session-declaration">
          <StatusBadge variant={badgeVariant(state.tone)}>
            {declarationLabel(t, entry.declarationKind, person.declaration)}
          </StatusBadge>
        </span>
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
              <span className="sr-only"> — {person.firstName}</span>
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
              <span className="sr-only"> — {person.firstName}</span>
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
                <span className="sr-only"> — {person.firstName}</span>
              </Button>
            )
          })}
        </div>
      ) : null}
    </li>
  )
}

/** The coach of the session with "Needs a coach" or "(substitution)" (README M-04, E06-S13 #95). */
function CoachName({ occurrence }: { occurrence: CalendarEntry['occurrence'] }) {
  const t = useT()
  const badge = coachBadge(occurrence)
  if (badge === 'needs_coach') {
    return (
      <span data-testid="club-session-coach-needed">
        <StatusBadge variant="warning">{t('activities.club.session.needsCoach')}</StatusBadge>
      </span>
    )
  }
  return (
    <span className="flex flex-wrap items-center gap-1">
      <span>{occurrence.coachName ?? t('activities.common.empty')}</span>
      {badge === 'substitution' ? (
        <span className="text-muted-foreground text-xs" data-testid="club-session-substitution">
          {t('activities.substitutions.substitution')}
        </span>
      ) : null}
    </span>
  )
}

function Session({ profile, id }: { profile: ClubProfile; id: string }) {
  const t = useT()
  const locale = useLocale()
  const queryClient = useQueryClient()
  const searchParams = useSearchParams()
  const perspectives = sessionPerspectives(searchParams.get('as'), {
    hasWards: profile.wards.length > 0,
    coaches: profile.contexts.includes('coach'),
  })
  const as: Perspective = perspectives.member
  const personId = searchParams.get('personId')
  const query = useMemberSession(id, as, personId)
  const coachQuery = useMemberSession(id, 'coach', null, perspectives.coach)
  const view = sessionPageView(readState(true, query), readState(perspectives.coach, coachQuery))
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
      // A change made meanwhile (another guardian, the ward) shows the shared conflict bar; the page then refreshes.
      if (!surfaceRecordConflict(error, t)) flash(errorText(error, failure), 'error')
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

  if (view.kind === 'loading') return <LoadingMessage label={t('activities.club.session.loading')} />
  if (view.kind === 'error') {
    return (
      <ErrorMessage
        label={t('activities.club.errors.session')}
        action={
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => {
              void query.refetch()
              if (perspectives.coach) void coachQuery.refetch()
            }}
          >
            {t('activities.club.actions.retry')}
          </Button>
        }
      />
    )
  }
  if (view.kind === 'not_found' || view.kind === 'not_yours') {
    return (
      <>
        {back}
        <Alert status="warning" data-testid="club-session-missing">
          <p className="max-w-prose">
            {t(view.kind === 'not_yours' ? 'activities.club.session.notYours' : 'activities.club.session.notFound')}
          </p>
        </Alert>
      </>
    )
  }
  const memberEntry = query.data?.status === 'ok' ? query.data.entry : null
  const coachEntry = coachQuery.data?.status === 'ok' ? coachQuery.data.entry : null
  // Both reads describe the same session; the member's carries the declarations, the coach's the summary.
  const entry = memberEntry ?? coachEntry
  if (!entry) return null
  const { occurrence } = entry
  const startsAt = new Date(occurrence.startAt)
  const map = mapHref(occurrence.placeGeoLat, occurrence.placeGeoLng)
  const rows: Array<[string, React.ReactNode]> = [
    [t('activities.club.session.date'), formatDayHeading(occurrence.occurrenceDate, locale)],
    // DD-43: the gathering time comes first, and a session without one shows no row.
    ...(occurrence.gatheringAt
      ? ([
          [
            t('activities.gathering.label'),
            <span key="gathering" className="font-semibold" data-testid="club-session-gathering">
              {formatClockTime(new Date(occurrence.gatheringAt), locale, entry.timeZone)}
            </span>,
          ],
        ] satisfies Array<[string, React.ReactNode]>)
      : []),
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
    [t('activities.club.session.coach'), <CoachName key="coach" occurrence={occurrence} />],
  ]
  if (occurrence.opponentName) {
    rows.push([
      t('activities.club.session.opponent'),
      <span key="opponent" data-testid="club-session-opponent">
        {occurrence.opponentName}
      </span>,
    ])
  }
  if (occurrence.invitedTeamNames.length > 0) {
    rows.push([
      t('activities.club.session.invitedTeams'),
      <ul key="teams" className="flex flex-col gap-1" data-testid="club-session-invited-teams">
        {occurrence.invitedTeamNames.map((name, index) => (
          <li key={`${String(index)}:${name}`}>{name}</li>
        ))}
      </ul>,
    ])
  }

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
      {coachEntry ? (
        <CoachSessionBlock
          entry={coachEntry}
          selfPersonId={profile.person.id}
          absenceLabel={[
            occurrence.activityName ?? t('activities.club.session.untitled'),
            `${formatDayHeading(occurrence.occurrenceDate, locale)} ${formatClockTime(startsAt, locale, entry.timeZone)}`,
          ].join(', ')}
          onCancelled={async (message) => {
            if (message) {
              setAnnouncement(message)
              flash(message, 'success')
            }
            await refresh()
          }}
        />
      ) : null}
      {!entry.declarationsOpen && occurrence.status === 'planned' ? (
        <Alert status="information" data-testid="club-session-closed">
          <p className="max-w-prose">{t('activities.club.session.closed')}</p>
        </Alert>
      ) : null}
      {memberEntry ? (
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
                        target.declaration?.updatedAt ?? null,
                      ),
                    t('activities.club.flash.declared'),
                    t('activities.club.errors.declare'),
                  )
                }
                onDecide={(target, approve) => {
                  const shown = target.declaration
                  if (!shown) return
                  void run(
                    () =>
                      decideDeclaration(
                        shown.attendanceId,
                        approve,
                        t('activities.club.errors.decide'),
                        shown.updatedAt,
                      ),
                    t(approve ? 'activities.club.flash.approved' : 'activities.club.flash.rejected'),
                    t('activities.club.errors.decide'),
                  )
                }}
              />
            ))}
          </ul>
        </section>
      ) : null}
      <p className="sr-only" aria-live="polite" data-testid="club-session-announcement">
        {announcement}
      </p>
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
