'use client'
// `/backend/activities/activities/create` and the "Details" tab of `/backend/activities/activities/[id]` (club spec
// J-002, UI row `/backend/activities/activities`): an activity of one group — a weekly series or a one-off — with its
// default place, coach and wall times. The "Preview" group lists the sessions and their conflicts before saving; a save
// that overbooks a place or a coach is refused with 409 and its conflict list is shown above the form. The group of an
// existing activity is fixed (the update body has no `groupId`). The types follow the group's kind (README B-14, #93): a
// class group gets no match or sparring and reads its training as "Classes"; a match or a sparring takes an opponent;
// the coach picker lists only persons with an active coach or assistant role, plus "No coach". #268 (REQ-A04, README
// B-14): the group reads "Name (Section)" and is prefilled from `?groupId=`; the place select offers the club's own
// bookable places and, when there is none or they cannot be read, says so with a link to Places; the series end is
// entered once (the rule's "Last day"); a tournament takes invited teams; "Create" is enabled only once the last
// preview of the current values found no collision, and saving opens the sessions list scoped to the new activity.
import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { CrudForm, type CrudField, type CrudFieldOption, type CrudFormGroup } from '@open-mercato/ui/backend/CrudForm'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { createCrud, updateCrud } from '@open-mercato/ui/backend/utils/crud'
import { createCrudFormError } from '@open-mercato/ui/backend/utils/serverErrors'
import { Alert, AlertDescription } from '@open-mercato/ui/primitives/alert'
import { Button } from '@open-mercato/ui/primitives/button'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import {
  ACTIVITY_TYPES,
  takesOpponent,
  typeLabelKey,
  typesForGroupKind,
  type GroupKindLike,
} from '../lib/activities-rules'
import { ConflictList } from './ConflictList'
import { PreviewPanel, type PreviewGate } from './PreviewPanel'
import { perspectiveHref } from '../lib/occurrence-list'
import { RecurrenceEditor } from './RecurrenceEditor'
import {
  activityToFormValues,
  buildActivityBody,
  type ActivityBody,
  type ActivityFormValues,
} from './activity-form-values'
import {
  ACTIVITIES_HREF,
  OCCURRENCES_HREF,
  PLACES_HREF,
  coachOptions,
  errorMessage,
  externalTeamOptions,
  fieldOfError,
  groupKindOptions,
  placeOptions,
  scheduleConflictsOf,
  takesDeadline,
  tolerant,
  useDeclarationKinds,
  type ActivityDetail,
  type DeclarationKinds,
  type ScheduleConflict,
  type Translate,
} from './client-helpers'
import { dateField, timeField, useClubToday } from '@vereino/ui'

const ENTITY_ID = 'activities:activity'

type FieldsOptions = {
  editing: boolean
  coachSeed: CrudFieldOption[]
  activityId?: string
  /** Told whether the last preview of the current values found no collision (the create form's gate, #268). */
  onGate?: (gate: PreviewGate) => void
}

type GroupKinds = Record<string, GroupKindLike>

/** The kinds only when they changed, so a reloaded group list does not rebuild the fields. */
function mergeKinds(previous: GroupKinds, next: GroupKinds): GroupKinds {
  const keys = Object.keys(next)
  const same = keys.length === Object.keys(previous).length && keys.every((key) => previous[key] === next[key])
  return same ? previous : next
}

type TypeSelectProps = {
  id: string
  value: unknown
  disabled?: boolean
  values?: Record<string, unknown>
  setValue: (value: unknown) => void
  setFormValue?: (id: string, value: unknown) => void
  kinds: GroupKinds
  declarationKinds: DeclarationKinds | null
  t: Translate
}

/**
 * The type of the activity, offered per the group's kind (B-14). A type the newly chosen group does not take falls back
 * to `training`; until a group is chosen every type is listed (the server still answers 422 for a forged pair).
 */
function ActivityTypeSelect({
  id,
  value,
  disabled,
  values,
  setValue,
  setFormValue,
  kinds,
  declarationKinds,
  t,
}: TypeSelectProps) {
  const groupId = typeof values?.groupId === 'string' ? values.groupId : ''
  const kind = groupId ? (kinds[groupId] ?? null) : null
  const types = React.useMemo(() => (kind ? typesForGroupKind(kind) : [...ACTIVITY_TYPES]), [kind])
  const current = typeof value === 'string' ? value : ''
  const opponentShown = values?.takesOpponent === true
  const invitedShown = values?.isTournament === true
  const deadlineShown = values?.takesDeadline !== false
  React.useEffect(() => {
    if (current && !types.some((type) => type === current)) setValue('training')
  }, [current, types, setValue])
  // The opponent field is shown through `visibleWhen` on this derived value (a match or a sparring).
  React.useEffect(() => {
    if (opponentShown !== takesOpponent(current)) setFormValue?.('takesOpponent', takesOpponent(current))
  }, [current, opponentShown, setFormValue])
  // The declaration deadline is shown for a type of a `confirm` kind (REQ-A07).
  React.useEffect(() => {
    const takes = takesDeadline(declarationKinds, current)
    if (deadlineShown !== takes) setFormValue?.('takesDeadline', takes)
  }, [current, declarationKinds, deadlineShown, setFormValue])
  // The invited teams field is shown for a tournament (#268).
  React.useEffect(() => {
    if (invitedShown !== (current === 'tournament')) setFormValue?.('isTournament', current === 'tournament')
  }, [current, invitedShown, setFormValue])
  return (
    <Select
      value={current}
      onValueChange={(next) => {
        setValue(next)
      }}
      disabled={disabled}
    >
      <SelectTrigger id={id} aria-label={t('activities.fields.type')} data-testid="activities-type-select">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {types.map((type) => (
          <SelectItem key={type} value={type}>
            {t(typeLabelKey(type, kind))}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/**
 * The place of the activity (#268, REQ-A04): the club's own bookable places. A club with none, or a list that cannot be
 * read, gets an explanation with a link to Places in place of an empty select.
 */
function PlaceSelect({
  id,
  value,
  disabled,
  setValue,
  t,
}: {
  id: string
  value: unknown
  disabled?: boolean
  setValue: (value: unknown) => void
  t: Translate
}) {
  const query = useQuery({ queryKey: ['activities-own-places'], queryFn: () => placeOptions({ ownOnly: true }) })
  const current = typeof value === 'string' ? value : ''
  if (query.isLoading) {
    return <p className="text-muted-foreground text-sm">{t('activities.fields.place.loading')}</p>
  }
  const options = query.data ?? []
  if (query.error || options.length === 0) {
    return (
      <Alert status={query.error ? 'error' : 'warning'} data-testid="activities-place-empty">
        <AlertDescription className="flex flex-col items-start gap-2">
          <span>{t(query.error ? 'activities.fields.place.loadFailed' : 'activities.fields.place.none')}</span>
          <span className="flex flex-wrap gap-2">
            {query.error ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  void query.refetch()
                }}
              >
                {t('activities.common.retry')}
              </Button>
            ) : null}
            <Button asChild size="sm" variant="outline">
              <Link href={PLACES_HREF}>{t('activities.fields.place.openPlaces')}</Link>
            </Button>
          </span>
        </AlertDescription>
      </Alert>
    )
  }
  return (
    <Select
      value={current}
      onValueChange={(next) => {
        setValue(next)
      }}
      disabled={disabled}
    >
      <SelectTrigger id={id} aria-label={t('activities.fields.place')} data-testid="activities-place-select">
        <SelectValue placeholder={t('activities.fields.place.placeholder')} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function useActivityFields(t: Translate, { editing, coachSeed, activityId, onGate }: FieldsOptions) {
  const [kinds, setKinds] = React.useState<GroupKinds>({})
  const declarationKinds = useDeclarationKinds()
  const groupField = React.useMemo<CrudField>(
    () => ({
      id: 'groupId',
      label: t('activities.fields.group'),
      type: 'select',
      loadOptions: async () => {
        const loaded = await groupKindOptions(!editing)
        setKinds((previous) => mergeKinds(previous, loaded.kinds))
        return loaded.options
      },
      required: true,
      disabled: editing,
      description: editing ? t('activities.fields.group.fixed') : undefined,
    }),
    [t, editing],
  )
  const typeField = React.useMemo<CrudField>(
    () => ({
      id: 'type',
      label: t('activities.fields.type'),
      type: 'custom',
      description: t('activities.fields.type.help'),
      required: true,
      component: ({ id, value, disabled, values, setValue, setFormValue }) => (
        <ActivityTypeSelect
          id={id}
          value={value}
          disabled={disabled}
          values={values}
          setValue={setValue}
          setFormValue={setFormValue}
          kinds={kinds}
          declarationKinds={declarationKinds}
          t={t}
        />
      ),
    }),
    [t, kinds, declarationKinds],
  )
  const fields = React.useMemo<CrudField[]>(
    () => [
      groupField,
      { id: 'name', label: t('activities.fields.name'), type: 'text', required: true, maxLength: 200 },
      typeField,
      {
        id: 'opponentExternalTeamId',
        label: t('activities.fields.opponent'),
        type: 'select',
        loadOptions: tolerant(externalTeamOptions),
        description: t('activities.fields.opponent.help'),
        visibleWhen: { field: 'takesOpponent', equals: true },
      },
      {
        id: 'placeId',
        label: t('activities.fields.place'),
        type: 'custom',
        description: t('activities.fields.place.help'),
        required: true,
        component: ({ id, value, disabled, setValue }) => (
          <PlaceSelect id={id} value={value} disabled={disabled} setValue={setValue} t={t} />
        ),
      },
      {
        id: 'invitedExternalTeamIds',
        label: t('activities.events.fields.invitedTeams'),
        type: 'select',
        multiple: true,
        loadOptions: tolerant(externalTeamOptions),
        description: t('activities.events.fields.invitedTeams.help'),
        visibleWhen: { field: 'isTournament', equals: true },
      },
      {
        id: 'coachPersonId',
        label: t('activities.fields.coach'),
        type: 'combobox',
        placeholder: t('activities.fields.coach.placeholder'),
        description: t('activities.fields.coach.help'),
        loadOptions: (query?: string) => coachOptions(t, query),
        seedOptions: coachSeed,
        allowCustomValues: false,
      },
      { id: 'description', label: t('activities.fields.description'), type: 'textarea', maxLength: 4000 },
      { id: 'isActive', label: t('activities.fields.isActive'), type: 'checkbox' },
      {
        id: 'isAway',
        label: t('activities.fields.isAway'),
        type: 'checkbox',
        description: t('activities.fields.isAway.help'),
      },
      dateField('startsOn', t('activities.fields.startsOn'), { required: true, layout: 'half' }),
      timeField('startTime', t('activities.fields.startTime'), { required: true, layout: 'half' }),
      timeField('endTime', t('activities.fields.endTime'), { required: true, layout: 'half' }),
      {
        id: 'gatheringMinutesBefore',
        label: t('activities.fields.gatheringMinutesBefore'),
        type: 'number',
        layout: 'half',
        description: t('activities.fields.gatheringMinutesBefore.help'),
      },
      {
        id: 'confirmByHoursBefore',
        label: t('activities.fields.confirmByHoursBefore'),
        type: 'number',
        layout: 'half',
        description: t('activities.fields.confirmByHoursBefore.help'),
        visibleWhen: { field: 'takesDeadline', equals: true },
      },
    ],
    [t, coachSeed, groupField, typeField],
  )
  const groups = React.useMemo<CrudFormGroup[]>(
    () => [
      {
        id: 'basics',
        title: t('activities.form.groups.basics'),
        column: 1,
        fields: [
          'groupId',
          'name',
          'type',
          'opponentExternalTeamId',
          'invitedExternalTeamIds',
          'placeId',
          'coachPersonId',
          'description',
          'isActive',
          'isAway',
        ],
      },
      {
        id: 'dates',
        title: t('activities.form.groups.dates'),
        column: 2,
        fields: ['startsOn', 'startTime', 'endTime', 'gatheringMinutesBefore', 'confirmByHoursBefore'],
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
        component: (ctx) => <PreviewPanel values={ctx.values} activityId={activityId} onGate={onGate} />,
      },
    ],
    [t, activityId, onGate],
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

const CREATE_FORM_ID = 'activities-create-form'

/**
 * B-14 (#268, REQ-A04): "Create" stays disabled until the last preview of the current values found no collision
 * (`b.screenActivityCreate.previewFirst`); the form draws its own action bar, because the platform form's submit
 * button cannot be disabled from outside. A save that meets a collision appearing after the preview still answers 409
 * with the list; saving opens the sessions list scoped to the new activity.
 */
export function ActivityCreateForm() {
  const t = useT()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [conflicts, setConflicts] = React.useState<ScheduleConflict[] | null>(null)
  const [gate, setGate] = React.useState<PreviewGate>('none')
  const [pending, setPending] = React.useState(false)
  const coachSeed = React.useMemo<CrudFieldOption[]>(() => [], [])
  const today = useClubToday()
  const { fields, groups } = useActivityFields(t, { editing: false, coachSeed, onGate: setGate })
  // The group record's "New activity" link preselects its group (`?groupId=`).
  const prefillGroupId = searchParams.get('groupId') ?? ''
  const initialValues = React.useMemo(
    () => ({ ...activityToFormValues(null, today), groupId: prefillGroupId }),
    [today, prefillGroupId],
  )
  const ready = gate === 'clear'
  const hintId = 'activities-create-hint'
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t('activities.activities.create.title')}</h1>
        <p className="text-muted-foreground text-sm">{t('activities.activities.create.subtitle')}</p>
      </header>
      {conflicts ? <ConflictList conflicts={conflicts} /> : null}
      <CrudForm<ActivityFormValues>
        embedded
        hideFooterActions
        formId={CREATE_FORM_ID}
        entityId={ENTITY_ID}
        fields={fields}
        groups={groups}
        initialValues={initialValues}
        onSubmit={async (values) => {
          if (!ready) throw createCrudFormError(t('activities.activities.create.previewFirst'))
          const body = validated(values, t)
          setPending(true)
          try {
            const created = await createCrud<{ id?: string; sessionsCreated?: number }>('activities/activities', body)
            setConflicts(null)
            flash(t('activities.activities.flash.created', { count: created.result?.sessionsCreated ?? 0 }), 'success')
            router.push(
              created.result?.id ? perspectiveHref(OCCURRENCES_HREF, 'all', created.result.id) : ACTIVITIES_HREF,
            )
          } catch (error: unknown) {
            throw saveError(error, t, setConflicts)
          } finally {
            setPending(false)
          }
        }}
      />
      <div className="flex flex-wrap items-center justify-end gap-2" data-testid="activities-create-actions">
        {ready ? null : (
          <p id={hintId} className="text-muted-foreground mr-auto text-sm" data-testid="activities-create-hint">
            {t(
              gate === 'conflicts'
                ? 'activities.activities.create.resolveConflicts'
                : 'activities.activities.create.previewFirst',
            )}
          </p>
        )}
        <Button asChild variant="outline">
          <Link href={ACTIVITIES_HREF}>{t('activities.common.cancel')}</Link>
        </Button>
        <Button
          type="submit"
          form={CREATE_FORM_ID}
          disabled={!ready || pending}
          aria-describedby={ready ? undefined : hintId}
          data-testid="activities-create-submit"
        >
          {pending ? t('activities.common.saving') : t('activities.common.create')}
        </Button>
      </div>
    </div>
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
  const today = useClubToday()
  const initialValues = React.useMemo(
    () => ({ ...activityToFormValues(activity, today), id: activity.id }),
    [activity, today],
  )
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
