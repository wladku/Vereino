'use client'
// `/club/occurrences/[id]/edit` — the coach edits a session of their own one-off event from the phone (parity spec
// REQ-A08, DD-A05, J-A02 step 6; #270): the date, the start and the end in the club's time zone, a club place or
// another address typed in, the gathering time and the declaration deadline (for a `confirm` kind, or when the session
// has one). The session comes from `GET /api/activities/calendar/{id}?as=coach`, whose `mayEdit` says whether the
// caller may edit it (a coordinator or the administrator any session; a coach only a one-off event's); the places from
// `GET /api/activities/events/options`. `PATCH /api/activities/occurrences/{id}` saves only what changed against the
// session's lock token: a collision (409) lists the colliding sessions and saves nothing, a change made meanwhile shows
// the shared conflict bar, and a coded 422 points at its field. The submit bar stays above the bottom navigation.
// E10-S08 (#273, REQ-A10): opened with `?as=coordinator`, the form reads the session as the section's coordinator (any
// planned session of their sections) and returns to the session page in that perspective; the toast names how many
// people the move told, and a move clears "Needs a new time". Opened without `?as=`, a coordinator who does not coach
// reads it as the coordinator too, so the form never asks for a coach read the API refuses (#483).
// Club events (REQ-T05, REQ-T12, E14-S05 #380): a part session keeps the club event's place, so the form shows it
// read-only ("the club event's place") and never sends a place or a venue; the event page's Move opens this form.
import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { surfaceRecordConflict } from '@open-mercato/ui/backend/conflicts'
import { ErrorMessage } from '@open-mercato/ui/backend/detail'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { apiCall, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { Alert } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Radio, RadioGroup } from '@open-mercato/ui/primitives/radio'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { memberStaffScopes, MemberSkeleton } from '@vereino/ui'
import type { EventPlaceOption, VenueMode } from '../../lib/member-event'
import {
  sessionEditBody,
  sessionEditDraft,
  sessionEditFieldOfError,
  sessionEditProblems,
  sessionEditRefusal,
  sessionEditRefusalOfCode,
  type SessionEditDraft,
  type SessionEditField,
  type SessionEditProblem,
  type SessionEditRefusal,
} from '../../lib/session-edit'
import { VENUE_ADDRESS_MAX, VENUE_NAME_MAX } from '../../lib/venue'
import { sessionPerspectives } from '../../lib/member-session'
import { ConflictList } from '../ConflictList'
import { OWN_FORBIDDEN_STATE, takesDeadline, type DeclarationKinds, type ScheduleConflict } from '../client-helpers'
import { ActivitiesClubFrame } from './ActivitiesClubFrame'
import {
  CALENDAR_QUERY_KEY,
  CLUB_CALENDAR_HREF,
  SESSION_QUERY_KEY,
  sessionHref,
  useMemberSession,
  type CalendarEntry,
  type ClubProfile,
  type Translate,
} from './club-client'

type EditOptions = { places: EventPlaceOption[]; declarationKinds?: DeclarationKinds }

/** The places a session may move to and the club's declaration kinds (the new-event form's options). */
function useEditOptions() {
  return useQuery({
    queryKey: ['activities-event-options'],
    queryFn: async (): Promise<EditOptions> => {
      const call = await apiCall<EditOptions>('/api/activities/events/options', OWN_FORBIDDEN_STATE)
      if (!call.ok || !call.result) throw new Error(String(call.status))
      return call.result
    },
  })
}

type SaveAnswer = { code?: string; error?: string; conflicts?: unknown; notified?: number }

const PROBLEM_KEYS: Record<SessionEditProblem, string> = {
  required: 'activities.club.event.problems.required',
  invalid: 'activities.club.event.problems.invalid',
  endBeforeStart: 'activities.club.event.problems.endBeforeStart',
  incomplete: 'activities.occurrences.fields.confirmBy.incomplete',
}

/** The fields in reading order: the first one with a problem takes the focus. */
const FIELD_ORDER: readonly SessionEditField[] = [
  'date',
  'startTime',
  'endTime',
  'placeId',
  'venueName',
  'venueAddress',
  'gatheringTime',
  'confirmByDate',
  'confirmByTime',
]

/**
 * Why the session cannot be edited, worded for the reader's case, with the way forward (E20-S10, #489): a session
 * outside the caller's groups and sections points at the calendar; a part session at its club event's organisers; a
 * coach's series session at the section coordinator; a cancelled or settled one back to the session.
 */
function EditRefusal({ reason, clubEventName }: { reason: SessionEditRefusal; clubEventName: string | null }) {
  const t = useT()
  return (
    <Alert status="information" data-testid="club-edit-denied" data-reason={reason}>
      <p className="max-w-prose">{t(`activities.club.edit.refusal.${reason}`, { name: clubEventName ?? '' })}</p>
      {reason === 'not_yours' ? (
        <Link
          href={CLUB_CALENDAR_HREF}
          className="text-primary inline-flex min-h-11 items-center text-sm underline"
          data-testid="club-edit-denied-calendar"
        >
          {t('activities.club.edit.refusal.calendar')}
        </Link>
      ) : null}
    </Alert>
  )
}

function FieldProblem({ id, text }: { id: string; text: string | undefined }) {
  if (!text) return null
  return (
    <p id={id} className="text-destructive text-sm" data-testid="club-edit-problem">
      {text}
    </p>
  )
}

function EditForm({
  entry,
  timeZone,
  options,
  as,
}: {
  entry: CalendarEntry
  timeZone: string
  options: EditOptions
  as: 'coach' | 'coordinator'
}) {
  const t = useT()
  const router = useRouter()
  const queryClient = useQueryClient()
  const id = React.useId()
  const { occurrence } = entry
  // A part session's place belongs to its club event (DD-T05): shown read-only, never sent.
  const partOf = occurrence.clubEvent ?? null
  const session = React.useMemo(
    () => ({
      startAt: occurrence.startAt,
      endAt: occurrence.endAt,
      placeId: occurrence.placeId,
      venue: occurrence.venue ?? null,
      gatheringAt: occurrence.gatheringAt,
      confirmBy: occurrence.confirmBy ?? null,
    }),
    [occurrence],
  )
  const initial = React.useMemo(() => sessionEditDraft(session, timeZone), [session, timeZone])
  const [draft, setDraft] = React.useState<SessionEditDraft>(initial)
  const [problems, setProblems] = React.useState<Partial<Record<SessionEditField, string>>>({})
  const [conflicts, setConflicts] = React.useState<ScheduleConflict[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [refusal, setRefusal] = React.useState<SessionEditRefusal | null>(null)
  const [pending, setPending] = React.useState(false)
  // REQ-A07: the deadline for a `confirm` kind, and always when the session already has one.
  const deadlineShown =
    Boolean(occurrence.confirmBy) || takesDeadline(options.declarationKinds ?? null, occurrence.activityType)
  // A place that is no longer offered (removed meanwhile) is still shown, so the form never blanks the session's place.
  const places =
    draft.placeId && !options.places.some((place) => place.id === draft.placeId)
      ? [...options.places, { id: draft.placeId, label: occurrence.placeName ?? draft.placeId }]
      : options.places

  const update = <K extends keyof SessionEditDraft>(key: K, value: SessionEditDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }))
    setProblems((current) => ({ ...current, [key]: undefined }))
  }
  const describedBy = (field: SessionEditField) => (problems[field] ? `${id}-${field}-problem` : undefined)
  const invalid = (field: SessionEditField) => (problems[field] ? true : undefined)
  const controlIds: Record<SessionEditField, string> = {
    date: `${id}-date`,
    startTime: `${id}-start`,
    endTime: `${id}-end`,
    placeId: draft.venueMode === 'venue' ? `${id}-mode-venue` : `${id}-place`,
    venueName: `${id}-venue-name`,
    venueAddress: `${id}-venue-address`,
    gatheringTime: `${id}-gathering`,
    confirmByDate: `${id}-confirm-date`,
    confirmByTime: `${id}-confirm-time`,
  }
  const showProblems = (next: Partial<Record<SessionEditField, string>>) => {
    setProblems(next)
    const first = FIELD_ORDER.find((field) => next[field])
    if (first) window.setTimeout(() => document.getElementById(controlIds[first])?.focus(), 0)
  }

  const submit = async () => {
    const found = sessionEditProblems(draft, deadlineShown)
    const fields = Object.keys(found) as SessionEditField[]
    if (fields.length > 0) {
      showProblems(
        Object.fromEntries(fields.map((field) => [field, t(PROBLEM_KEYS[found[field] as SessionEditProblem])])),
      )
      setError(t('activities.club.event.errors.fix'))
      return
    }
    setPending(true)
    setError(null)
    setRefusal(null)
    setConflicts(null)
    let call: Awaited<ReturnType<typeof apiCall<SaveAnswer>>>
    try {
      call = await withScopedApiRequestHeaders(buildOptimisticLockHeader(occurrence.updatedAt), () =>
        apiCall<SaveAnswer>(`/api/activities/occurrences/${encodeURIComponent(occurrence.id)}`, {
          method: 'PATCH',
          headers: { ...(OWN_FORBIDDEN_STATE.headers as Record<string, string>), 'content-type': 'application/json' },
          body: JSON.stringify(sessionEditBody(draft, initial, session, timeZone)),
        }),
      )
    } catch (failure: unknown) {
      setPending(false)
      if (!surfaceRecordConflict(failure, t)) setError(t('activities.club.edit.errors.save'))
      return
    }
    const answer = call.result ?? {}
    if (call.ok) {
      await queryClient.invalidateQueries({ queryKey: [SESSION_QUERY_KEY] })
      await queryClient.invalidateQueries({ queryKey: [CALENDAR_QUERY_KEY] })
      // REQ-A09: a move that is announced names how many people were told (J-A03 step 3).
      const notified = typeof answer.notified === 'number' ? answer.notified : 0
      flash(
        notified > 0 ? t('activities.club.edit.savedNotified', { count: notified }) : t('activities.club.edit.saved'),
        'success',
      )
      router.push(sessionHref(occurrence.id, as))
      return
    }
    setPending(false)
    const code = typeof answer.code === 'string' ? answer.code : null
    if (call.status === 409 && Array.isArray(answer.conflicts)) {
      setConflicts(answer.conflicts as ScheduleConflict[])
      setError(t('activities.club.event.errors.conflict'))
      return
    }
    if (call.status === 409) {
      // Changed meanwhile (another tab, the coordinator): reload the session before editing again.
      setError(t('activities.club.edit.errors.changed'))
      await queryClient.invalidateQueries({ queryKey: [SESSION_QUERY_KEY] })
      return
    }
    if (call.status === 403) {
      // The rights changed since the read: the same refusal as the read's, with the way forward.
      setRefusal(sessionEditRefusalOfCode(code))
      return
    }
    const message = call.status === 422 && typeof answer.error === 'string' && answer.error ? answer.error : null
    const field = call.status === 422 ? sessionEditFieldOfError(code) : null
    if (field) showProblems({ [field]: message ?? t('activities.club.event.problems.invalid') })
    setError(message ?? t('activities.club.edit.errors.save'))
  }

  const venueShown = draft.venueMode === 'venue'
  return (
    <form
      className="flex flex-col gap-4"
      data-testid="club-edit-form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">{t('activities.events.groups.when')}</legend>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="col-span-2 flex flex-col gap-1 sm:col-span-1">
            <Label htmlFor={`${id}-date`}>{t('activities.club.event.date')}</Label>
            <Input
              id={`${id}-date`}
              type="date"
              className="min-h-11"
              value={draft.date}
              aria-invalid={invalid('date')}
              aria-describedby={describedBy('date')}
              onChange={(event) => {
                update('date', event.target.value)
              }}
              data-testid="club-edit-date"
            />
            <FieldProblem id={`${id}-date-problem`} text={problems.date} />
          </div>
          {(
            [
              ['startTime', 'start', 'activities.fields.startTime'],
              ['endTime', 'end', 'activities.fields.endTime'],
              ['gatheringTime', 'gathering', 'activities.gathering.label'],
            ] as const
          ).map(([field, suffix, label]) => (
            <div key={field} className="flex flex-col gap-1">
              <Label htmlFor={`${id}-${suffix}`}>{t(label)}</Label>
              <Input
                id={`${id}-${suffix}`}
                type="time"
                className="min-h-11"
                value={draft[field]}
                aria-invalid={invalid(field)}
                aria-describedby={describedBy(field)}
                onChange={(event) => {
                  update(field, event.target.value)
                }}
                data-testid={`club-edit-${suffix}`}
              />
              <FieldProblem id={`${id}-${field}-problem`} text={problems[field]} />
            </div>
          ))}
        </div>
        <p className="text-muted-foreground text-sm">{t('activities.club.event.zone', { zone: timeZone })}</p>
      </fieldset>
      {partOf ? (
        <div className="flex flex-col gap-1" data-testid="club-edit-place-locked">
          <dl className="flex flex-col gap-1">
            <dt className="text-sm font-medium">{t('activities.fields.place')}</dt>
            <dd className="text-sm">{occurrence.placeName ?? ''}</dd>
          </dl>
          <p className="text-muted-foreground text-sm">
            {t('activities.clubEvents.club.session.placeLocked', { name: partOf.name })}
          </p>
        </div>
      ) : (
        <>
          <fieldset className="flex flex-col gap-2">
            <legend id={`${id}-mode`} className="mb-1 text-sm font-medium">
              {t('activities.venue.mode.label')}
            </legend>
            <RadioGroup
              aria-labelledby={`${id}-mode`}
              className="flex flex-col gap-2 sm:flex-row"
              value={draft.venueMode}
              onValueChange={(value) => {
                update('venueMode', (value === 'venue' ? 'venue' : 'place') satisfies VenueMode)
                setProblems((current) => ({
                  ...current,
                  placeId: undefined,
                  venueName: undefined,
                  venueAddress: undefined,
                }))
              }}
            >
              {(['place', 'venue'] as const).map((mode) => (
                <label
                  key={mode}
                  htmlFor={`${id}-mode-${mode}`}
                  className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3 py-2"
                  data-testid={`club-edit-venue-mode-${mode}`}
                >
                  <Radio id={`${id}-mode-${mode}`} value={mode} />
                  <span className="text-sm font-medium">{t(`activities.venue.mode.${mode}`)}</span>
                </label>
              ))}
            </RadioGroup>
          </fieldset>
          {venueShown ? (
            <>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${id}-venue-name`}>{t('activities.venue.name')}</Label>
                <Input
                  id={`${id}-venue-name`}
                  className="min-h-11"
                  value={draft.venueName}
                  maxLength={VENUE_NAME_MAX}
                  aria-invalid={invalid('venueName')}
                  aria-describedby={describedBy('venueName')}
                  onChange={(event) => {
                    update('venueName', event.target.value)
                  }}
                  data-testid="club-edit-venue-name"
                />
                <FieldProblem id={`${id}-venueName-problem`} text={problems.venueName} />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor={`${id}-venue-address`}>{t('activities.venue.address')}</Label>
                <Input
                  id={`${id}-venue-address`}
                  className="min-h-11"
                  value={draft.venueAddress}
                  maxLength={VENUE_ADDRESS_MAX}
                  aria-invalid={invalid('venueAddress')}
                  aria-describedby={[`${id}-venue-address-help`, describedBy('venueAddress')].filter(Boolean).join(' ')}
                  onChange={(event) => {
                    update('venueAddress', event.target.value)
                  }}
                  data-testid="club-edit-venue-address"
                />
                <p id={`${id}-venue-address-help`} className="text-muted-foreground text-sm">
                  {t('activities.venue.address.help')}
                </p>
                <FieldProblem id={`${id}-venueAddress-problem`} text={problems.venueAddress} />
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-1">
              <Label htmlFor={`${id}-place`}>{t('activities.fields.place')}</Label>
              <Select
                value={draft.placeId}
                onValueChange={(value) => {
                  update('placeId', value)
                }}
              >
                <SelectTrigger
                  id={`${id}-place`}
                  className="min-h-11 w-full sm:w-96"
                  aria-invalid={invalid('placeId')}
                  aria-describedby={describedBy('placeId')}
                  data-testid="club-edit-place"
                >
                  <SelectValue placeholder={t('activities.club.event.choosePlace')} />
                </SelectTrigger>
                <SelectContent>
                  {places.map((place) => (
                    <SelectItem key={place.id} value={place.id}>
                      {place.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldProblem id={`${id}-placeId-problem`} text={problems.placeId} />
            </div>
          )}
        </>
      )}
      {deadlineShown ? (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">{t('activities.deadline.label')}</legend>
          <div className="grid grid-cols-2 gap-3 sm:w-96">
            {(
              [
                ['confirmByDate', 'confirm-date', 'date', 'activities.occurrences.fields.confirmByDate'],
                ['confirmByTime', 'confirm-time', 'time', 'activities.occurrences.fields.confirmByTime'],
              ] as const
            ).map(([field, suffix, type, label]) => (
              <div key={field} className="flex flex-col gap-1">
                <Label htmlFor={`${id}-${suffix}`}>{t(label)}</Label>
                <Input
                  id={`${id}-${suffix}`}
                  type={type}
                  className="min-h-11"
                  value={draft[field]}
                  aria-invalid={invalid(field)}
                  aria-describedby={[`${id}-confirm-help`, describedBy(field)].filter(Boolean).join(' ')}
                  onChange={(event) => {
                    update(field, event.target.value)
                  }}
                  data-testid={`club-edit-${suffix}`}
                />
                <FieldProblem id={`${id}-${field}-problem`} text={problems[field]} />
              </div>
            ))}
          </div>
          <p id={`${id}-confirm-help`} className="text-muted-foreground text-sm">
            {t('activities.occurrences.fields.confirmBy.help')}
          </p>
        </fieldset>
      ) : null}
      {conflicts ? <ConflictList conflicts={conflicts} linkSessions={false} /> : null}
      {refusal ? <EditRefusal reason={refusal} clubEventName={partOf?.name ?? null} /> : null}
      {error && !conflicts ? (
        <Alert status="error" data-testid="club-edit-error">
          <p>{error}</p>
        </Alert>
      ) : null}
      {/* On a phone the submit stays in view above the fixed bottom navigation (as the new-event form's bar). */}
      <div
        className="bg-background sticky bottom-24 z-30 -mx-4 flex flex-wrap gap-2 border-t px-4 py-3 sm:static sm:mx-0 sm:border-0 sm:p-0"
        data-testid="club-edit-actions"
      >
        <Button type="submit" className="min-h-11" disabled={pending} data-testid="club-edit-submit">
          {pending ? t('activities.club.edit.saving') : t('activities.club.edit.submit')}
        </Button>
        <Button asChild variant="outline" className="min-h-11">
          <Link href={sessionHref(occurrence.id, as)}>{t('activities.club.event.cancel')}</Link>
        </Button>
      </div>
    </form>
  )
}

/** The staff read of the form: the one the link names, else the session page's staff perspective for this person. */
function editPerspective(requested: string | null, profile: ClubProfile): 'coach' | 'coordinator' {
  if (requested === 'coordinator' || requested === 'coach') return requested
  const staff = sessionPerspectives(null, {
    hasWards: profile.wards.length > 0,
    coaches: profile.contexts.includes('coach'),
    coordinates: memberStaffScopes(profile).includes('coordinator'),
  }).staff
  return staff ?? 'coach'
}

function EditSession({ id, t, profile }: { id: string; t: Translate; profile: ClubProfile }) {
  const as = editPerspective(useSearchParams().get('as'), profile)
  const session = useMemberSession(id, as, null)
  const options = useEditOptions()
  let body: React.ReactNode
  const load = session.data
  const refusal =
    load?.status === 'forbidden'
      ? sessionEditRefusal({ status: 'forbidden' })
      : load?.status === 'ok'
        ? sessionEditRefusal({
            status: 'ok',
            mayEdit: load.entry.mayEdit === true,
            planned: load.entry.occurrence.status === 'planned',
            partOfClubEvent: Boolean(load.entry.occurrence.clubEvent),
            as,
          })
        : null
  if ((!load && session.isFetching) || (!options.data && options.isFetching)) {
    body = <MemberSkeleton shape="fields" label={t('activities.club.edit.loading')} />
  } else if (load?.status === 'not_found') {
    body = (
      <Alert status="information" data-testid="club-edit-not-found">
        <p>{t('activities.club.edit.notFound')}</p>
      </Alert>
    )
  } else if (refusal) {
    body = (
      <EditRefusal
        reason={refusal}
        clubEventName={load?.status === 'ok' ? (load.entry.occurrence.clubEvent?.name ?? null) : null}
      />
    )
  } else if (load?.status === 'ok' && options.data) {
    body = <EditForm entry={load.entry} timeZone={load.entry.timeZone} options={options.data} as={as} />
  } else {
    body = (
      <ErrorMessage
        label={t('activities.club.edit.errors.load')}
        action={
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => {
              void session.refetch()
              void options.refetch()
            }}
          >
            {t('activities.club.actions.retry')}
          </Button>
        }
      />
    )
  }
  return (
    <>
      <Link href={sessionHref(id, as)} className="text-primary inline-flex min-h-11 items-center text-sm underline">
        {t('activities.club.edit.back')}
      </Link>
      <h1 className="text-2xl font-semibold">{t('activities.club.edit.title')}</h1>
      {body}
    </>
  )
}

export function ClubSessionEditPage({ id }: { id: string }) {
  const t = useT()
  return (
    <ActivitiesClubFrame skeleton="fields">
      {(profile) => <EditSession id={id} t={t} profile={profile} />}
    </ActivitiesClubFrame>
  )
}
