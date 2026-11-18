'use client'
// `/backend/activities/occurrences/[id]` — one session (club spec UI table, glossary *Session*, *Session
// cancellation*; REQ-005, REQ-009): activity, group, section, date, time, place, coach and status. With
// `activities.manage` a planned session is moved ("Move": date, times, gathering time, place), which detaches it from
// its series — its coach changes only through the substitute dialog, so every change is in the history (#95); a move that overbooks a place or a coach is refused with 409 and its conflict list is shown. With
// `activities.coach` a planned session is cancelled with a required reason when the caller may cancel it (`mayCancel`,
// #215: the club setting `coach_may_cancel` may forbid a coach); the people it concerns get an in-app notice. A cancelled session shows its reason and no actions. Both writes send the session's lock token. With
// `activities.coach` the record links to the session's attendance list on the member side (#33). E06-S13 #95: the coach
// row shows "Needs a coach" or "{substitute} (substitute for {coach})"; with `activities.manage` a planned session gets
// "Assign substitute" / "Change coach" (the substitute dialog), and the substitution history is listed, oldest first.
// #268 (REQ-A05): the place shows its address and a map link, and the club administrator restores a cancelled session
// that has not ended (`mayRestore`) with a reason. E10-S07 (#272, REQ-A15): a match or sparring shows its score, and
// once it started the session's coach, a coach of the group, the coordinator or the administrator records it here.
import * as React from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { AccessDeniedMessage, ErrorMessage, LoadingMessage, RecordNotFoundState } from '@open-mercato/ui/backend/detail'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { Alert, AlertDescription, AlertTitle } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { errorCodeOf } from '@vereino/core'
import { AssignCoachDialog } from './AssignCoachDialog'
import { CancelOccurrenceDialog } from './CancelOccurrenceDialog'
import { MoveOccurrenceForm } from './MoveOccurrenceDialog'
import { OccurrenceBadges, OccurrenceCoach } from './OccurrencesTable'
import { RestoreOccurrenceDialog } from './RestoreOccurrenceDialog'
import { clubFirstScore } from '../lib/score'
import { placeLine, placeMapHref } from '../lib/venue'
import { ScoreForm } from './ScoreForm'
import { attendanceHref } from './club/club-client'
import {
  OWN_FORBIDDEN_STATE,
  OCCURRENCES_HREF,
  activityHref,
  dateLabel,
  instantDate,
  instantTime,
  timeRangeOfInstants,
  typeLabel,
  type OccurrenceDetail,
  type Translate,
} from './client-helpers'
import { useActivitiesFeatures } from './useActivitiesFeatures'

type OccurrenceLoad =
  | { status: 'ok'; occurrence: OccurrenceDetail }
  | { status: 'not_found' }
  | { status: 'denied' }
  | { status: 'unlinked' }

/** The place with its address and a map link (#268, REQ-A05; glossary *Map link*). */
function PlaceValue({ occurrence, t }: { occurrence: OccurrenceDetail; t: Translate }) {
  const location = {
    name: occurrence.placeName ?? null,
    address: occurrence.placeAddress ?? null,
    geoLat: occurrence.placeGeoLat ?? null,
    geoLng: occurrence.placeGeoLng ?? null,
  }
  const line = placeLine(location)
  if (!line) return null
  const href = placeMapHref(location)
  return (
    <span className="flex flex-wrap items-baseline gap-x-2" data-testid="occurrence-place">
      <span>{line}</span>
      {href ? (
        <a
          className="text-primary text-xs underline underline-offset-4"
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="occurrence-place-map"
        >
          {t('activities.occurrences.place.map', { place: occurrence.placeName ?? line })}
        </a>
      ) : null}
    </span>
  )
}

function Details({ occurrence, t }: { occurrence: OccurrenceDetail; t: Translate }) {
  const rows: Array<[string, React.ReactNode]> = [
    [
      t('activities.occurrences.fields.activity'),
      occurrence.activityId ? (
        <Link className="underline underline-offset-4" href={activityHref(occurrence.activityId)}>
          {occurrence.activityName ?? t('activities.common.empty')}
        </Link>
      ) : null,
    ],
    [t('activities.fields.type'), typeLabel(t, occurrence.activityType)],
    [t('activities.fields.group'), occurrence.groupName],
    [t('activities.fields.section'), occurrence.sectionName],
    [t('activities.occurrences.fields.date'), dateLabel(t, instantDate(occurrence.startAt))],
    // DD-43: the gathering time comes before the start; a session without one shows no row.
    ...(occurrence.gatheringAt
      ? ([[t('activities.gathering.label'), instantTime(occurrence.gatheringAt)]] as Array<[string, React.ReactNode]>)
      : []),
    [t('activities.occurrences.fields.time'), timeRangeOfInstants(occurrence.startAt, occurrence.endAt)],
    // REQ-A07: the declaration deadline, when the session has one ("Deadline passed" once it passed).
    ...(occurrence.confirmBy
      ? ([
          [
            occurrence.deadlinePassed ? t('activities.deadline.over') : t('activities.deadline.label'),
            <span key="deadline" data-testid="occurrence-deadline">
              {`${dateLabel(t, instantDate(occurrence.confirmBy))} ${instantTime(occurrence.confirmBy)}`}
            </span>,
          ],
        ] as Array<[string, React.ReactNode]>)
      : []),
    [t('activities.fields.place'), <PlaceValue key="place" occurrence={occurrence} t={t} />],
    [
      t('activities.fields.coach'),
      <span key="coach" className="flex flex-col gap-1" data-testid="occurrence-coach">
        <OccurrenceCoach row={occurrence} t={t} />
        {occurrence.substituteForName ? (
          <span className="text-muted-foreground text-xs" data-testid="occurrence-substitute-for">
            {t('activities.substitutions.forLine', {
              substitute: occurrence.coachName ?? '',
              coach: occurrence.substituteForName,
            })}
          </span>
        ) : null}
      </span>,
    ],
    ...(occurrence.opponentName
      ? ([[t('activities.fields.opponent'), occurrence.opponentName]] as Array<[string, React.ReactNode]>)
      : []),
    ...(occurrence.invitedTeamNames.length > 0
      ? ([[t('activities.events.fields.invitedTeams'), occurrence.invitedTeamNames.join(', ')]] as Array<
          [string, React.ReactNode]
        >)
      : []),
    [
      t('activities.occurrences.fields.slot'),
      occurrence.activityRecurring ? dateLabel(t, occurrence.occurrenceDate) : t('activities.occurrences.oneOff'),
    ],
  ]
  return (
    <section
      className="bg-card flex flex-col gap-3 rounded-lg border p-4"
      aria-label={t('activities.occurrences.record.details')}
    >
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex min-w-0 flex-col gap-1">
            <dt className="text-muted-foreground text-xs">{label}</dt>
            <dd className="text-sm break-words">{value || t('activities.common.empty')}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

/** The substitution history of a session (E06-S13 #95), oldest first; entries are never edited. */
function SubstitutionHistory({ occurrence, t }: { occurrence: OccurrenceDetail; t: Translate }) {
  if (occurrence.substitutions.length === 0) return null
  return (
    <section
      className="bg-card flex flex-col gap-3 rounded-lg border p-4"
      aria-labelledby="occurrence-substitutions"
      data-testid="occurrence-substitutions"
    >
      <h2 id="occurrence-substitutions" className="text-lg font-semibold">
        {t('activities.substitutions.history.title')}
      </h2>
      <ol className="flex flex-col gap-2">
        {occurrence.substitutions.map((entry) => (
          <li key={entry.id} className="flex flex-col gap-0.5 text-sm" data-kind={entry.kind}>
            <span>
              {t(`activities.substitutions.history.${entry.kind}`, {
                previous: entry.previousCoachName ?? t('activities.common.unknownPerson'),
                next: entry.newCoachName ?? t('activities.common.unknownPerson'),
              })}
            </span>
            <span className="text-muted-foreground text-xs">
              {[
                `${dateLabel(t, instantDate(entry.createdAt))} ${instantTime(entry.createdAt)}`,
                entry.decidedByName
                  ? t('activities.substitutions.history.by', {
                      name: entry.decidedByName,
                      role: t(`activities.substitutions.roles.${entry.actingRole}`),
                    })
                  : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
            {entry.reason ? (
              <span className="text-muted-foreground text-xs break-words whitespace-pre-wrap">
                {t('activities.substitutions.history.reason', { reason: entry.reason })}
              </span>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  )
}

export function OccurrenceRecord({ id }: { id: string }) {
  const t = useT()
  const features = useActivitiesFeatures()
  const [moving, setMoving] = React.useState(false)
  const [cancelling, setCancelling] = React.useState(false)
  const [staffing, setStaffing] = React.useState(false)
  const [restoring, setRestoring] = React.useState(false)
  const query = useQuery({
    queryKey: ['activities-occurrence', id],
    queryFn: async (): Promise<OccurrenceLoad> => {
      const call = await apiCall<OccurrenceDetail>(
        `/api/activities/occurrences/${encodeURIComponent(id)}`,
        OWN_FORBIDDEN_STATE,
      )
      if (call.status === 404) return { status: 'not_found' }
      // 403 `scope_unlinked`: the account is not linked to a person of this club (#76).
      if (call.status === 403) {
        return errorCodeOf(call.result) === 'scope_unlinked' ? { status: 'unlinked' } : { status: 'denied' }
      }
      if (!call.ok || !call.result) throw new Error(t('activities.occurrences.errors.loadOne'))
      return { status: 'ok', occurrence: call.result }
    },
  })
  const refetch = React.useCallback(async () => {
    await query.refetch()
  }, [query])

  if (query.isLoading) return <LoadingMessage label={t('activities.occurrences.loading')} />
  if (query.error) return <ErrorMessage label={t('activities.occurrences.errors.loadOne')} />
  const load = query.data
  if (!load || load.status === 'not_found') {
    return (
      <RecordNotFoundState
        label={t('activities.occurrences.errors.notFound')}
        backHref={OCCURRENCES_HREF}
        backLabel={t('activities.occurrences.actions.back')}
      />
    )
  }
  if (load.status === 'unlinked') return <AccessDeniedMessage label={t('foundation.errors.scope_unlinked')} />
  if (load.status === 'denied') return <AccessDeniedMessage label={t('activities.occurrences.errors.denied')} />

  const occurrence = load.occurrence
  const planned = occurrence.status === 'planned'
  const canMove = features.manage && planned
  const canStaff = features.manage && planned
  const canCancel = features.coach && planned && occurrence.mayCancel === true
  // The coach's attendance list (#33) lives on the member side; it reads and saves through the same record scope.
  const canOpenAttendance = features.coach && occurrence.status !== 'cancelled'
  const canRestore = features.manage && occurrence.mayRestore === true

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-2xl font-semibold break-words">
            {occurrence.activityName ?? t('activities.occurrences.record.title')}
          </h1>
          <span className="text-muted-foreground text-sm break-words">
            {[
              dateLabel(t, instantDate(occurrence.startAt)),
              timeRangeOfInstants(occurrence.startAt, occurrence.endAt),
              occurrence.groupName,
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
          <OccurrenceBadges row={occurrence} t={t} />
        </div>
        {canMove || canCancel || canOpenAttendance || canStaff || canRestore ? (
          <div className="flex flex-wrap items-center gap-2">
            {canOpenAttendance ? (
              <Button asChild variant="outline" size="sm">
                <Link href={attendanceHref(occurrence.id)} data-testid="occurrence-attendance-link">
                  {t('activities.occurrences.actions.attendance')}
                </Link>
              </Button>
            ) : null}
            {canStaff ? (
              <Button
                type="button"
                variant={occurrence.coachPersonId ? 'outline' : 'default'}
                size="sm"
                data-testid="occurrence-assign-coach-button"
                onClick={() => {
                  setStaffing(true)
                }}
              >
                {t(
                  occurrence.coachPersonId
                    ? 'activities.substitutions.change.action'
                    : 'activities.substitutions.assign.action',
                )}
              </Button>
            ) : null}
            {canMove ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-expanded={moving}
                data-testid="occurrence-move-button"
                onClick={() => {
                  setMoving((value) => !value)
                }}
              >
                {t('activities.occurrences.actions.move')}
              </Button>
            ) : null}
            {canRestore ? (
              <Button
                type="button"
                size="sm"
                data-testid="occurrence-restore-button"
                onClick={() => {
                  setRestoring(true)
                }}
              >
                {t('activities.occurrences.actions.restore')}
              </Button>
            ) : null}
            {canCancel ? (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                data-testid="occurrence-cancel-button"
                onClick={() => {
                  setCancelling(true)
                }}
              >
                {t('activities.occurrences.actions.cancel')}
              </Button>
            ) : null}
          </div>
        ) : null}
      </header>
      {occurrence.status === 'cancelled' ? (
        <Alert status="warning" data-testid="occurrence-cancelled">
          <AlertTitle>{t('activities.occurrences.cancelled.title')}</AlertTitle>
          <AlertDescription className="break-words whitespace-pre-wrap">
            {occurrence.cancelReason
              ? t('activities.occurrences.cancelled.reason', { reason: occurrence.cancelReason })
              : t('activities.occurrences.cancelled.noReason')}
          </AlertDescription>
        </Alert>
      ) : null}
      {occurrence.needsReschedule && planned ? (
        <Alert status="warning">
          <AlertDescription>{t('activities.occurrences.needsReschedule.help')}</AlertDescription>
        </Alert>
      ) : null}
      {occurrence.isDetached ? (
        <p className="text-muted-foreground text-sm">{t('activities.occurrences.moved.help')}</p>
      ) : null}
      <Details occurrence={occurrence} t={t} />
      {/* REQ-A15 (#272): the score of a match or sparring; recorded here once the session started. */}
      {occurrence.mayScore === true || occurrence.score ? (
        <section
          className="bg-card flex flex-col gap-3 rounded-lg border p-4"
          aria-labelledby="occurrence-score"
          data-testid="occurrence-score"
        >
          <h2 id="occurrence-score" className="text-lg font-semibold">
            {t('activities.score.title')}
          </h2>
          {occurrence.score ? (
            <p className="flex flex-col gap-1" data-testid="occurrence-score-value">
              <span className="text-2xl font-semibold">
                {clubFirstScore(occurrence.score, occurrence.isAway === true)}
              </span>
              {occurrence.score.note ? (
                <span className="text-muted-foreground text-sm">{occurrence.score.note}</span>
              ) : null}
            </p>
          ) : null}
          {occurrence.mayScore === true ? (
            <ScoreForm
              key={occurrence.updatedAt ?? occurrence.id}
              occurrenceId={occurrence.id}
              updatedAt={occurrence.updatedAt ?? ''}
              score={occurrence.score ?? null}
              isAway={occurrence.isAway === true}
              onSaved={async (message) => {
                if (message) flash(message, 'success')
                await refetch()
              }}
            />
          ) : null}
        </section>
      ) : null}
      <SubstitutionHistory occurrence={occurrence} t={t} />
      {canMove && moving ? (
        <section
          className="bg-card flex flex-col gap-3 rounded-lg border p-4"
          aria-label={t('activities.occurrences.move.title')}
          data-testid="occurrence-move-form"
        >
          <h2 className="text-lg font-semibold">{t('activities.occurrences.move.title')}</h2>
          <p className="text-muted-foreground text-sm">{t('activities.occurrences.move.help')}</p>
          <MoveOccurrenceForm
            key={occurrence.updatedAt ?? occurrence.id}
            occurrence={occurrence}
            onCancel={() => {
              setMoving(false)
            }}
            onDone={async () => {
              setMoving(false)
              await refetch()
            }}
          />
        </section>
      ) : null}
      {canRestore ? (
        <RestoreOccurrenceDialog
          key={occurrence.updatedAt ?? occurrence.id}
          occurrence={occurrence}
          open={restoring}
          onOpenChange={setRestoring}
          onDone={refetch}
        />
      ) : null}
      {canStaff && staffing ? (
        <AssignCoachDialog
          key={occurrence.updatedAt ?? occurrence.id}
          occurrence={occurrence}
          open
          onOpenChange={setStaffing}
          onDone={refetch}
        />
      ) : null}
      {canCancel ? (
        <CancelOccurrenceDialog
          occurrence={occurrence}
          open={cancelling}
          onOpenChange={setCancelling}
          onDone={refetch}
        />
      ) : null}
    </div>
  )
}
