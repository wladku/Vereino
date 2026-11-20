'use client'
// `/club/club-events/[id]/parts/new` and `/club/club-events/[id]/parts/[partId]/edit` — a part of a club event on the
// phone (club events spec REQ-T02, REQ-T04, REQ-T07, REQ-T12, UI row "Part dialog" on the phone; J-T01 steps 4–7;
// E14-S05, #380): the title, the day with its start and end in the club's zone, our group or "No club group" (offered
// at an external place only), the category (proposed from the group's age category), the type (no match or sparring
// for a class group), the coach, the gathering and the deadline (for a `confirm` kind) and the visiting teams — chips
// picked from the club's external teams, or added with **Add team**. `?copyOf=<partId>` starts from that part, all but
// the day and the group (glossary *Copying a part*). A stored part with a group keeps its day and times (they change
// through **Move**), its group and its coach (**Change coach** on the session page); an open part keeps its own times
// here. A collision (409) lists the colliding sessions and saves nothing; a coded refusal points at its field; a lost
// connection keeps the values and offers **Try again**. The submit bar stays above the bottom navigation.
import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ErrorMessage } from '@open-mercato/ui/backend/detail'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { apiCall, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { Alert } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import { Input } from '@open-mercato/ui/primitives/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { useLocale, useT } from '@open-mercato/shared/lib/i18n/context'
import { MemberSkeleton } from '@vereino/ui'
import { EVENT_TYPES, takesOpponent } from '../../lib/activities-rules'
import { PART_CATEGORY_MAX, PART_TITLE_MAX } from '../../lib/club-events'
import {
  NO_GROUP,
  partDraft,
  partDraftProblems,
  partFieldOfError,
  partRequestBody,
  partTimeRangeInZone,
  type PartDraft,
  type PartDraftField,
} from '../../lib/member-club-event'
import { VisitingTeamsField } from '../ClubEventPartDialog'
import { ConflictList } from '../ConflictList'
import { NO_COACH, OWN_FORBIDDEN_STATE, coachOptions, takesDeadline, type ScheduleConflict } from '../client-helpers'
import {
  clubEventQueryKey,
  memberClubEventHref,
  partDayLabel,
  useClubEvent,
  useClubEventOptions,
  type ClubEventDetail,
  type ClubEventOptions,
  type ClubEventPart,
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
import { CALENDAR_QUERY_KEY, sessionEditHref, sessionHref, type Translate } from './club-client'

const FIELD_ORDER: readonly PartDraftField[] = [
  'title',
  'date',
  'startTime',
  'endTime',
  'groupId',
  'categoryLabel',
  'type',
  'coachPersonId',
  'gatheringMinutes',
  'confirmByHours',
  'visitingTeamIds',
]

type SaveAnswer = { code?: string; error?: string; field?: string; conflicts?: unknown }

function useCoaches(enabled: boolean, t: Translate) {
  return useQuery({
    queryKey: ['activities-club-event-coaches'],
    enabled,
    queryFn: () => coachOptions(t).catch(() => []),
  })
}

function ReadOnly({
  prefix,
  field,
  label,
  text,
  action,
}: {
  prefix: string
  field: string
  label: string
  text: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1" data-testid={`club-event-part-member-${field}`}>
      <span className="text-sm font-medium" id={`${prefix}-${field}-label`}>
        {label}
      </span>
      <p className="text-sm" aria-labelledby={`${prefix}-${field}-label`}>
        {text}
      </p>
      {action}
    </div>
  )
}

function PartForm({
  event,
  options,
  part,
  copy,
  timeZone,
  t,
}: {
  event: ClubEventDetail
  options: ClubEventOptions
  part: ClubEventPart | null
  copy: ClubEventPart | null
  timeZone: string
  t: Translate
}) {
  const locale = useLocale()
  const router = useRouter()
  const queryClient = useQueryClient()
  const id = React.useId()
  const editing = part !== null
  const fixedTimes = part?.kind === 'group'
  const [draft, setDraft] = React.useState<PartDraft>(() =>
    partDraft(
      part ? { kind: 'edit', part } : copy ? { kind: 'copy', part: copy } : { kind: 'create', event },
      timeZone,
    ),
  )
  const [problems, setProblems] = React.useState<Partial<Record<PartDraftField, string>>>({})
  const [conflicts, setConflicts] = React.useState<ScheduleConflict[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [offline, setOffline] = React.useState(false)
  const [pending, setPending] = React.useState(false)
  const back = memberClubEventHref(event.id)
  const groups = React.useMemo(
    () => options.groups.filter((group) => event.sectionId === null || group.sectionId === event.sectionId),
    [options.groups, event.sectionId],
  )
  const groupPart = editing ? part.kind === 'group' : draft.groupId !== NO_GROUP
  const coaches = useCoaches(!editing && groupPart, t)
  const groupKind = options.groups.find((group) => group.id === (part?.groupId ?? draft.groupId))?.kind ?? null
  const types = EVENT_TYPES.filter((type) => groupKind === 'team' || !takesOpponent(type))
  const deadlineShown =
    groupPart &&
    Object.values(options.declarationKinds).some((kind) => kind === 'confirm') &&
    takesDeadline(options.declarationKinds, draft.type)

  const update = <K extends keyof PartDraft>(key: K, value: PartDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }))
    setProblems((current) => ({ ...current, [key]: undefined }))
  }
  const chooseGroup = (groupId: string) => {
    const group = options.groups.find((entry) => entry.id === groupId) ?? null
    const previous = options.groups.find((entry) => entry.id === draft.groupId) ?? null
    setDraft((current) => {
      const next = { ...current, groupId }
      // The category is proposed from the group's age category while the user has not typed another one (J-T01 step 4).
      if (group?.ageCategoryLabel && (!current.categoryLabel || current.categoryLabel === previous?.ageCategoryLabel)) {
        next.categoryLabel = group.ageCategoryLabel
      }
      // A class group takes neither a match nor a sparring (DD-T02).
      if (group?.kind !== 'team' && takesOpponent(current.type)) next.type = 'tournament'
      if (groupId === NO_GROUP) next.coachPersonId = ''
      return next
    })
    setProblems((current) => ({ ...current, groupId: undefined }))
  }
  const showProblems = (next: Partial<Record<PartDraftField, string>>) => {
    setProblems(next)
    focusFirstProblem(id, FIELD_ORDER, next)
  }

  const submit = async () => {
    const found = partDraftProblems(draft, { editing, fixedTimes })
    const fields = Object.keys(found) as PartDraftField[]
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
    const body = partRequestBody(draft, { editing, fixedTimes, timeZone, groupPart, deadlineShown })
    const base = `/api/activities/club-events/${encodeURIComponent(event.id)}/parts`
    let call: Awaited<ReturnType<typeof apiCall<SaveAnswer>>>
    try {
      const send = () =>
        apiCall<SaveAnswer>(part ? `${base}/${encodeURIComponent(part.id)}` : base, {
          method: part ? 'PUT' : 'POST',
          headers: { ...(OWN_FORBIDDEN_STATE.headers as Record<string, string>), 'content-type': 'application/json' },
          body: JSON.stringify(body),
        })
      call = part ? await withScopedApiRequestHeaders(buildOptimisticLockHeader(part.updatedAt), send) : await send()
    } catch {
      setPending(false)
      setOffline(true)
      setError(t('activities.clubEvents.club.form.offline'))
      return
    }
    const answer = call.result ?? {}
    if (call.ok) {
      await queryClient.invalidateQueries({ queryKey: clubEventQueryKey(event.id) })
      await queryClient.invalidateQueries({ queryKey: ['activities-member-club-events'] })
      await queryClient.invalidateQueries({ queryKey: [CALENDAR_QUERY_KEY] })
      flash(t(part ? 'activities.clubEvents.part.flash.saved' : 'activities.clubEvents.part.flash.created'), 'success')
      router.push(back)
      return
    }
    setPending(false)
    const code = typeof answer.code === 'string' ? answer.code : null
    if (call.status === 409 && Array.isArray(answer.conflicts)) {
      setConflicts(answer.conflicts as ScheduleConflict[])
      setError(t('activities.club.event.errors.conflict'))
      return
    }
    const message = typeof answer.error === 'string' && answer.error ? answer.error : null
    const field = partFieldOfError(code, answer.field)
    if (
      field &&
      (field !== 'groupId' || !editing) &&
      !(fixedTimes && ['date', 'startTime', 'endTime'].includes(field))
    ) {
      showProblems({ [field]: message ?? t('activities.club.event.problems.invalid') })
      setError(message ?? t('activities.club.event.errors.fix'))
      return
    }
    if (call.status === 409 && part) {
      setError(t('activities.clubEvents.club.form.changed'))
      await queryClient.invalidateQueries({ queryKey: clubEventQueryKey(event.id) })
      return
    }
    setError(message ?? t(part ? 'activities.clubEvents.part.errors.save' : 'activities.clubEvents.part.errors.create'))
  }

  const input = (field: PartDraftField, help: boolean) => ({
    id: `${id}-${field}`,
    'aria-invalid': problems[field] ? true : undefined,
    'aria-describedby': describedBy(id, field, help, problems[field]),
  })
  const groupOptions = [
    ...groups.map((group) => ({
      value: group.id,
      label: group.sectionName ? `${group.name} · ${group.sectionName}` : group.name,
    })),
    ...(event.placeExternal ? [{ value: NO_GROUP, label: t('activities.clubEvents.part.noGroup') }] : []),
  ]

  return (
    <form
      className="flex flex-col gap-4"
      data-testid="club-event-part-member-form"
      noValidate
      onSubmit={(submitEvent) => {
        submitEvent.preventDefault()
        void submit()
      }}
    >
      <MemberField
        prefix={id}
        field="title"
        label={t('activities.clubEvents.part.fields.title')}
        problem={problems.title}
      >
        <Input
          {...input('title', false)}
          className="min-h-11"
          value={draft.title}
          maxLength={PART_TITLE_MAX}
          onChange={(change) => {
            update('title', change.target.value)
          }}
          data-testid="club-event-part-member-title"
        />
      </MemberField>
      {part?.kind === 'group' ? (
        <ReadOnly
          prefix={id}
          field="when"
          label={t('activities.clubEvents.part.fields.when')}
          text={`${partDayLabel(t, locale, draft.date)}, ${partTimeRangeInZone(part.startAt, part.endAt, timeZone)}`}
          action={
            part.occurrenceId && part.status === 'planned' ? (
              <p className="text-muted-foreground text-sm">
                {t('activities.clubEvents.part.fields.when.help')}{' '}
                <Link className="text-primary underline" href={sessionEditHref(part.occurrenceId, 'coordinator')}>
                  {t('activities.clubEvents.part.actions.move')}
                </Link>
              </p>
            ) : null
          }
        />
      ) : (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium">{t('activities.events.groups.when')}</legend>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="col-span-2 sm:col-span-1">
              <MemberField
                prefix={id}
                field="date"
                label={t('activities.clubEvents.part.fields.day')}
                problem={problems.date}
              >
                <Input
                  {...input('date', false)}
                  type="date"
                  className="min-h-11"
                  value={draft.date}
                  onChange={(change) => {
                    update('date', change.target.value)
                  }}
                  data-testid="club-event-part-member-date"
                />
              </MemberField>
            </div>
            {(['startTime', 'endTime'] as const).map((field) => (
              <MemberField
                key={field}
                prefix={id}
                field={field}
                label={t(`activities.fields.${field}`)}
                problem={problems[field]}
              >
                <Input
                  {...input(field, false)}
                  type="time"
                  className="min-h-11"
                  value={draft[field]}
                  onChange={(change) => {
                    update(field, change.target.value)
                  }}
                  data-testid={`club-event-part-member-${field === 'startTime' ? 'start' : 'end'}`}
                />
              </MemberField>
            ))}
          </div>
          <p className="text-muted-foreground text-sm">{t('activities.club.event.zone', { zone: timeZone })}</p>
        </fieldset>
      )}
      {part ? (
        <ReadOnly
          prefix={id}
          field="group"
          label={t('activities.clubEvents.part.fields.group')}
          text={
            part.groupName
              ? `${part.groupName}${part.sectionName ? ` · ${part.sectionName}` : ''}`
              : t('activities.clubEvents.part.noGroup')
          }
        />
      ) : (
        <MemberField
          prefix={id}
          field="groupId"
          label={t('activities.clubEvents.part.fields.group')}
          help={t(
            event.placeExternal
              ? 'activities.clubEvents.part.fields.group.help'
              : 'activities.clubEvents.part.fields.group.helpOwnPlace',
          )}
          problem={problems.groupId}
        >
          <Select value={draft.groupId || undefined} onValueChange={chooseGroup}>
            <SelectTrigger
              {...input('groupId', true)}
              className="min-h-11 w-full"
              data-testid="club-event-part-member-group"
            >
              <SelectValue placeholder={t('activities.club.event.chooseGroup')} />
            </SelectTrigger>
            <SelectContent>
              {groupOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </MemberField>
      )}
      <MemberField
        prefix={id}
        field="categoryLabel"
        label={t('activities.clubEvents.part.fields.category')}
        help={t('activities.clubEvents.part.fields.category.help')}
        problem={problems.categoryLabel}
      >
        <Input
          {...input('categoryLabel', true)}
          className="min-h-11"
          value={draft.categoryLabel}
          maxLength={PART_CATEGORY_MAX}
          onChange={(change) => {
            update('categoryLabel', change.target.value)
          }}
          data-testid="club-event-part-member-category"
        />
      </MemberField>
      <MemberField prefix={id} field="type" label={t('activities.fields.type')} problem={problems.type}>
        <Select
          value={types.some((type) => type === draft.type) ? draft.type : undefined}
          onValueChange={(value) => {
            update('type', value)
          }}
        >
          <SelectTrigger
            {...input('type', false)}
            className="min-h-11 w-full"
            data-testid="club-event-part-member-type"
          >
            <SelectValue placeholder={t('activities.clubEvents.part.fields.type.placeholder')} />
          </SelectTrigger>
          <SelectContent>
            {types.map((type) => (
              <SelectItem key={type} value={type}>
                {t(`activities.types.${type}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </MemberField>
      {part?.kind === 'group' ? (
        <ReadOnly
          prefix={id}
          field="coach"
          label={t('activities.fields.coach')}
          text={part.coachName ?? t('activities.clubEvents.part.noCoach')}
          action={
            part.occurrenceId && part.status === 'planned' ? (
              <Link
                className="text-primary inline-flex min-h-11 items-center text-sm underline"
                href={sessionHref(part.occurrenceId, 'coordinator')}
                data-testid="club-event-part-member-change-coach"
              >
                {t('activities.clubEvents.part.changeCoach')}
              </Link>
            ) : null
          }
        />
      ) : null}
      {!editing && groupPart ? (
        <MemberField
          prefix={id}
          field="coachPersonId"
          label={t('activities.fields.coach')}
          help={t('activities.clubEvents.part.fields.coach.help')}
          problem={problems.coachPersonId}
        >
          <Select
            value={draft.coachPersonId || NO_COACH}
            onValueChange={(value) => {
              update('coachPersonId', value === NO_COACH ? '' : value)
            }}
          >
            <SelectTrigger
              {...input('coachPersonId', true)}
              className="min-h-11 w-full"
              data-testid="club-event-part-member-coach"
            >
              <SelectValue placeholder={t('activities.fields.coach.placeholder')} />
            </SelectTrigger>
            <SelectContent>
              {(coaches.data ?? [{ value: NO_COACH, label: t('activities.fields.coach.none') }]).map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </MemberField>
      ) : null}
      {groupPart ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <MemberField
            prefix={id}
            field="gatheringMinutes"
            label={t('activities.fields.gatheringMinutesBefore')}
            help={t('activities.fields.gatheringMinutesBefore.help')}
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
              data-testid="club-event-part-member-gathering"
            />
          </MemberField>
          {deadlineShown ? (
            <MemberField
              prefix={id}
              field="confirmByHours"
              label={t('activities.fields.confirmByHoursBefore')}
              help={t('activities.fields.confirmByHoursBefore.help')}
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
                data-testid="club-event-part-member-confirm-by"
              />
            </MemberField>
          ) : null}
        </div>
      ) : null}
      <MemberField
        prefix={id}
        field="visitingTeamIds"
        label={t('activities.clubEvents.part.fields.teams')}
        help={t('activities.clubEvents.part.fields.teams.help')}
        problem={problems.visitingTeamIds}
      >
        <VisitingTeamsField
          id={`${id}-visitingTeamIds`}
          value={draft.visitingTeamIds}
          setValue={(value) => {
            update('visitingTeamIds', Array.isArray(value) ? (value as string[]) : [])
          }}
          t={t}
        />
      </MemberField>
      {conflicts ? <ConflictList conflicts={conflicts} linkSessions={false} /> : null}
      {!conflicts ? (
        <FormError error={error} offline={offline} pending={pending} onRetry={() => void submit()} t={t} />
      ) : null}
      <StickyActions
        submitLabel={t(editing ? 'activities.common.save' : 'activities.clubEvents.part.submitCreate')}
        savingLabel={t('activities.clubEvents.club.form.saving')}
        pending={pending}
        cancelHref={back}
        t={t}
      />
    </form>
  )
}

function PartBody({
  eventId,
  partId,
  timeZone,
  t,
}: {
  eventId: string
  partId: string | null
  timeZone: string
  t: Translate
}) {
  const copyOf = useSearchParams().get('copyOf')
  const stored = useClubEvent(eventId)
  const options = useClubEventOptions()
  if ((!stored.data && stored.isFetching) || (!options.data && options.isFetching)) {
    return <MemberSkeleton shape="fields" label={t('activities.clubEvents.loading')} />
  }
  const load = stored.data
  if (load?.status === 'not_found') {
    return (
      <Alert status="information" data-testid="club-event-part-member-not-found">
        <p>{t('activities.clubEvents.errors.notFound')}</p>
      </Alert>
    )
  }
  const event = load?.status === 'ok' ? load.event : null
  const part = event && partId ? (event.parts.find((entry) => entry.id === partId) ?? null) : null
  if (load?.status === 'denied' || (event && event.mayManage !== true) || (event && options.data === null)) {
    return (
      <Alert status="information" data-testid="club-event-part-member-denied">
        <p>{t('activities.clubEvents.club.form.denied')}</p>
      </Alert>
    )
  }
  if (event && (event.status !== 'planned' || (partId && (!part || part.status !== 'planned')))) {
    return (
      <Alert status="information" data-testid="club-event-part-member-closed">
        <p>
          {t(
            event.status !== 'planned'
              ? 'activities.clubEvents.cancelled.title'
              : 'activities.clubEvents.club.part.gone',
          )}
        </p>
      </Alert>
    )
  }
  if (!event || !options.data) {
    return (
      <ErrorMessage
        label={t('activities.clubEvents.errors.loadOne')}
        action={
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => {
              void stored.refetch()
              void options.refetch()
            }}
          >
            {t('activities.club.actions.retry')}
          </Button>
        }
      />
    )
  }
  const copy = !partId && copyOf ? (event.parts.find((entry) => entry.id === copyOf) ?? null) : null
  return (
    <>
      <p className="text-muted-foreground text-sm">{event.name}</p>
      <PartForm
        key={`${part?.updatedAt ?? 'new'}-${copy?.id ?? ''}`}
        event={event}
        options={options.data}
        part={part}
        copy={copy}
        timeZone={timeZone}
        t={t}
      />
    </>
  )
}

function PartContent({
  eventId,
  partId,
  timeZone,
  t,
}: {
  eventId: string
  partId: string | null
  timeZone: string
  t: Translate
}) {
  const copying = useSearchParams().get('copyOf') !== null
  return (
    <>
      <Link
        href={memberClubEventHref(eventId)}
        className="text-primary inline-flex min-h-11 items-center text-sm underline"
      >
        {t('activities.clubEvents.club.event.back')}
      </Link>
      <h1 className="text-2xl font-semibold">
        {t(
          partId
            ? 'activities.clubEvents.part.editTitle'
            : copying
              ? 'activities.clubEvents.part.copyTitle'
              : 'activities.clubEvents.part.createTitle',
        )}
      </h1>
      <PartBody eventId={eventId} partId={partId} timeZone={timeZone} t={t} />
    </>
  )
}

/** `/club/club-events/[id]/parts/new` (no part id, maybe `?copyOf=`) and `/club/club-events/[id]/parts/[partId]/edit`. */
export function ClubEventPartFormPage({ eventId, partId = null }: { eventId: string; partId?: string | null }) {
  const t = useT()
  return (
    <ActivitiesClubFrame skeleton="fields">
      {(profile) => <PartContent eventId={eventId} partId={partId} timeZone={profile.club.timezone} t={t} />}
    </ActivitiesClubFrame>
  )
}
