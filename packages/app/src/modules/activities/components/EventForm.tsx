'use client'
// `/backend/activities/events/create` — a one-off event (club spec glossary *One-off event*, REQ-027, TEST-034): a
// `tournament` or `other` event of one group with its own start and end (it may span several days, a weekend
// tournament), place, invited external teams and description. A coach creates it for their own group without the
// coordinator (another group → 403); a conflict is refused with 409 and its list is shown. After saving, the page of
// the event's session opens.
import * as React from 'react'
import { useRouter } from 'next/navigation'
import { CrudForm, type CrudField, type CrudFormGroup } from '@open-mercato/ui/backend/CrudForm'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { apiCallOrThrow } from '@open-mercato/ui/backend/utils/apiCall'
import { createCrudFormError } from '@open-mercato/ui/backend/utils/serverErrors'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { EVENT_TYPES } from '../lib/activities-rules'
import { ConflictList } from './ConflictList'
import {
  ACTIVITIES_HREF,
  errorMessage,
  errorStatus,
  externalTeamOptions,
  fieldOfError,
  groupOptions,
  localToday,
  occurrenceHref,
  placeOptions,
  scheduleConflictsOf,
  textOrNull,
  toInstant,
  tolerant,
  type ScheduleConflict,
} from './client-helpers'
import { dateField, timeField } from './form-fields'

type EventValues = Record<string, unknown> & {
  groupId?: string
  type?: string
  name?: string
  placeId?: string
  startDate?: string
  startTime?: string
  endDate?: string
  endTime?: string
  invitedExternalTeamIds?: string[]
  description?: string
}

export function EventCreateForm() {
  const t = useT()
  const router = useRouter()
  const [conflicts, setConflicts] = React.useState<ScheduleConflict[] | null>(null)
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
        id: 'placeId',
        label: t('activities.fields.place'),
        type: 'select',
        loadOptions: tolerant(placeOptions),
        description: t('activities.fields.place.help'),
        required: true,
      },
      dateField('startDate', t('activities.events.fields.startDate'), { required: true, layout: 'half' }),
      timeField('startTime', t('activities.fields.startTime'), { required: true, layout: 'half' }),
      dateField('endDate', t('activities.events.fields.endDate'), { required: true, layout: 'half' }),
      timeField('endTime', t('activities.fields.endTime'), { required: true, layout: 'half' }),
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
    [t],
  )
  const groups = React.useMemo<CrudFormGroup[]>(
    () => [
      {
        id: 'event',
        title: t('activities.events.groups.event'),
        column: 1,
        fields: ['groupId', 'type', 'name', 'placeId', 'description'],
      },
      {
        id: 'when',
        title: t('activities.events.groups.when'),
        column: 2,
        fields: ['startDate', 'startTime', 'endDate', 'endTime'],
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
    const today = localToday()
    return {
      groupId: '',
      type: 'tournament',
      name: '',
      placeId: '',
      startDate: today,
      startTime: '',
      endDate: today,
      endTime: '',
      invitedExternalTeamIds: [],
      description: '',
    }
  }, [])

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
                placeId: values.placeId,
                startsAt,
                endsAt,
                invitedExternalTeamIds: teams,
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
