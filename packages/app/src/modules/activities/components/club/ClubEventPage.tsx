'use client'
// `/club/events/new` — a coach creates a one-off event for their own group from the phone (club spec REQ-027, AC-027,
// *UI architecture* "New event"; #140): the group (only the groups they coach), the type (tournament or other), the
// name, the place (a bookable leaf), the date with its start and end in the club's time zone, the invited external
// teams of a tournament and a note. The options come from `GET /api/activities/events/options`; `POST
// /api/activities/events` creates the event and its session, and the page opens the session as the coach. A conflict
// (409) lists the colliding entries in the page and saves nothing — there is no "save anyway"; 403 (a group the coach
// does not coach) and the coded 422 refusals point at their field. The submit bar stays above the bottom navigation.
// `ClubEventForm` takes proposed values, so the facility calendar's "Book for group" (phase 5) can reuse it.
import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { apiCall } from '@open-mercato/ui/backend/utils/apiCall'
import { Alert } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import { Checkbox } from '@open-mercato/ui/primitives/checkbox'
import { Input } from '@open-mercato/ui/primitives/input'
import { Label } from '@open-mercato/ui/primitives/label'
import { Radio, RadioGroup } from '@open-mercato/ui/primitives/radio'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { Textarea } from '@open-mercato/ui/primitives/textarea'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { calendarDateInZone, isCalendarDate } from '@vereino/core'
import { EVENT_TYPES } from '../../lib/activities-rules'
import {
  EVENT_NAME_MAX,
  EVENT_NOTE_MAX,
  eventDraftProblems,
  eventFieldOfError,
  eventRequestBody,
  type EventDraft,
  type EventDraftField,
  type EventDraftProblem,
  type EventGroupOption,
  type EventPlaceOption,
} from '../../lib/member-event'
import { ConflictList } from '../ConflictList'
import { OWN_FORBIDDEN_STATE, externalTeamOptions, type ScheduleConflict } from '../client-helpers'
import { ActivitiesClubFrame } from './ActivitiesClubFrame'
import { CALENDAR_QUERY_KEY, CLUB_CALENDAR_HREF, sessionHref, type ClubProfile, type Translate } from './club-client'

export const EVENT_OPTIONS_QUERY_KEY = ['activities-event-options'] as const

type EventOptions = { groups: EventGroupOption[]; places: EventPlaceOption[] }
type TeamOption = { value: string; label: string }

function useEventOptions() {
  return useQuery({
    queryKey: EVENT_OPTIONS_QUERY_KEY,
    queryFn: async (): Promise<EventOptions> => {
      const call = await apiCall<EventOptions>('/api/activities/events/options', OWN_FORBIDDEN_STATE)
      if (!call.ok || !call.result) throw new Error(String(call.status))
      return call.result
    },
  })
}

/** The external teams a tournament may invite (`/api/groups/external-teams`, readable by a coach); none on a failure. */
function useTeamOptions(enabled: boolean) {
  return useQuery({
    queryKey: ['activities-event-teams'],
    queryFn: (): Promise<TeamOption[]> => externalTeamOptions().catch(() => []),
    enabled,
  })
}

export type ProposedEvent = { date?: string | null; placeId?: string | null; groupId?: string | null }

type CreateAnswer = { occurrenceId?: string; code?: string; error?: string; field?: string; conflicts?: unknown }

const PROBLEM_KEYS: Record<EventDraftProblem, string> = {
  required: 'activities.club.event.problems.required',
  invalid: 'activities.club.event.problems.invalid',
  endBeforeStart: 'activities.club.event.problems.endBeforeStart',
}

function FieldProblem({ id, text }: { id: string; text: string | undefined }) {
  if (!text) return null
  return (
    <p id={id} className="text-destructive text-sm" data-testid="club-event-problem">
      {text}
    </p>
  )
}

export function ClubEventForm({
  options,
  timeZone,
  proposed = {},
  cancelHref = CLUB_CALENDAR_HREF,
}: {
  options: EventOptions
  timeZone: string
  proposed?: ProposedEvent
  cancelHref?: string
}) {
  const t = useT()
  const router = useRouter()
  const queryClient = useQueryClient()
  const id = React.useId()
  const { groups, places } = options
  const known = (list: readonly { id: string }[], value: string | null | undefined) =>
    value && list.some((entry) => entry.id === value) ? value : ''
  const [draft, setDraft] = React.useState<EventDraft>(() => ({
    groupId: known(groups, proposed.groupId) || (groups.length === 1 ? groups[0].id : ''),
    type: 'tournament',
    name: '',
    placeId: known(places, proposed.placeId),
    date: proposed.date && isCalendarDate(proposed.date) ? proposed.date : calendarDateInZone(new Date(), timeZone),
    startTime: '',
    endTime: '',
    invitedExternalTeamIds: [],
    description: '',
  }))
  const [problems, setProblems] = React.useState<Partial<Record<EventDraftField, string>>>({})
  const [conflicts, setConflicts] = React.useState<ScheduleConflict[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)
  const teams = useTeamOptions(draft.type === 'tournament')

  if (groups.length === 0) {
    return (
      <Alert status="information" data-testid="club-event-no-groups">
        <p className="max-w-prose">{t('activities.club.event.noGroups')}</p>
      </Alert>
    )
  }

  const update = <K extends keyof EventDraft>(key: K, value: EventDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }))
    setProblems((current) => ({ ...current, [key]: undefined }))
  }

  const describedBy = (field: EventDraftField) => (problems[field] ? `${id}-${field}-problem` : undefined)
  const invalid = (field: EventDraftField) => (problems[field] ? true : undefined)
  // The control each field's problem belongs to, in reading order; the first one with a problem takes the focus.
  const controlIds: Record<EventDraftField, string> = {
    groupId: `${id}-group`,
    type: `${id}-type-${draft.type === 'other' ? 'other' : 'tournament'}`,
    name: `${id}-name`,
    placeId: `${id}-place`,
    date: `${id}-date`,
    startTime: `${id}-start`,
    endTime: `${id}-end`,
  }
  const showProblems = (next: Partial<Record<EventDraftField, string>>) => {
    setProblems(next)
    const first = (Object.keys(controlIds) as EventDraftField[]).find((field) => next[field])
    if (first) window.setTimeout(() => document.getElementById(controlIds[first])?.focus(), 0)
  }

  const submit = async () => {
    const found = eventDraftProblems(draft)
    const fields = Object.keys(found) as EventDraftField[]
    if (fields.length > 0) {
      showProblems(
        Object.fromEntries(fields.map((field) => [field, t(PROBLEM_KEYS[found[field] as EventDraftProblem])])),
      )
      setError(t('activities.club.event.errors.fix'))
      return
    }
    setPending(true)
    setError(null)
    setConflicts(null)
    let call: Awaited<ReturnType<typeof apiCall<CreateAnswer>>>
    try {
      call = await apiCall<CreateAnswer>('/api/activities/events', {
        method: 'POST',
        headers: { ...(OWN_FORBIDDEN_STATE.headers as Record<string, string>), 'content-type': 'application/json' },
        body: JSON.stringify(eventRequestBody(draft, timeZone)),
      })
    } catch {
      setPending(false)
      setError(t('activities.club.event.errors.create'))
      return
    }
    const answer = call.result ?? {}
    if (call.ok && answer.occurrenceId) {
      await queryClient.invalidateQueries({ queryKey: [CALENDAR_QUERY_KEY] })
      flash(t('activities.club.event.created'), 'success')
      router.push(sessionHref(answer.occurrenceId, 'coach'))
      return
    }
    setPending(false)
    const code = typeof answer.code === 'string' ? answer.code : null
    if (call.status === 409 && Array.isArray(answer.conflicts)) {
      setConflicts(answer.conflicts as ScheduleConflict[])
      setError(t('activities.club.event.errors.conflict'))
      return
    }
    if (call.status === 403) {
      showProblems({ groupId: t('activities.events.errors.denied') })
      setError(t('activities.events.errors.denied'))
      return
    }
    // A place removed since the form loaded answers 404; a 400 carries the platform's English "Validation failed".
    if (call.status === 404) {
      showProblems({ placeId: t('activities.club.event.problems.invalid') })
      setError(t('activities.club.event.errors.create'))
      return
    }
    const message = call.status === 422 && typeof answer.error === 'string' && answer.error ? answer.error : null
    const field = call.status === 422 ? eventFieldOfError(code, answer.field) : null
    if (field) showProblems({ [field]: message ?? t('activities.club.event.problems.invalid') })
    setError(message ?? t('activities.club.event.errors.create'))
  }

  const teamList = teams.data ?? []

  return (
    <form
      className="flex flex-col gap-4"
      data-testid="club-event-form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${id}-group`}>{t('activities.fields.group')}</Label>
        <Select
          value={draft.groupId}
          onValueChange={(value) => {
            update('groupId', value)
          }}
        >
          <SelectTrigger
            id={`${id}-group`}
            className="min-h-11 w-full sm:w-96"
            aria-invalid={invalid('groupId')}
            aria-describedby={describedBy('groupId')}
            data-testid="club-event-group"
          >
            <SelectValue placeholder={t('activities.club.event.chooseGroup')} />
          </SelectTrigger>
          <SelectContent>
            {groups.map((group) => (
              <SelectItem key={group.id} value={group.id}>
                {group.sectionName ? `${group.name} · ${group.sectionName}` : group.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldProblem id={`${id}-groupId-problem`} text={problems.groupId} />
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend id={`${id}-type`} className="mb-1 text-sm font-medium">
          {t('activities.fields.type')}
        </legend>
        <RadioGroup
          aria-labelledby={`${id}-type`}
          aria-describedby={describedBy('type')}
          aria-invalid={invalid('type')}
          className="flex flex-col gap-2 sm:flex-row"
          value={draft.type}
          onValueChange={(value) => {
            update('type', value)
          }}
        >
          {EVENT_TYPES.map((type) => (
            <label
              key={type}
              htmlFor={`${id}-type-${type}`}
              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3 py-2"
              data-testid={`club-event-type-${type}`}
            >
              <Radio id={`${id}-type-${type}`} value={type} />
              <span className="text-sm font-medium">{t(`activities.types.${type}`)}</span>
            </label>
          ))}
        </RadioGroup>
        <FieldProblem id={`${id}-type-problem`} text={problems.type} />
      </fieldset>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${id}-name`}>{t('activities.fields.name')}</Label>
        <Input
          id={`${id}-name`}
          className="min-h-11"
          value={draft.name}
          maxLength={EVENT_NAME_MAX}
          aria-invalid={invalid('name')}
          aria-describedby={describedBy('name')}
          onChange={(event) => {
            update('name', event.target.value)
          }}
          data-testid="club-event-name"
        />
        <FieldProblem id={`${id}-name-problem`} text={problems.name} />
      </div>
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
            data-testid="club-event-place"
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
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">{t('activities.events.groups.when')}</legend>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
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
              data-testid="club-event-date"
            />
            <FieldProblem id={`${id}-date-problem`} text={problems.date} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${id}-start`}>{t('activities.fields.startTime')}</Label>
            <Input
              id={`${id}-start`}
              type="time"
              className="min-h-11"
              value={draft.startTime}
              aria-invalid={invalid('startTime')}
              aria-describedby={describedBy('startTime')}
              onChange={(event) => {
                update('startTime', event.target.value)
              }}
              data-testid="club-event-start"
            />
            <FieldProblem id={`${id}-startTime-problem`} text={problems.startTime} />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`${id}-end`}>{t('activities.fields.endTime')}</Label>
            <Input
              id={`${id}-end`}
              type="time"
              className="min-h-11"
              value={draft.endTime}
              aria-invalid={invalid('endTime')}
              aria-describedby={describedBy('endTime')}
              onChange={(event) => {
                update('endTime', event.target.value)
              }}
              data-testid="club-event-end"
            />
            <FieldProblem id={`${id}-endTime-problem`} text={problems.endTime} />
          </div>
        </div>
        <p className="text-muted-foreground text-sm">{t('activities.club.event.zone', { zone: timeZone })}</p>
      </fieldset>
      {draft.type === 'tournament' && teamList.length > 0 ? (
        <fieldset className="flex flex-col gap-2" data-testid="club-event-teams">
          <legend className="mb-1 text-sm font-medium">{t('activities.events.fields.invitedTeams')}</legend>
          <p className="text-muted-foreground text-sm">{t('activities.events.fields.invitedTeams.help')}</p>
          {teamList.map((team) => {
            const checkboxId = `${id}-team-${team.value}`
            const checked = draft.invitedExternalTeamIds.includes(team.value)
            return (
              <label
                key={team.value}
                htmlFor={checkboxId}
                className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border px-3 py-2"
              >
                <Checkbox
                  id={checkboxId}
                  checked={checked}
                  onCheckedChange={(value) => {
                    update(
                      'invitedExternalTeamIds',
                      value === true
                        ? [...draft.invitedExternalTeamIds, team.value]
                        : draft.invitedExternalTeamIds.filter((teamId) => teamId !== team.value),
                    )
                  }}
                />
                <span className="text-sm break-words">{team.label}</span>
              </label>
            )
          })}
        </fieldset>
      ) : null}
      <div className="flex flex-col gap-1">
        <Label htmlFor={`${id}-note`}>{t('activities.club.event.note')}</Label>
        <Textarea
          id={`${id}-note`}
          className="min-h-24"
          value={draft.description}
          maxLength={EVENT_NOTE_MAX}
          onChange={(event) => {
            update('description', event.target.value)
          }}
          data-testid="club-event-note"
        />
      </div>
      {conflicts ? <ConflictList conflicts={conflicts} linkSessions={false} /> : null}
      {error && !conflicts ? (
        <Alert status="error" data-testid="club-event-error">
          <p>{error}</p>
        </Alert>
      ) : null}
      {/* On a phone the submit stays in view above the fixed bottom navigation (as the attendance list's bar). */}
      <div
        className="bg-background sticky bottom-24 z-30 -mx-4 flex flex-wrap gap-2 border-t px-4 py-3 sm:static sm:mx-0 sm:border-0 sm:p-0"
        data-testid="club-event-actions"
      >
        <Button type="submit" className="min-h-11" disabled={pending} data-testid="club-event-submit">
          {pending ? t('activities.club.event.saving') : t('activities.club.event.submit')}
        </Button>
        <Button asChild variant="outline" className="min-h-11">
          <Link href={cancelHref}>{t('activities.club.event.cancel')}</Link>
        </Button>
      </div>
    </form>
  )
}

function NewEvent({ profile, t }: { profile: ClubProfile; t: Translate }) {
  const searchParams = useSearchParams()
  const query = useEventOptions()
  let body: React.ReactNode
  if (!query.data && query.isFetching) {
    body = <LoadingMessage label={t('activities.club.event.loading')} />
  } else if (!query.data) {
    body = (
      <ErrorMessage
        label={t('activities.club.event.errors.load')}
        action={
          <Button type="button" variant="outline" className="min-h-11" onClick={() => void query.refetch()}>
            {t('activities.club.actions.retry')}
          </Button>
        }
      />
    )
  } else {
    body = (
      <ClubEventForm
        options={query.data}
        timeZone={profile.club.timezone}
        proposed={{
          date: searchParams.get('date'),
          placeId: searchParams.get('placeId'),
          groupId: searchParams.get('groupId'),
        }}
      />
    )
  }
  return (
    <>
      <Link href={CLUB_CALENDAR_HREF} className="text-primary inline-flex min-h-11 items-center text-sm underline">
        {t('activities.club.event.back')}
      </Link>
      <h1 className="text-2xl font-semibold">{t('activities.club.event.title')}</h1>
      <p className="text-muted-foreground max-w-prose text-sm">{t('activities.club.event.intro')}</p>
      {body}
    </>
  )
}

export function ClubEventPage() {
  const t = useT()
  return <ActivitiesClubFrame>{(profile) => <NewEvent profile={profile} t={t} />}</ActivitiesClubFrame>
}
