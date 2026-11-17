'use client'
// `/backend/activities/events/create` — a one-off event (club spec glossary *One-off event*, REQ-027, TEST-034; parity
// spec REQ-A08, #270): a `sparring` or `match` (a team), `tournament` or `other` event of one group with its own start
// and end (it may span several days, a weekend tournament), a club place or another address typed in (the "away" box
// ticks itself for another address and may be unticked, Q-A25), the opponent, the coach, the gathering time, the
// deadline, the invited external teams and a description. A coach creates it for their own group without the
// coordinator (another group → 403); a conflict is refused with 409 and its list is shown. After saving, the page of
// the event's session opens.
import * as React from 'react'
import { useRouter } from 'next/navigation'
import { CrudForm, type CrudField, type CrudFormGroup } from '@open-mercato/ui/backend/CrudForm'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { apiCallOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { createCrudFormError } from '@open-mercato/ui/backend/utils/serverErrors'
import { Radio, RadioGroup } from '@open-mercato/ui/primitives/radio'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { EVENT_TYPES, takesOpponent } from '../lib/activities-rules'
import { MAX_GATHERING_MINUTES } from '../lib/gathering'
import { locationProblems, locationVenue, type VenueMode } from '../lib/member-event'
import { VENUE_ADDRESS_MAX, VENUE_NAME_MAX } from '../lib/venue'
import { ConflictList } from './ConflictList'
import {
  ACTIVITIES_HREF,
  coachOptions,
  errorMessage,
  errorStatus,
  externalTeamOptions,
  fieldOfError,
  groupOptions,
  occurrenceHref,
  placeOptions,
  scheduleConflictsOf,
  takesDeadline,
  textOrNull,
  toInstant,
  tolerant,
  useDeclarationKinds,
  MAX_CONFIRM_BY_HOURS,
  type ScheduleConflict,
} from './client-helpers'
import { dateField, timeField, useClubToday } from '@vereino/ui'

type EventValues = Record<string, unknown> & {
  groupId?: string
  type?: string
  name?: string
  placeId?: string
  /** REQ-A08: a club place or another address typed in. */
  locationMode?: VenueMode
  venueName?: string
  venueAddress?: string
  opponentExternalTeamId?: string
  coachPersonId?: string
  isAway?: boolean
  /** The gathering time in minutes before the start (DD-43); empty = none. */
  gatheringMinutesBefore?: string | number
  startDate?: string
  startTime?: string
  endDate?: string
  endTime?: string
  invitedExternalTeamIds?: string[]
  /** The declaration deadline in hours before the start (REQ-A07); empty = none. */
  confirmByHoursBefore?: string | number
  description?: string
}

/** The deadline offset in minutes from the hours field, null when empty, or 'invalid' (whole hours 1–336, REQ-A07). */
function deadlineMinutes(value: unknown): number | null | 'invalid' {
  const text = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : ''
  if (!text) return null
  const hours = Number(text)
  return Number.isInteger(hours) && hours >= 1 && hours <= MAX_CONFIRM_BY_HOURS ? hours * 60 : 'invalid'
}

/** The gathering offset from the minutes field, null when empty, or 'invalid' (whole minutes 1–720, DD-43). */
function gatheringOffsetMinutes(value: unknown): number | null | 'invalid' {
  const text = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : ''
  if (!text) return null
  const minutes = Number(text)
  return Number.isInteger(minutes) && minutes >= 1 && minutes <= MAX_GATHERING_MINUTES ? minutes : 'invalid'
}

/**
 * "Club place / Other address" (REQ-A08). Switching to another address ticks "away" (Q-A25); the user may untick it.
 */
function LocationModeRadios({
  id,
  value,
  disabled,
  setValue,
  setFormValue,
  t,
}: {
  id: string
  value: unknown
  disabled?: boolean
  setValue: (value: unknown) => void
  setFormValue?: (id: string, value: unknown) => void
  t: ReturnType<typeof useT>
}) {
  const current: VenueMode = value === 'venue' ? 'venue' : 'place'
  return (
    <RadioGroup
      aria-labelledby={`${id}-label`}
      className="flex flex-col gap-2 sm:flex-row"
      value={current}
      disabled={disabled}
      onValueChange={(next) => {
        setValue(next)
        if (next === 'venue') setFormValue?.('isAway', true)
      }}
      data-testid="event-location-mode"
    >
      {(['place', 'venue'] as const).map((mode) => (
        <label key={mode} htmlFor={`${id}-${mode}`} className="flex min-h-9 cursor-pointer items-center gap-2">
          <Radio id={`${id}-${mode}`} value={mode} />
          <span className="text-sm">{t(`activities.venue.mode.${mode}`)}</span>
        </label>
      ))}
    </RadioGroup>
  )
}

export function EventCreateForm() {
  const t = useT()
  const today = useClubToday()
  const router = useRouter()
  const [conflicts, setConflicts] = React.useState<ScheduleConflict[] | null>(null)
  const declarationKinds = useDeclarationKinds()
  // REQ-A07: the deadline is offered when an event type of a `confirm` kind exists, and sent only for such a type.
  const showDeadline = EVENT_TYPES.some((type) => takesDeadline(declarationKinds, type))
  const fields = React.useMemo<CrudField[]>(
    () => [
      {
        id: 'groupId',
        label: t('activities.fields.group'),
        type: 'select',
        loadOptions: () => groupOptions(true),
        description: t('activities.events.fields.group.help'),
        required: true,
      },
      {
        id: 'type',
        label: t('activities.fields.type'),
        type: 'select',
        options: EVENT_TYPES.map((type) => ({ value: type, label: t(`activities.types.${type}`) })),
        required: true,
      },
      { id: 'name', label: t('activities.fields.name'), type: 'text', required: true, maxLength: 200 },
      {
        id: 'opponentExternalTeamId',
        label: t('activities.fields.opponent'),
        type: 'select',
        loadOptions: tolerant(externalTeamOptions),
        description: t('activities.venue.opponent.help'),
      },
      {
        id: 'locationMode',
        label: t('activities.venue.mode.label'),
        type: 'custom',
        component: ({ id, value, disabled, setValue, setFormValue }) => (
          <LocationModeRadios
            id={id}
            value={value}
            disabled={disabled}
            setValue={setValue}
            setFormValue={setFormValue}
            t={t}
          />
        ),
      },
      {
        id: 'placeId',
        label: t('activities.fields.place'),
        type: 'select',
        loadOptions: tolerant(placeOptions),
        description: t('activities.fields.place.help'),
        visibleWhen: { field: 'locationMode', equals: 'place' },
      },
      {
        id: 'venueName',
        label: t('activities.venue.name'),
        type: 'text',
        maxLength: VENUE_NAME_MAX,
        visibleWhen: { field: 'locationMode', equals: 'venue' },
      },
      {
        id: 'venueAddress',
        label: t('activities.venue.address'),
        type: 'text',
        maxLength: VENUE_ADDRESS_MAX,
        description: t('activities.venue.address.help'),
        visibleWhen: { field: 'locationMode', equals: 'venue' },
      },
      {
        id: 'isAway',
        label: t('activities.fields.isAway'),
        type: 'checkbox',
        description: t('activities.venue.isAway.help'),
      },
      {
        id: 'coachPersonId',
        label: t('activities.fields.coach'),
        type: 'combobox',
        placeholder: t('activities.fields.coach.placeholder'),
        description: t('activities.venue.coach.help'),
        loadOptions: (query?: string) => coachOptions(t, query),
        allowCustomValues: false,
      },
      dateField('startDate', t('activities.events.fields.startDate'), { required: true, layout: 'half' }),
      timeField('startTime', t('activities.fields.startTime'), { required: true, layout: 'half' }),
      dateField('endDate', t('activities.events.fields.endDate'), { required: true, layout: 'half' }),
      timeField('endTime', t('activities.fields.endTime'), { required: true, layout: 'half' }),
      {
        id: 'gatheringMinutesBefore',
        label: t('activities.fields.gatheringMinutesBefore'),
        type: 'number',
        layout: 'half',
        description: t('activities.fields.gatheringMinutesBefore.help'),
      },
      ...(showDeadline
        ? [
            {
              id: 'confirmByHoursBefore',
              label: t('activities.fields.confirmByHoursBefore'),
              type: 'number',
              layout: 'half',
              description: t('activities.fields.confirmByHoursBefore.help'),
            } satisfies CrudField,
          ]
        : []),
      {
        id: 'invitedExternalTeamIds',
        label: t('activities.events.fields.invitedTeams'),
        type: 'select',
        multiple: true,
        loadOptions: tolerant(externalTeamOptions),
        description: t('activities.events.fields.invitedTeams.help'),
      },
      { id: 'description', label: t('activities.fields.description'), type: 'textarea', maxLength: 4000 },
    ],
    [t, showDeadline],
  )
  const groups = React.useMemo<CrudFormGroup[]>(
    () => [
      {
        id: 'event',
        title: t('activities.events.groups.event'),
        column: 1,
        fields: [
          'groupId',
          'type',
          'name',
          'opponentExternalTeamId',
          'locationMode',
          'placeId',
          'venueName',
          'venueAddress',
          'isAway',
          'coachPersonId',
          'description',
        ],
      },
      {
        id: 'when',
        title: t('activities.events.groups.when'),
        column: 2,
        fields: ['startDate', 'startTime', 'endDate', 'endTime', 'gatheringMinutesBefore', 'confirmByHoursBefore'],
      },
      {
        id: 'teams',
        title: t('activities.events.groups.teams'),
        column: 2,
        fields: ['invitedExternalTeamIds'],
      },
    ],
    [t],
  )
  const initialValues = React.useMemo<EventValues>(() => {
    return {
      groupId: '',
      type: 'tournament',
      name: '',
      placeId: '',
      locationMode: 'place',
      venueName: '',
      venueAddress: '',
      opponentExternalTeamId: '',
      coachPersonId: '',
      isAway: false,
      gatheringMinutesBefore: '',
      startDate: today,
      startTime: '',
      endDate: today,
      endTime: '',
      invitedExternalTeamIds: [],
      confirmByHoursBefore: '',
      description: '',
    }
  }, [today])

  return (
    <CrudForm<EventValues>
      title={t('activities.events.create.title')}
      titleHeadingLevel={1}
      backHref={ACTIVITIES_HREF}
      cancelHref={ACTIVITIES_HREF}
      fields={fields}
      groups={groups}
      initialValues={initialValues}
      submitLabel={t('activities.common.create')}
      contentHeader={conflicts ? <ConflictList conflicts={conflicts} /> : null}
      onSubmit={async (values) => {
        const startsAt = toInstant(values.startDate, values.startTime)
        const endsAt = toInstant(values.endDate, values.endTime)
        if (!startsAt || !endsAt) {
          const message = t('activities.form.errors.required')
          throw createCrudFormError(message, {
            ...(startsAt ? {} : { startDate: message, startTime: message }),
            ...(endsAt ? {} : { endDate: message, endTime: message }),
          })
        }
        const confirmByMinutesBefore = takesDeadline(declarationKinds, values.type)
          ? deadlineMinutes(values.confirmByHoursBefore)
          : null
        if (confirmByMinutesBefore === 'invalid') {
          const message = t('activities.form.errors.confirmBy')
          throw createCrudFormError(message, { confirmByHoursBefore: message })
        }
        // REQ-A08: a club place or another address with a name and an address, checked before sending.
        const location = {
          venueMode: values.locationMode === 'venue' ? ('venue' as const) : ('place' as const),
          placeId: typeof values.placeId === 'string' ? values.placeId : '',
          venueName: typeof values.venueName === 'string' ? values.venueName : '',
          venueAddress: typeof values.venueAddress === 'string' ? values.venueAddress : '',
        }
        const locationFields = Object.keys(locationProblems(location))
        if (locationFields.length > 0) {
          const message = t('activities.venue.errors.location')
          throw createCrudFormError(message, Object.fromEntries(locationFields.map((field) => [field, message])))
        }
        const venue = locationVenue(location)
        const gatheringMinutesBefore = gatheringOffsetMinutes(values.gatheringMinutesBefore)
        if (gatheringMinutesBefore === 'invalid') {
          const message = t('activities.form.errors.gathering')
          throw createCrudFormError(message, { gatheringMinutesBefore: message })
        }
        const opponent =
          takesOpponent(values.type) && typeof values.opponentExternalTeamId === 'string'
            ? values.opponentExternalTeamId
            : ''
        const coach = typeof values.coachPersonId === 'string' ? values.coachPersonId : ''
        const teams = Array.isArray(values.invitedExternalTeamIds)
          ? values.invitedExternalTeamIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
          : []
        try {
          const call = await apiCallOrThrow<{ id?: string; occurrenceId?: string }>(
            '/api/activities/events',
            {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({
                groupId: values.groupId,
                type: values.type,
                name: typeof values.name === 'string' ? values.name.trim() : '',
                ...(venue ? { venue } : { placeId: location.placeId }),
                ...(opponent ? { opponentExternalTeamId: opponent } : {}),
                ...(coach ? { coachPersonId: coach } : {}),
                isAway: values.isAway === true,
                gatheringMinutesBefore,
                startsAt,
                endsAt,
                invitedExternalTeamIds: teams,
                confirmByMinutesBefore,
                description: textOrNull(values.description),
              }),
            },
            { errorMessage: t('activities.events.errors.create') },
          )
          setConflicts(null)
          flash(t('activities.events.flash.created'), 'success')
          const occurrenceId = call.result?.occurrenceId
          router.push(occurrenceId ? occurrenceHref(occurrenceId) : ACTIVITIES_HREF)
        } catch (error: unknown) {
          const found = scheduleConflictsOf(error)
          if (found) {
            setConflicts(found)
            throw createCrudFormError(errorMessage(error, t('activities.conflicts.title')))
          }
          if (errorStatus(error) === 403) {
            throw createCrudFormError(t('activities.events.errors.denied'), {
              groupId: t('activities.events.errors.denied'),
            })
          }
          const field = fieldOfError(error)
          if (field) {
            const message = errorMessage(error, t('activities.form.errors.invalid'))
            throw createCrudFormError(message, { [field]: message })
          }
          throw error
        }
      }}
    />
  )
}
