'use client'
// The club event form (club events spec B-T2, REQ-T01, REQ-T05, REQ-T06; #378): `/backend/activities/club-events/create`
// and the Details tab of the record (B-T3). Name, the public address (slug; left empty, the server proposes it from
// the name), the section — the caller's sections, and "Whole club" for the administrator — the place picker with the
// external places marked and **Add place** (the `club_core` dialog drawn on the spot
// `vereino:activities:club-event-form:add-place`, so `activities` never imports `club_core`), the description, Public,
// and the default gathering time and deadline its new parts take. The edit sends the lock token (CrudForm), shows the
// collisions of a place change and names how many people the moved sessions told.
import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useQueryClient } from '@tanstack/react-query'
import { CrudForm, type CrudField, type CrudFormGroup } from '@open-mercato/ui/backend/CrudForm'
import { ErrorMessage, LoadingMessage } from '@open-mercato/ui/backend/detail'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { InjectionSpot } from '@open-mercato/ui/backend/injection/InjectionSpot'
import { createCrud, updateCrud } from '@open-mercato/ui/backend/utils/crud'
import { createCrudFormError } from '@open-mercato/ui/backend/utils/serverErrors'
import { Button } from '@open-mercato/ui/primitives/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { errorCodeOf } from '@vereino/core'
import { CLUB_EVENT_DESCRIPTION_MAX, CLUB_EVENT_NAME_MAX, CLUB_EVENT_SLUG_MAX } from '../lib/club-events'
import { MAX_GATHERING_MINUTES } from '../lib/gathering'
import { ConflictList } from './ConflictList'
import { CLUB_EVENT_ADD_PLACE_SPOT_ID } from './club-event-fields'
import {
  MAX_CONFIRM_BY_HOURS,
  errorMessage,
  errorStatus,
  scheduleConflictsOf,
  textOrNull,
  type ScheduleConflict,
  type Translate,
} from './client-helpers'
import {
  CLUB_EVENT_OPTIONS_QUERY_KEY,
  CLUB_EVENTS_HREF,
  WHOLE_CLUB,
  clubEventHref,
  clubEventOptionsOf,
  useClubEventOptions,
  type ClubEventDetail,
  type ClubEventOptions,
} from './club-events-client'

type ClubEventValues = Record<string, unknown> & {
  id?: string
  name?: string
  publicSlug?: string
  sectionId?: string
  placeId?: string
  description?: string
  isPublic?: boolean
  gatheringMinutesBefore?: string | number
  confirmByHoursBefore?: string | number
  updatedAt?: string | null
}

type AddedPlace = { id: string }

/** A whole number of `unit` in 1…max, null when empty, or 'invalid'. */
export function offsetValue(value: unknown, max: number): number | null | 'invalid' {
  const text = typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : ''
  if (!text) return null
  const number = Number(text)
  return Number.isInteger(number) && number >= 1 && number <= max ? number : 'invalid'
}

/** The place picker of the form: the club's bookable places with the external ones marked, and "Add place". */
function PlaceField({
  id,
  value,
  disabled,
  setValue,
  places,
  t,
}: {
  id: string
  value: unknown
  disabled?: boolean
  setValue: (value: unknown) => void
  places: ClubEventOptions['places']
  t: Translate
}) {
  const queryClient = useQueryClient()
  const [adding, setAdding] = React.useState(false)
  const select = async (placeId: string) => {
    await queryClient.invalidateQueries({ queryKey: CLUB_EVENT_OPTIONS_QUERY_KEY })
    setValue(placeId)
  }
  const current = typeof value === 'string' ? value : ''
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Select
          value={current || undefined}
          disabled={disabled}
          onValueChange={(next: string) => {
            setValue(next)
          }}
        >
          <SelectTrigger
            id={id}
            aria-labelledby={`${id}-label`}
            className="min-w-0 sm:flex-1"
            data-testid="club-event-place"
          >
            <SelectValue placeholder={t('activities.clubEvents.fields.place.placeholder')} />
          </SelectTrigger>
          <SelectContent>
            {places.map((place) => (
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
          disabled={disabled}
          data-testid="club-event-add-place"
          onClick={() => {
            setAdding(true)
          }}
        >
          {t('activities.clubEvents.actions.addPlace')}
        </Button>
      </div>
      {places.length === 0 ? (
        <p className="text-muted-foreground text-xs">{t('activities.clubEvents.place.empty')}</p>
      ) : null}
      <InjectionSpot
        spotId={CLUB_EVENT_ADD_PLACE_SPOT_ID}
        context={{
          open: adding,
          onOpenChange: setAdding,
          onAdded: (place: AddedPlace) => select(place.id),
          onPickExisting: (placeId: string) => select(placeId),
        }}
      />
    </div>
  )
}

const FIELD_OF_CODE = new Map<string, string>([
  ['club_event_slug_taken', 'publicSlug'],
  ['club_event_slug_invalid', 'publicSlug'],
  ['club_event_section_fixed', 'sectionId'],
  ['scope_denied', 'sectionId'],
  ['place_not_bookable', 'placeId'],
  ['club_event_open_part_needs_external_place', 'placeId'],
  ['event_place_closed', 'placeId'],
])

function useClubEventFields(t: Translate, options: ClubEventOptions, editing: boolean) {
  const fields = React.useMemo<CrudField[]>(
    () => [
      {
        id: 'name',
        label: t('activities.clubEvents.fields.name'),
        type: 'text',
        required: true,
        maxLength: CLUB_EVENT_NAME_MAX,
      },
      {
        id: 'publicSlug',
        label: t('activities.clubEvents.fields.slug'),
        type: 'text',
        maxLength: CLUB_EVENT_SLUG_MAX,
        description: t(
          editing ? 'activities.clubEvents.fields.slug.editHelp' : 'activities.clubEvents.fields.slug.help',
        ),
      },
      {
        id: 'sectionId',
        label: t('activities.clubEvents.fields.section'),
        type: 'select',
        required: true,
        options: [
          ...(options.wholeClub ? [{ value: WHOLE_CLUB, label: t('activities.clubEvents.section.wholeClub') }] : []),
          ...options.sections.map((section) => ({ value: section.id, label: section.name })),
        ],
        description: t('activities.clubEvents.fields.section.help'),
      },
      {
        id: 'placeId',
        label: t('activities.clubEvents.fields.place'),
        type: 'custom',
        required: true,
        description: t('activities.clubEvents.fields.place.help'),
        component: ({ id, value, disabled, setValue }) => (
          <PlaceField id={id} value={value} disabled={disabled} setValue={setValue} places={options.places} t={t} />
        ),
      },
      {
        id: 'description',
        label: t('activities.clubEvents.fields.description'),
        type: 'textarea',
        maxLength: CLUB_EVENT_DESCRIPTION_MAX,
      },
      {
        id: 'isPublic',
        label: t('activities.clubEvents.fields.isPublic'),
        type: 'checkbox',
        description: t('activities.clubEvents.fields.isPublic.help'),
      },
      {
        id: 'gatheringMinutesBefore',
        label: t('activities.fields.gatheringMinutesBefore'),
        type: 'number',
        layout: 'half',
        description: t('activities.clubEvents.fields.gathering.help'),
      },
      {
        id: 'confirmByHoursBefore',
        label: t('activities.fields.confirmByHoursBefore'),
        type: 'number',
        layout: 'half',
        description: t('activities.clubEvents.fields.confirmBy.help'),
      },
    ],
    [t, options, editing],
  )
  const groups = React.useMemo<CrudFormGroup[]>(
    () => [
      {
        id: 'event',
        title: t('activities.clubEvents.groups.event'),
        column: 1,
        fields: ['name', 'publicSlug', 'sectionId', 'placeId', 'description', 'isPublic'],
      },
      {
        id: 'defaults',
        title: t('activities.clubEvents.groups.defaults'),
        column: 2,
        fields: ['gatheringMinutesBefore', 'confirmByHoursBefore'],
      },
    ],
    [t],
  )
  return { fields, groups }
}

/** The request body of the form's values; throws the field problems the server would refuse anyway. */
function toPayload(t: Translate, values: ClubEventValues) {
  const gatheringMinutesBefore = offsetValue(values.gatheringMinutesBefore, MAX_GATHERING_MINUTES)
  if (gatheringMinutesBefore === 'invalid') {
    const message = t('activities.form.errors.gathering')
    throw createCrudFormError(message, { gatheringMinutesBefore: message })
  }
  const confirmByHours = offsetValue(values.confirmByHoursBefore, MAX_CONFIRM_BY_HOURS)
  if (confirmByHours === 'invalid') {
    const message = t('activities.form.errors.confirmBy')
    throw createCrudFormError(message, { confirmByHoursBefore: message })
  }
  const placeId = typeof values.placeId === 'string' ? values.placeId : ''
  if (!placeId) {
    const message = t('activities.form.errors.required')
    throw createCrudFormError(message, { placeId: message })
  }
  const slug = textOrNull(values.publicSlug)
  return {
    name: typeof values.name === 'string' ? values.name.trim() : '',
    ...(slug ? { publicSlug: slug } : {}),
    sectionId: values.sectionId === WHOLE_CLUB || !values.sectionId ? null : values.sectionId,
    placeId,
    description: textOrNull(values.description),
    isPublic: values.isPublic === true,
    gatheringMinutesBefore,
    confirmByMinutesBefore: confirmByHours === null ? null : confirmByHours * 60,
  }
}

/** Maps a refused save to the form: the collision list, or the message next to its field. */
function rethrow(t: Translate, error: unknown, setConflicts: (conflicts: ScheduleConflict[] | null) => void): never {
  const found = scheduleConflictsOf(error)
  if (found) {
    setConflicts(found)
    throw createCrudFormError(errorMessage(error, t('activities.conflicts.title')))
  }
  const code = errorCodeOf(error)
  const field = code ? FIELD_OF_CODE.get(code) : undefined
  if (field) {
    const message =
      code === 'scope_denied'
        ? t('activities.clubEvents.errors.sectionDenied')
        : errorMessage(error, t('activities.form.errors.invalid'))
    throw createCrudFormError(message, { [field]: message })
  }
  if (errorStatus(error) === 404) {
    const message = t('activities.clubEvents.errors.placeGone')
    throw createCrudFormError(message, { placeId: message })
  }
  throw error
}

function useOptionsGate(t: Translate) {
  const options = useClubEventOptions()
  if (options.isLoading) return { node: <LoadingMessage label={t('activities.clubEvents.loading')} />, options: null }
  const data = clubEventOptionsOf(options.data)
  if (options.error || !data) {
    return { node: <ErrorMessage label={t('activities.clubEvents.errors.options')} />, options: null }
  }
  return { node: null, options: data }
}

export function ClubEventCreateForm() {
  const t = useT()
  const gate = useOptionsGate(t)
  if (!gate.options) return gate.node
  return <ClubEventCreateFormInner options={gate.options} />
}

function ClubEventCreateFormInner({ options }: { options: ClubEventOptions }) {
  const t = useT()
  const router = useRouter()
  const [conflicts, setConflicts] = React.useState<ScheduleConflict[] | null>(null)
  const { fields, groups } = useClubEventFields(t, options, false)
  const initialValues = React.useMemo<ClubEventValues>(
    () => ({
      name: '',
      publicSlug: '',
      sectionId: options.wholeClub ? WHOLE_CLUB : (options.sections[0]?.id ?? ''),
      placeId: '',
      description: '',
      isPublic: false,
      gatheringMinutesBefore: '',
      confirmByHoursBefore: '',
    }),
    [options],
  )
  return (
    <CrudForm<ClubEventValues>
      title={t('activities.clubEvents.create.title')}
      titleHeadingLevel={1}
      backHref={CLUB_EVENTS_HREF}
      cancelHref={CLUB_EVENTS_HREF}
      fields={fields}
      groups={groups}
      initialValues={initialValues}
      submitLabel={t('activities.common.create')}
      contentHeader={conflicts ? <ConflictList conflicts={conflicts} /> : null}
      onSubmit={async (values) => {
        const payload = toPayload(t, values)
        let id: string | undefined
        try {
          const call = await createCrud<{ id?: string }>('activities/club-events', payload, {
            errorMessage: t('activities.clubEvents.errors.create'),
          })
          id = call.result?.id
        } catch (error: unknown) {
          rethrow(t, error, setConflicts)
        }
        flash(t('activities.clubEvents.flash.created'), 'success')
        router.push(id ? clubEventHref(id, 'parts') : CLUB_EVENTS_HREF)
      }}
    />
  )
}

/** The Details tab of the record (B-T3): the same form, editing the stored event. */
export function ClubEventDetailsForm({ event, onSaved }: { event: ClubEventDetail; onSaved: () => Promise<void> }) {
  const t = useT()
  const gate = useOptionsGate(t)
  const [conflicts, setConflicts] = React.useState<ScheduleConflict[] | null>(null)
  const initialValues = React.useMemo<ClubEventValues>(
    () => ({
      id: event.id,
      name: event.name ?? '',
      publicSlug: event.publicSlug ?? '',
      sectionId: event.sectionId ?? WHOLE_CLUB,
      placeId: event.placeId ?? '',
      description: event.description ?? '',
      isPublic: event.isPublic,
      gatheringMinutesBefore: event.gatheringMinutesBefore ?? '',
      confirmByHoursBefore: event.confirmByMinutesBefore === null ? '' : Math.round(event.confirmByMinutesBefore / 60),
      updatedAt: event.updatedAt,
    }),
    [event],
  )
  const options = gate.options
  // The section of a stored event is kept in the choices even when the caller could not pick it for a new one.
  const merged = React.useMemo<ClubEventOptions | null>(() => {
    if (!options) return null
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
  }, [options, event])
  const { fields, groups } = useClubEventFields(t, merged ?? EMPTY_OPTIONS, true)
  if (!merged) return gate.node
  return (
    <CrudForm<ClubEventValues>
      key={event.updatedAt ?? event.id}
      embedded
      fields={fields}
      groups={groups}
      initialValues={initialValues}
      submitLabel={t('activities.common.save')}
      contentHeader={conflicts ? <ConflictList conflicts={conflicts} /> : null}
      onSubmit={async (values) => {
        const payload = toPayload(t, values)
        let result: { sessionsMoved?: number; notified?: number } | null = null
        try {
          const call = await updateCrud<{ sessionsMoved?: number; notified?: number }>(
            'activities/club-events',
            { id: event.id, ...payload },
            { errorMessage: t('activities.clubEvents.errors.save') },
          )
          result = call.result
        } catch (error: unknown) {
          rethrow(t, error, setConflicts)
        }
        setConflicts(null)
        const moved = result?.sessionsMoved ?? 0
        flash(
          moved > 0
            ? t('activities.clubEvents.flash.savedMoved', { count: moved, notified: result?.notified ?? 0 })
            : t('activities.clubEvents.flash.saved'),
          'success',
        )
        await onSaved()
      }}
    />
  )
}

const EMPTY_OPTIONS: ClubEventOptions = {
  wholeClub: false,
  sections: [],
  groups: [],
  places: [],
  declarationKinds: {},
}
