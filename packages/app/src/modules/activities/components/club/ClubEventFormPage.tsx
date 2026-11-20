'use client'
// `/club/club-events/new` and `/club/club-events/[id]/edit` — the club event form on the phone (club events spec B-T2
// on the phone, REQ-T01, REQ-T05, REQ-T06, REQ-T12; J-T01 steps 1–3; E14-S05, #380): the name, the public address
// (left empty, the server proposes it from the name; the proposal is shown as the placeholder), the section — the
// caller's only one preselected, "Whole club" for the administrator — the place with the external ones marked and
// **Add place** (the `club_core` bottom sheet drawn on the spot `vereino:activities:club-event-form:add-place` with
// `surface: 'sheet'`, so `activities` never imports `club_core`), the description, Public, and the default gathering
// and deadline of new parts. The options come from `GET /api/activities/club-events/options`; the save is `POST` or
// `PUT /api/activities/club-events` (the edit sends the event's lock token). A collision of a place change lists the
// colliding sessions and saves nothing; a coded refusal points at its field; a lost connection keeps the values and
// offers **Try again**. The submit bar stays above the bottom navigation.
import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { ErrorMessage } from '@open-mercato/ui/backend/detail'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { InjectionSpot } from '@open-mercato/ui/backend/injection/InjectionSpot'
import { apiCall, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { Alert } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import { Checkbox } from '@open-mercato/ui/primitives/checkbox'
import { Input } from '@open-mercato/ui/primitives/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { MemberSkeleton } from '@vereino/ui'
import {
  CLUB_EVENT_DESCRIPTION_MAX,
  CLUB_EVENT_NAME_MAX,
  CLUB_EVENT_SLUG_MAX,
  proposeClubEventSlug,
} from '../../lib/club-events'
import {
  WHOLE_CLUB,
  clubEventDraft,
  clubEventDraftProblems,
  clubEventFieldOfError,
  clubEventRequestBody,
  type ClubEventDraft,
  type ClubEventDraftField,
} from '../../lib/member-club-event'
import { CLUB_EVENT_ADD_PLACE_SPOT_ID } from '../ClubEventForm'
import { ConflictList } from '../ConflictList'
import { OWN_FORBIDDEN_STATE, type ScheduleConflict } from '../client-helpers'
import {
  CLUB_EVENT_OPTIONS_QUERY_KEY,
  MEMBER_CLUB_EVENTS_HREF,
  clubEventQueryKey,
  memberClubEventHref,
  useClubEvent,
  useClubEventOptions,
  type ClubEventDetail,
  type ClubEventOptions,
} from '../club-events-client'
import { ActivitiesClubFrame } from './ActivitiesClubFrame'
import {
  FormError,
  MemberField,
  PROBLEM_KEYS,
  StickyActions,
  describedBy,
  focusFirstProblem,
} from './ClubEventFormParts'
import type { Translate } from './club-client'

const FIELD_ORDER: readonly ClubEventDraftField[] = [
  'name',
  'publicSlug',
  'sectionId',
  'placeId',
  'description',
  'gatheringMinutes',
  'confirmByHours',
]

type SaveAnswer = {
  id?: string
  code?: string
  error?: string
  conflicts?: unknown
  sessionsMoved?: number
  notified?: number
}

/** The options with the stored event's own section and place kept, even when the caller could not pick them anew. */
function mergedOptions(options: ClubEventOptions, event: ClubEventDetail | null): ClubEventOptions {
  if (!event) return options
  const sections =
    event.sectionId && !options.sections.some((section) => section.id === event.sectionId)
      ? [...options.sections, { id: event.sectionId, name: event.sectionName ?? event.sectionId }]
      : options.sections
  const places =
    event.placeId && !options.places.some((place) => place.id === event.placeId)
      ? [
          ...options.places,
          { id: event.placeId, label: event.placeName ?? event.placeId, isExternal: event.placeExternal === true },
        ]
      : options.places
  return { ...options, wholeClub: options.wholeClub || event.sectionId === null, sections, places }
}

function EventForm({ options, event, t }: { options: ClubEventOptions; event: ClubEventDetail | null; t: Translate }) {
  const router = useRouter()
  const queryClient = useQueryClient()
  const id = React.useId()
  const [draft, setDraft] = React.useState<ClubEventDraft>(() => clubEventDraft(event, options))
  const [problems, setProblems] = React.useState<Partial<Record<ClubEventDraftField, string>>>({})
  const [conflicts, setConflicts] = React.useState<ScheduleConflict[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [offline, setOffline] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const [addingPlace, setAddingPlace] = React.useState(false)
  const back = event ? memberClubEventHref(event.id) : MEMBER_CLUB_EVENTS_HREF
  const proposedSlug = event ? null : proposeClubEventSlug(draft.name)

  const update = <K extends keyof ClubEventDraft>(key: K, value: ClubEventDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }))
    setProblems((current) => ({ ...current, [key]: undefined }))
  }
  const showProblems = (next: Partial<Record<ClubEventDraftField, string>>) => {
    setProblems(next)
    focusFirstProblem(id, FIELD_ORDER, next)
  }
  const pickPlace = async (placeId: string) => {
    await queryClient.invalidateQueries({ queryKey: CLUB_EVENT_OPTIONS_QUERY_KEY })
    update('placeId', placeId)
  }

  const submit = async () => {
    const found = clubEventDraftProblems(draft)
    const fields = Object.keys(found) as ClubEventDraftField[]
    if (fields.length > 0) {
      showProblems(Object.fromEntries(fields.map((field) => [field, t(PROBLEM_KEYS[found[field] ?? 'invalid'])])))
      setError(t('activities.club.event.errors.fix'))
      setOffline(false)
      return
    }
    setPending(true)
    setError(null)
    setOffline(false)
    setConflicts(null)
    const body = clubEventRequestBody(draft)
    let call: Awaited<ReturnType<typeof apiCall<SaveAnswer>>>
    try {
      const send = () =>
        apiCall<SaveAnswer>('/api/activities/club-events', {
          method: event ? 'PUT' : 'POST',
          headers: { ...(OWN_FORBIDDEN_STATE.headers as Record<string, string>), 'content-type': 'application/json' },
          body: JSON.stringify(event ? { id: event.id, ...body } : body),
        })
      call = event ? await withScopedApiRequestHeaders(buildOptimisticLockHeader(event.updatedAt), send) : await send()
    } catch {
      setPending(false)
      setOffline(true)
      setError(t('activities.clubEvents.club.form.offline'))
      return
    }
    const answer = call.result ?? {}
    if (call.ok) {
      await queryClient.invalidateQueries({ queryKey: ['activities-member-club-events'] })
      if (event) {
        await queryClient.invalidateQueries({ queryKey: clubEventQueryKey(event.id) })
        const moved = answer.sessionsMoved ?? 0
        flash(
          moved > 0
            ? t('activities.clubEvents.flash.savedMoved', { count: moved, notified: answer.notified ?? 0 })
            : t('activities.clubEvents.flash.saved'),
          'success',
        )
        router.push(memberClubEventHref(event.id))
      } else {
        flash(t('activities.clubEvents.flash.created'), 'success')
        router.push(answer.id ? memberClubEventHref(answer.id) : MEMBER_CLUB_EVENTS_HREF)
      }
      return
    }
    setPending(false)
    const code = typeof answer.code === 'string' ? answer.code : null
    if (call.status === 409 && Array.isArray(answer.conflicts)) {
      setConflicts(answer.conflicts as ScheduleConflict[])
      setError(t('activities.club.event.errors.conflict'))
      return
    }
    const field = clubEventFieldOfError(code)
    const message =
      code === 'scope_denied'
        ? t('activities.clubEvents.errors.sectionDenied')
        : typeof answer.error === 'string' && answer.error
          ? answer.error
          : null
    if (field) {
      showProblems({ [field]: message ?? t('activities.club.event.problems.invalid') })
      setError(message ?? t('activities.club.event.errors.fix'))
      return
    }
    if (call.status === 404) {
      showProblems({ placeId: t('activities.clubEvents.errors.placeGone') })
      setError(t('activities.clubEvents.errors.placeGone'))
      return
    }
    if (call.status === 409 && event) {
      // Changed meanwhile (the panel, another phone): reload the event before editing again. The form is
      // keyed by the stored version, so the reload remounts it; a flash survives that, local state does not.
      flash(t('activities.clubEvents.club.form.changed'), 'warning')
      await queryClient.invalidateQueries({ queryKey: clubEventQueryKey(event.id) })
      return
    }
    setError(message ?? t(event ? 'activities.clubEvents.errors.save' : 'activities.clubEvents.errors.create'))
  }

  const sections = [
    ...(options.wholeClub ? [{ id: WHOLE_CLUB, name: t('activities.clubEvents.section.wholeClub') }] : []),
    ...options.sections,
  ]
  const input = (field: ClubEventDraftField, help: boolean) => ({
    id: `${id}-${field}`,
    'aria-invalid': problems[field] ? true : undefined,
    'aria-describedby': describedBy(id, field, help, problems[field]),
  })

  return (
    <form
      className="flex flex-col gap-4"
      data-testid="club-event-member-form"
      noValidate
      onSubmit={(submitEvent) => {
        submitEvent.preventDefault()
        void submit()
      }}
    >
      <MemberField prefix={id} field="name" label={t('activities.clubEvents.fields.name')} problem={problems.name}>
        <Input
          {...input('name', false)}
          className="min-h-11"
          value={draft.name}
          maxLength={CLUB_EVENT_NAME_MAX}
          onChange={(change) => {
            update('name', change.target.value)
          }}
          data-testid="club-event-member-name"
        />
      </MemberField>
      <MemberField
        prefix={id}
        field="publicSlug"
        label={t('activities.clubEvents.fields.slug')}
        help={t(event ? 'activities.clubEvents.fields.slug.editHelp' : 'activities.clubEvents.fields.slug.help')}
        problem={problems.publicSlug}
      >
        <Input
          {...input('publicSlug', true)}
          className="min-h-11"
          value={draft.publicSlug}
          maxLength={CLUB_EVENT_SLUG_MAX}
          autoCapitalize="none"
          autoCorrect="off"
          placeholder={proposedSlug ?? undefined}
          onChange={(change) => {
            update('publicSlug', change.target.value)
          }}
          data-testid="club-event-member-slug"
        />
      </MemberField>
      <MemberField
        prefix={id}
        field="sectionId"
        label={t('activities.clubEvents.fields.section')}
        help={t('activities.clubEvents.fields.section.help')}
        problem={problems.sectionId}
      >
        <Select
          value={draft.sectionId || undefined}
          onValueChange={(value) => {
            update('sectionId', value)
          }}
        >
          <SelectTrigger
            {...input('sectionId', true)}
            className="min-h-11 w-full"
            data-testid="club-event-member-section"
          >
            <SelectValue placeholder={t('activities.clubEvents.club.form.chooseSection')} />
          </SelectTrigger>
          <SelectContent>
            {sections.map((section) => (
              <SelectItem key={section.id} value={section.id}>
                {section.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </MemberField>
      <MemberField
        prefix={id}
        field="placeId"
        label={t('activities.clubEvents.fields.place')}
        help={t(
          options.places.length === 0 ? 'activities.clubEvents.place.empty' : 'activities.clubEvents.fields.place.help',
        )}
        problem={problems.placeId}
      >
        <Select
          value={draft.placeId || undefined}
          onValueChange={(value) => {
            update('placeId', value)
          }}
        >
          <SelectTrigger {...input('placeId', true)} className="min-h-11 w-full" data-testid="club-event-member-place">
            <SelectValue placeholder={t('activities.clubEvents.fields.place.placeholder')} />
          </SelectTrigger>
          <SelectContent>
            {options.places.map((place) => (
              <SelectItem key={place.id} value={place.id}>
                {place.isExternal
                  ? t('activities.clubEvents.place.externalOption', { name: place.label })
                  : place.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          className="min-h-11 w-full sm:w-auto"
          data-testid="club-event-member-add-place"
          onClick={() => {
            setAddingPlace(true)
          }}
        >
          {t('activities.clubEvents.actions.addPlace')}
        </Button>
      </MemberField>
      <InjectionSpot
        spotId={CLUB_EVENT_ADD_PLACE_SPOT_ID}
        context={{
          surface: 'sheet',
          open: addingPlace,
          onOpenChange: setAddingPlace,
          onAdded: (place: { id: string }) => pickPlace(place.id),
          onPickExisting: (placeId: string) => pickPlace(placeId),
        }}
      />
      <MemberField
        prefix={id}
        field="description"
        label={t('activities.clubEvents.fields.description')}
        problem={problems.description}
      >
        <Textarea
          {...input('description', false)}
          className="min-h-24"
          value={draft.description}
          maxLength={CLUB_EVENT_DESCRIPTION_MAX}
          onChange={(change) => {
            update('description', change.target.value)
          }}
          data-testid="club-event-member-description"
        />
      </MemberField>
      <label
        htmlFor={`${id}-isPublic`}
        className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3 py-2"
        data-testid="club-event-member-public"
      >
        <Checkbox
          id={`${id}-isPublic`}
          checked={draft.isPublic}
          onCheckedChange={(value) => {
            update('isPublic', value === true)
          }}
        />
        <span className="flex flex-col">
          <span className="text-sm font-medium">{t('activities.clubEvents.fields.isPublic')}</span>
          <span className="text-muted-foreground text-sm">{t('activities.clubEvents.fields.isPublic.help')}</span>
        </span>
      </label>
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 text-sm font-medium">{t('activities.clubEvents.groups.defaults')}</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <MemberField
            prefix={id}
            field="gatheringMinutes"
            label={t('activities.fields.gatheringMinutesBefore')}
            help={t('activities.clubEvents.fields.gathering.help')}
            problem={problems.gatheringMinutes}
          >
            <Input
              {...input('gatheringMinutes', true)}
              type="number"
              inputMode="numeric"
              min={1}
              className="min-h-11"
              value={draft.gatheringMinutes}
              onChange={(change) => {
                update('gatheringMinutes', change.target.value)
              }}
              data-testid="club-event-member-gathering"
            />
          </MemberField>
          <MemberField
            prefix={id}
            field="confirmByHours"
            label={t('activities.fields.confirmByHoursBefore')}
            help={t('activities.clubEvents.fields.confirmBy.help')}
            problem={problems.confirmByHours}
          >
            <Input
              {...input('confirmByHours', true)}
              type="number"
              inputMode="numeric"
              min={1}
              className="min-h-11"
              value={draft.confirmByHours}
              onChange={(change) => {
                update('confirmByHours', change.target.value)
              }}
              data-testid="club-event-member-confirm-by"
            />
          </MemberField>
        </div>
      </fieldset>
      {conflicts ? <ConflictList conflicts={conflicts} linkSessions={false} /> : null}
      {!conflicts ? (
        <FormError error={error} offline={offline} pending={pending} onRetry={() => void submit()} t={t} />
      ) : null}
      <StickyActions
        submitLabel={t(event ? 'activities.common.save' : 'activities.common.create')}
        savingLabel={t('activities.clubEvents.club.form.saving')}
        pending={pending}
        cancelHref={back}
        t={t}
      />
    </form>
  )
}

function FormBody({ id, t }: { id: string | null; t: Translate }) {
  const options = useClubEventOptions()
  const stored = useClubEvent(id ?? '', id !== null)
  const loading = (!options.data && options.isFetching) || (id !== null && !stored.data && stored.isFetching)
  if (loading) return <MemberSkeleton shape="fields" label={t('activities.clubEvents.loading')} />
  if (id !== null && stored.data?.status === 'not_found') {
    return (
      <Alert status="information" data-testid="club-event-member-not-found">
        <p>{t('activities.clubEvents.errors.notFound')}</p>
      </Alert>
    )
  }
  const event = stored.data?.status === 'ok' ? stored.data.event : null
  if (
    !options.data ||
    (id !== null && stored.data?.status === 'denied') ||
    (event && (event.mayManage !== true || event.status !== 'planned'))
  ) {
    // No options: the caller does not organise club events (403), or the read failed.
    const denied = (id !== null && stored.data?.status === 'denied') || (event !== null && event.mayManage !== true)
    if (denied || (options.data === null && !options.error)) {
      return (
        <Alert status="information" data-testid="club-event-member-denied">
          <p>{t('activities.clubEvents.club.form.denied')}</p>
        </Alert>
      )
    }
    if (event && event.status !== 'planned') {
      return (
        <Alert status="information" data-testid="club-event-member-cancelled">
          <p>{t('activities.clubEvents.cancelled.title')}</p>
        </Alert>
      )
    }
    return (
      <ErrorMessage
        label={t('activities.clubEvents.errors.options')}
        action={
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => {
              void options.refetch()
              if (id !== null) void stored.refetch()
            }}
          >
            {t('activities.club.actions.retry')}
          </Button>
        }
      />
    )
  }
  if (id !== null && !event) {
    return (
      <ErrorMessage
        label={t('activities.clubEvents.errors.loadOne')}
        action={
          <Button type="button" variant="outline" className="min-h-11" onClick={() => void stored.refetch()}>
            {t('activities.club.actions.retry')}
          </Button>
        }
      />
    )
  }
  return <EventForm key={event?.updatedAt ?? 'new'} options={mergedOptions(options.data, event)} event={event} t={t} />
}

function ClubEventFormContent({ id, t }: { id: string | null; t: Translate }) {
  const back = id ? memberClubEventHref(id) : MEMBER_CLUB_EVENTS_HREF
  return (
    <>
      <Link href={back} className="text-primary inline-flex min-h-11 items-center text-sm underline">
        {t(id ? 'activities.clubEvents.club.event.back' : 'activities.clubEvents.actions.back')}
      </Link>
      <h1 className="text-2xl font-semibold">
        {t(id ? 'activities.clubEvents.club.form.editTitle' : 'activities.clubEvents.create.title')}
      </h1>
      <FormBody id={id} t={t} />
    </>
  )
}

/** `/club/club-events/new` (no id) and `/club/club-events/[id]/edit`. */
export function ClubEventFormPage({ id = null }: { id?: string | null }) {
  const t = useT()
  return <ActivitiesClubFrame skeleton="fields">{() => <ClubEventFormContent id={id} t={t} />}</ActivitiesClubFrame>
}
