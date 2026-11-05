'use client'
// `/backend/activities/occurrences/[id]` — one session (club spec UI table, glossary *Session*, *Session
// cancellation*; REQ-005, REQ-009): activity, group, section, date, time, place, coach and status. With
// `activities.manage` a planned session is moved or re-staffed ("Move": date, times, place, coach), which detaches it
// from its series; a move that overbooks a place or a coach is refused with 409 and its conflict list is shown. With
// `activities.coach` a planned session is cancelled with a required reason; the people it concerns get an in-app
// notice. A cancelled session shows its reason and no actions. Both writes send the session's lock token. With
// `activities.coach` the record links to the session's attendance list on the member side (#33).
import * as React from 'react'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { CrudForm, type CrudField, type CrudFieldOption } from '@open-mercato/ui/backend/CrudForm'
import { AccessDeniedMessage, ErrorMessage, LoadingMessage, RecordNotFoundState } from '@open-mercato/ui/backend/detail'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { apiCall, apiCallOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { createCrudFormError } from '@open-mercato/ui/backend/utils/serverErrors'
import { Alert, AlertDescription, AlertTitle } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { errorCodeOf } from '@vereino/core'
import { CancelOccurrenceDialog } from './CancelOccurrenceDialog'
import { ConflictList } from './ConflictList'
import { OccurrenceBadges } from './OccurrencesTable'
import { attendanceHref } from './club/club-client'
import {
  OWN_FORBIDDEN_STATE,
  OCCURRENCES_HREF,
  activityHref,
  dateLabel,
  errorCode,
  errorMessage,
  fieldOfError,
  instantDate,
  instantTime,
  personOptions,
  placeOptions,
  scheduleConflictsOf,
  textOrNull,
  timeRangeOfInstants,
  toInstant,
  tolerant,
  typeLabel,
  type OccurrenceDetail,
  type ScheduleConflict,
  type Translate,
} from './client-helpers'
import { dateField, timeField } from '@vereino/ui'
import { useActivitiesFeatures } from './useActivitiesFeatures'

type OccurrenceLoad =
  | { status: 'ok'; occurrence: OccurrenceDetail }
  | { status: 'not_found' }
  | { status: 'denied' }
  | { status: 'unlinked' }

type MoveValues = Record<string, unknown> & {
  date?: string
  startTime?: string
  endTime?: string
  /** The gathering wall time on the session's date (DD-43); empty = none. */
  gatheringTime?: string
  placeId?: string
  coachPersonId?: string
  updatedAt?: string | null
}

const DAY_MS = 24 * 60 * 60 * 1000

/** Whole calendar days between two `YYYY-MM-DD` dates (a session of a weekend tournament spans several). */
function daysBetween(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`)
  const end = Date.parse(`${to}T00:00:00Z`)
  return Number.isNaN(start) || Number.isNaN(end) ? 0 : Math.round((end - start) / DAY_MS)
}

function addDays(date: string, days: number): string {
  const value = new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS)
  return value.toISOString().slice(0, 10)
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
    [t('activities.fields.place'), occurrence.placeName],
    [t('activities.fields.coach'), occurrence.coachName],
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

function MoveForm({
  occurrence,
  onDone,
  onCancel,
}: {
  occurrence: OccurrenceDetail
  onDone: () => Promise<void>
  onCancel: () => void
}) {
  const t = useT()
  const [conflicts, setConflicts] = React.useState<ScheduleConflict[] | null>(null)
  const coachSeed = React.useMemo<CrudFieldOption[]>(
    () =>
      occurrence.coachPersonId
        ? [{ value: occurrence.coachPersonId, label: occurrence.coachName ?? t('activities.common.unknownPerson') }]
        : [],
    [occurrence.coachPersonId, occurrence.coachName, t],
  )
  const fields = React.useMemo<CrudField[]>(
    () => [
      dateField('date', t('activities.occurrences.fields.date'), { required: true }),
      timeField('startTime', t('activities.fields.startTime'), { required: true, layout: 'half' }),
      timeField('endTime', t('activities.fields.endTime'), { required: true, layout: 'half' }),
      timeField('gatheringTime', t('activities.gathering.label'), {
        layout: 'half',
        description: t('activities.occurrences.fields.gathering.help'),
      }),
      {
        id: 'placeId',
        label: t('activities.fields.place'),
        type: 'select',
        loadOptions: tolerant(placeOptions),
        required: true,
      },
      {
        id: 'coachPersonId',
        label: t('activities.fields.coach'),
        type: 'combobox',
        placeholder: t('activities.fields.coach.placeholder'),
        loadOptions: (query?: string) => personOptions(query),
        seedOptions: coachSeed,
        allowCustomValues: false,
      },
    ],
    [t, coachSeed],
  )
  const initialValues = React.useMemo<MoveValues>(
    () => ({
      id: occurrence.id,
      date: instantDate(occurrence.startAt),
      startTime: instantTime(occurrence.startAt),
      endTime: instantTime(occurrence.endAt),
      gatheringTime: instantTime(occurrence.gatheringAt),
      placeId: occurrence.placeId ?? '',
      coachPersonId: occurrence.coachPersonId ?? '',
      updatedAt: occurrence.updatedAt,
    }),
    [occurrence],
  )
  // The end keeps the session's span in days, so a moved weekend tournament still ends on its last day.
  const spanDays = daysBetween(instantDate(occurrence.startAt), instantDate(occurrence.endAt))

  return (
    <section
      className="bg-card flex flex-col gap-3 rounded-lg border p-4"
      aria-label={t('activities.occurrences.move.title')}
      data-testid="occurrence-move-form"
    >
      <h2 className="text-lg font-semibold">{t('activities.occurrences.move.title')}</h2>
      <p className="text-muted-foreground text-sm">{t('activities.occurrences.move.help')}</p>
      {conflicts ? <ConflictList conflicts={conflicts} /> : null}
      <CrudForm<MoveValues>
        embedded
        fields={fields}
        initialValues={initialValues}
        submitLabel={t('activities.occurrences.move.submit')}
        extraActions={
          <Button type="button" variant="outline" onClick={onCancel}>
            {t('activities.common.cancel')}
          </Button>
        }
        onSubmit={async (values) => {
          const date = typeof values.date === 'string' ? values.date : ''
          const startAt = toInstant(date, values.startTime)
          const endAt = date ? toInstant(addDays(date, spanDays), values.endTime) : null
          if (!startAt || !endAt) {
            const message = t('activities.form.errors.required')
            throw createCrudFormError(message, {
              ...(startAt ? {} : { date: message, startTime: message }),
              ...(endAt ? {} : { endTime: message }),
            })
          }
          // DD-43: an untouched gathering time is not sent, so a moved session keeps its offset; a changed one is set on
          // the session's (new) date, and a cleared one removes it.
          const gatheringTime = typeof values.gatheringTime === 'string' ? values.gatheringTime : ''
          const gatheringChanged = gatheringTime !== initialValues.gatheringTime
          const gatheringAt = gatheringTime ? toInstant(date, gatheringTime) : null
          if (gatheringChanged && gatheringTime && !gatheringAt) {
            const message = t('activities.form.errors.invalid')
            throw createCrudFormError(message, { gatheringTime: message })
          }
          try {
            await apiCallOrThrow(
              `/api/activities/occurrences/${encodeURIComponent(occurrence.id)}`,
              {
                method: 'PATCH',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                  startAt,
                  endAt,
                  placeId: values.placeId,
                  coachPersonId: textOrNull(values.coachPersonId),
                  ...(gatheringChanged ? { gatheringAt } : {}),
                }),
              },
              { errorMessage: t('activities.occurrences.errors.move') },
            )
          } catch (error: unknown) {
            const found = scheduleConflictsOf(error)
            if (found) {
              setConflicts(found)
              throw createCrudFormError(errorMessage(error, t('activities.conflicts.title')))
            }
            const field = fieldOfError(error)
            if (field) {
              const message = errorMessage(error, t('activities.form.errors.invalid'))
              throw createCrudFormError(message, { [field]: message })
            }
            // Cancelled or done meanwhile: show the session as it is now (the form reports the message).
            if (errorCode(error) === 'occurrence_not_planned') void onDone()
            throw error
          }
          setConflicts(null)
          flash(t('activities.occurrences.flash.moved'), 'success')
          await onDone()
        }}
      />
    </section>
  )
}

export function OccurrenceRecord({ id }: { id: string }) {
  const t = useT()
  const features = useActivitiesFeatures()
  const [moving, setMoving] = React.useState(false)
  const [cancelling, setCancelling] = React.useState(false)
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
  const canCancel = features.coach && planned
  // The coach's attendance list (#33) lives on the member side; it reads and saves through the same record scope.
  const canOpenAttendance = features.coach && occurrence.status !== 'cancelled'

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
        {canMove || canCancel || canOpenAttendance ? (
          <div className="flex flex-wrap items-center gap-2">
            {canOpenAttendance ? (
              <Button asChild variant="outline" size="sm">
                <Link href={attendanceHref(occurrence.id)} data-testid="occurrence-attendance-link">
                  {t('activities.occurrences.actions.attendance')}
                </Link>
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
      {canMove && moving ? (
        <MoveForm
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
