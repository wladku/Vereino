'use client'
// `/backend/activities/activities/create` and the "Details" tab of `/backend/activities/activities/[id]` (club spec
// J-002, UI row `/backend/activities/activities`): an activity of one group — a weekly series or a one-off — with its
// default place, coach and wall times. The "Preview" group lists the sessions and their conflicts before saving; a save
// that overbooks a place or a coach is refused with 409 and its conflict list is shown above the form. The group of an
// existing activity is fixed (the update body has no `groupId`).
import * as React from 'react'
import { useRouter } from 'next/navigation'
import { CrudForm, type CrudField, type CrudFieldOption, type CrudFormGroup } from '@open-mercato/ui/backend/CrudForm'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { createCrud, updateCrud } from '@open-mercato/ui/backend/utils/crud'
import { createCrudFormError } from '@open-mercato/ui/backend/utils/serverErrors'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { ACTIVITY_TYPES } from '../lib/activities-rules'
import { ConflictList } from './ConflictList'
import { PreviewPanel } from './PreviewPanel'
import { RecurrenceEditor } from './RecurrenceEditor'
import {
  activityToFormValues,
  buildActivityBody,
  type ActivityBody,
  type ActivityFormValues,
} from './activity-form-values'
import {
  ACTIVITIES_HREF,
  activityHref,
  errorMessage,
  fieldOfError,
  groupOptions,
  personOptions,
  placeOptions,
  scheduleConflictsOf,
  tolerant,
  type ActivityDetail,
  type ScheduleConflict,
  type Translate,
} from './client-helpers'
import { dateField, timeField } from './form-fields'

const ENTITY_ID = 'activities:activity'

type FieldsOptions = { editing: boolean; coachSeed: CrudFieldOption[]; activityId?: string }

function useActivityFields(t: Translate, { editing, coachSeed, activityId }: FieldsOptions) {
  const fields = React.useMemo<CrudField[]>(
    () => [
      {
        id: 'groupId',
        label: t('activities.fields.group'),
        type: 'select',
        loadOptions: () => groupOptions(!editing),
        required: true,
        disabled: editing,
        description: editing ? t('activities.fields.group.fixed') : undefined,
      },
      { id: 'name', label: t('activities.fields.name'), type: 'text', required: true, maxLength: 200 },
      {
        id: 'type',
        label: t('activities.fields.type'),
        type: 'select',
        options: ACTIVITY_TYPES.map((type) => ({ value: type, label: t(`activities.types.${type}`) })),
        description: t('activities.fields.type.help'),
        required: true,
      },
      {
        id: 'placeId',
        label: t('activities.fields.place'),
        type: 'select',
        loadOptions: tolerant(placeOptions),
        description: t('activities.fields.place.help'),
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
      { id: 'description', label: t('activities.fields.description'), type: 'textarea', maxLength: 4000 },
      { id: 'isActive', label: t('activities.fields.isActive'), type: 'checkbox' },
      dateField('startsOn', t('activities.fields.startsOn'), { required: true, layout: 'half' }),
      dateField('endsOn', t('activities.fields.endsOn'), {
        layout: 'half',
        visibleWhen: { field: 'repeat', equals: 'weekly' },
        description: t('activities.fields.endsOn.help'),
      }),
      timeField('startTime', t('activities.fields.startTime'), { required: true, layout: 'half' }),
      timeField('endTime', t('activities.fields.endTime'), { required: true, layout: 'half' }),
    ],
    [t, editing, coachSeed],
  )
  const groups = React.useMemo<CrudFormGroup[]>(
    () => [
      {
        id: 'basics',
        title: t('activities.form.groups.basics'),
        column: 1,
        fields: ['groupId', 'name', 'type', 'placeId', 'coachPersonId', 'description', 'isActive'],
      },
      {
        id: 'dates',
        title: t('activities.form.groups.dates'),
        column: 2,
        fields: ['startsOn', 'endsOn', 'startTime', 'endTime'],
      },
      {
        id: 'recurrence',
        title: t('activities.form.groups.recurrence'),
        column: 2,
        component: (ctx) => <RecurrenceEditor {...ctx} />,
      },
      {
        id: 'preview',
        title: t('activities.form.groups.preview'),
        column: 1,
        component: (ctx) => <PreviewPanel values={ctx.values} activityId={activityId} />,
      },
    ],
    [t, activityId],
  )
  return { fields, groups }
}

/**
 * Turns a refused save into what the form shows: the conflict list of a 409 goes above the form, a coded 422 to its
 * field. Other errors (the optimistic-lock 409 among them) are passed on unchanged for the form's own handling.
 */
function saveError(error: unknown, t: Translate, onConflicts: (conflicts: ScheduleConflict[]) => void): unknown {
  const conflicts = scheduleConflictsOf(error)
  if (conflicts) {
    onConflicts(conflicts)
    return createCrudFormError(errorMessage(error, t('activities.conflicts.title')))
  }
  const field = fieldOfError(error)
  if (field) {
    const message = errorMessage(error, t('activities.form.errors.invalid'))
    return createCrudFormError(message, { [field]: message })
  }
  return error
}

function validated(values: ActivityFormValues, t: Translate) {
  const built = buildActivityBody(values, t)
  if (!built.ok) throw createCrudFormError(built.message, built.fieldErrors)
  return built.body
}

export function ActivityCreateForm() {
  const t = useT()
  const router = useRouter()
  const [conflicts, setConflicts] = React.useState<ScheduleConflict[] | null>(null)
  const coachSeed = React.useMemo<CrudFieldOption[]>(() => [], [])
  const { fields, groups } = useActivityFields(t, { editing: false, coachSeed })
  const initialValues = React.useMemo(() => activityToFormValues(null), [])
  return (
    <CrudForm<ActivityFormValues>
      title={t('activities.activities.create.title')}
      titleHeadingLevel={1}
      backHref={ACTIVITIES_HREF}
      cancelHref={ACTIVITIES_HREF}
      entityId={ENTITY_ID}
      fields={fields}
      groups={groups}
      initialValues={initialValues}
      submitLabel={t('activities.common.create')}
      contentHeader={conflicts ? <ConflictList conflicts={conflicts} /> : null}
      onSubmit={async (values) => {
        const body = validated(values, t)
        try {
          const created = await createCrud<{ id?: string; sessionsCreated?: number }>('activities/activities', body)
          setConflicts(null)
          flash(t('activities.activities.flash.created', { count: created.result?.sessionsCreated ?? 0 }), 'success')
          router.push(created.result?.id ? activityHref(created.result.id) : ACTIVITIES_HREF)
        } catch (error: unknown) {
          throw saveError(error, t, setConflicts)
        }
      }}
    />
  )
}

type UpdateResult = { sessions?: { created?: number; updated?: number; removed?: number } }

export function ActivityDetailsForm({ activity, onSaved }: { activity: ActivityDetail; onSaved: () => Promise<void> }) {
  const t = useT()
  const [conflicts, setConflicts] = React.useState<ScheduleConflict[] | null>(null)
  const coachSeed = React.useMemo<CrudFieldOption[]>(
    () =>
      activity.coachPersonId
        ? [{ value: activity.coachPersonId, label: activity.coachName ?? t('activities.common.unknownPerson') }]
        : [],
    [activity.coachPersonId, activity.coachName, t],
  )
  const { fields, groups } = useActivityFields(t, { editing: true, coachSeed, activityId: activity.id })
  const initialValues = React.useMemo(() => ({ ...activityToFormValues(activity), id: activity.id }), [activity])
  return (
    <CrudForm<ActivityFormValues>
      key={activity.updatedAt ?? activity.id}
      embedded
      entityId={ENTITY_ID}
      fields={fields}
      groups={groups}
      initialValues={initialValues}
      submitLabel={t('activities.common.save')}
      contentHeader={conflicts ? <ConflictList conflicts={conflicts} /> : null}
      onSubmit={async (values) => {
        const body: Partial<ActivityBody> = validated(values, t)
        // The group of an activity is fixed: the update body has no `groupId`.
        delete body.groupId
        try {
          const saved = await updateCrud<UpdateResult>('activities/activities', { id: activity.id, ...body })
          setConflicts(null)
          const sessions = saved.result?.sessions
          flash(
            t('activities.activities.flash.saved', {
              created: sessions?.created ?? 0,
              updated: sessions?.updated ?? 0,
              removed: sessions?.removed ?? 0,
            }),
            'success',
          )
          await onSaved()
        } catch (error: unknown) {
          throw saveError(error, t, setConflicts)
        }
      }}
    />
  )
}
