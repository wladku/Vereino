'use client'
// The part dialog of the club event record (club events spec B-T3 "Part dialog", REQ-T02, REQ-T04, REQ-T07; #378):
// title, day, start and end, the group or "No club group" (an open part), category, type (a class group takes neither
// a match nor a sparring), coach, gathering, deadline and the visiting teams — picked as chips from the club's
// external teams, or added in place with **Add team** (`POST /api/groups/external-teams`; `activities` reaches
// `groups` over HTTP only). A new part may be a copy (`?copyOf=`): everything but the day and the group. After
// creation the group and coach of a part with a group are fixed: its day and times change through **Move**, its coach
// through **Change coach** on the session record; an open part keeps its own times here. A collision is listed above
// the fields; the edit sends the part's lock token.
import * as React from 'react'
import Link from 'next/link'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CrudForm, type CrudField, type CrudFormGroup } from '@open-mercato/ui/backend/CrudForm'
import { flash } from '@open-mercato/ui/backend/FlashMessages'
import { apiCallOrThrow, withScopedApiRequestHeaders } from '@open-mercato/ui/backend/utils/apiCall'
import { createCrud, fetchCrudList } from '@open-mercato/ui/backend/utils/crud'
import { buildOptimisticLockHeader } from '@open-mercato/ui/backend/utils/optimisticLock'
import { createCrudFormError } from '@open-mercato/ui/backend/utils/serverErrors'
import { Button } from '@open-mercato/ui/primitives/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@open-mercato/ui/primitives/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@open-mercato/ui/primitives/select'
import { useT } from '@open-mercato/shared/lib/i18n/context'
import { errorCodeOf } from '@vereino/core'
import { InlineCreateDialog, dateField, timeField } from '@vereino/ui'
import { EVENT_TYPES, takesOpponent } from '../lib/activities-rules'
import { MAX_VISITING_TEAMS, PART_CATEGORY_MAX, PART_TITLE_MAX, minutesBefore } from '../lib/club-events'
import { MAX_GATHERING_MINUTES } from '../lib/gathering'
import { ConflictList } from './ConflictList'
import { offsetValue } from './ClubEventForm'
import {
  MAX_CONFIRM_BY_HOURS,
  NO_COACH,
  coachOptions,
  errorMessage,
  fieldOfError,
  instantDate,
  instantTime,
  occurrenceHref,
  scheduleConflictsOf,
  takesDeadline,
  textOrNull,
  timeRangeOfInstants,
  toInstant,
  type ScheduleConflict,
  type Translate,
} from './client-helpers'
import { NO_GROUP, type ClubEventDetail, type ClubEventOptions, type ClubEventPart } from './club-events-client'

type PartValues = Record<string, unknown> & {
  title?: string
  date?: string
  startTime?: string
  endTime?: string
  groupId?: string
  categoryLabel?: string
  type?: string
  coachPersonId?: string
  gatheringMinutesBefore?: string | number
  confirmByHoursBefore?: string | number
  visitingTeamIds?: string[]
}

/** What the dialog does: add a part (maybe a copy of `source`), or change `part`. */
export type PartDialogMode = { kind: 'create'; source?: ClubEventPart | null } | { kind: 'edit'; part: ClubEventPart }

type TeamOption = { value: string; label: string }

const EXTERNAL_TEAMS_QUERY_KEY = ['activities-club-event-external-teams']

function useExternalTeams() {
  return useQuery({
    queryKey: EXTERNAL_TEAMS_QUERY_KEY,
    queryFn: async (): Promise<TeamOption[]> => {
      const data = await fetchCrudList<{ id: string; name: string | null; clubName: string | null }>(
        'groups/external-teams',
        { pageSize: 100, sortField: 'name', sortDir: 'asc' },
      )
      return data.items.map((item) => ({
        value: item.id,
        label: item.clubName ? `${item.name ?? item.id} (${item.clubName})` : (item.name ?? item.id),
      }))
    },
  })
}

/** The visiting teams as chips, a picker of the remaining teams and **Add team**. */
function VisitingTeamsField({
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
  const queryClient = useQueryClient()
  const teams = useExternalTeams()
  const [adding, setAdding] = React.useState(false)
  const addRef = React.useRef<HTMLButtonElement | null>(null)
  const selected = Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
  const options = teams.data ?? []
  const labelOf = (teamId: string) => options.find((option) => option.value === teamId)?.label ?? teamId
  const remaining = options.filter((option) => !selected.includes(option.value))
  const full = selected.length >= MAX_VISITING_TEAMS
  return (
    <div className="flex flex-col gap-2">
      {selected.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label={t('activities.clubEvents.part.fields.teams')}>
          {selected.map((teamId) => (
            <li
              key={teamId}
              className="bg-muted flex items-center gap-1 rounded-full py-0.5 pr-1 pl-3 text-sm"
              data-testid="club-event-part-team"
            >
              <span>{labelOf(teamId)}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled}
                aria-label={t('activities.clubEvents.part.teams.remove', { name: labelOf(teamId) })}
                onClick={() => {
                  setValue(selected.filter((entry) => entry !== teamId))
                }}
              >
                ×
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">{t('activities.clubEvents.part.teams.none')}</p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Select
          value=""
          disabled={disabled || full || remaining.length === 0}
          onValueChange={(next: string) => {
            if (next) setValue([...selected, next])
          }}
        >
          <SelectTrigger id={id} className="min-w-0 sm:flex-1" data-testid="club-event-part-team-picker">
            <SelectValue placeholder={t('activities.clubEvents.part.teams.pick')} />
          </SelectTrigger>
          <SelectContent>
            {remaining.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          ref={addRef}
          type="button"
          variant="outline"
          disabled={disabled || full}
          data-testid="club-event-part-add-team"
          onClick={() => {
            setAdding(true)
          }}
        >
          {t('activities.clubEvents.part.teams.add')}
        </Button>
      </div>
      <InlineCreateDialog
        id="club-event-part-team-create"
        open={adding}
        onOpenChange={setAdding}
        title={t('activities.clubEvents.part.teams.createTitle')}
        description={t('activities.clubEvents.part.teams.createHelp')}
        fields={[
          {
            id: 'name',
            label: t('activities.clubEvents.part.teams.name'),
            type: 'text',
            required: true,
            maxLength: 200,
          },
          { id: 'clubName', label: t('activities.clubEvents.part.teams.clubName'), type: 'text', maxLength: 200 },
          { id: 'contact', label: t('activities.clubEvents.part.teams.contact'), type: 'text', maxLength: 1000 },
        ]}
        labels={{
          submit: t('activities.clubEvents.part.teams.submit'),
          saving: t('activities.clubEvents.part.teams.saving'),
          cancel: t('activities.common.cancel'),
          close: t('activities.common.close'),
          required: t('activities.form.errors.required'),
        }}
        returnFocusRef={addRef}
        onCreate={async (values) => {
          const call = await createCrud<{ id?: string }>('groups/external-teams', values, {
            errorMessage: t('activities.clubEvents.part.teams.createFailed'),
          })
          const teamId = call.result?.id
          if (!teamId) throw new Error(t('activities.clubEvents.part.teams.createFailed'))
          const label = values.clubName ? `${values.name} (${values.clubName})` : values.name
          return { value: teamId, label }
        }}
        onCreated={(option) => {
          queryClient.setQueryData<TeamOption[]>(EXTERNAL_TEAMS_QUERY_KEY, (current) => [
            ...(current ?? []).filter((entry) => entry.value !== option.value),
            { value: option.value, label: option.label },
          ])
          setValue([...selected.filter((entry) => entry !== option.value), option.value])
          void queryClient.invalidateQueries({ queryKey: EXTERNAL_TEAMS_QUERY_KEY })
        }}
        describeError={(error) => ({
          message: errorMessage(error, t('activities.clubEvents.part.teams.createFailed')),
        })}
        testId="club-event-part-team-create"
      />
    </div>
  )
}

/** The type picker: the one-off event types, without a match or a sparring for a class group (DD-T02). */
function TypeField({
  id,
  value,
  disabled,
  setValue,
  values,
  groups,
  t,
}: {
  id: string
  value: unknown
  disabled?: boolean
  setValue: (value: unknown) => void
  values?: Record<string, unknown>
  groups: ClubEventOptions['groups']
  t: Translate
}) {
  const groupId = typeof values?.groupId === 'string' ? values.groupId : ''
  const kind = groups.find((group) => group.id === groupId)?.kind ?? null
  const types = EVENT_TYPES.filter((type) => kind === 'team' || !takesOpponent(type))
  const current = typeof value === 'string' && types.includes(value as (typeof EVENT_TYPES)[number]) ? value : ''
  return (
    <Select
      value={current || undefined}
      disabled={disabled}
      onValueChange={(next: string) => {
        setValue(next)
      }}
    >
      <SelectTrigger id={id} aria-labelledby={`${id}-label`} data-testid="club-event-part-type">
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
  )
}

function ReadOnlyLine({ id, text, action }: { id: string; text: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <p id={id} className="text-sm">
        {text}
      </p>
      {action}
    </div>
  )
}

function initialValuesOf(mode: PartDialogMode, event: ClubEventDetail): PartValues {
  const source = mode.kind === 'edit' ? mode.part : (mode.source ?? null)
  const confirmMinutes = source
    ? source.kind === 'group'
      ? minutesBefore(source.confirmBy, source.startAt)
      : null
    : event.confirmByMinutesBefore
  const gathering = source
    ? source.kind === 'group'
      ? minutesBefore(source.gatheringAt, source.startAt)
      : null
    : event.gatheringMinutesBefore
  return {
    title: source?.title ?? '',
    // A copy takes everything but the day and the group (glossary *Copying a part*).
    date: mode.kind === 'edit' ? instantDate(source?.startAt) : '',
    startTime: instantTime(source?.startAt),
    endTime: instantTime(source?.endAt),
    groupId: mode.kind === 'edit' ? (mode.part.groupId ?? NO_GROUP) : '',
    categoryLabel: source?.categoryLabel ?? '',
    type: source?.type ?? 'tournament',
    coachPersonId: mode.kind === 'edit' ? (mode.part.coachPersonId ?? '') : '',
    gatheringMinutesBefore: gathering ?? '',
    confirmByHoursBefore: confirmMinutes === null ? '' : Math.round(confirmMinutes / 60),
    visitingTeamIds: source ? [...source.visitingTeamIds] : [],
  }
}

export function ClubEventPartDialog({
  event,
  options,
  mode,
  open,
  onOpenChange,
  onDone,
}: {
  event: ClubEventDetail
  options: ClubEventOptions
  mode: PartDialogMode
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone: () => Promise<void>
}) {
  const t = useT()
  const [conflicts, setConflicts] = React.useState<ScheduleConflict[] | null>(null)
  const editing = mode.kind === 'edit' ? mode.part : null
  const fixedTimes = editing?.kind === 'group'
  const groups = React.useMemo(
    () => options.groups.filter((group) => event.sectionId === null || group.sectionId === event.sectionId),
    [options.groups, event.sectionId],
  )
  const showDeadline = Object.values(options.declarationKinds).some((kind) => kind === 'confirm')

  const fields = React.useMemo<CrudField[]>(() => {
    const list: CrudField[] = [
      {
        id: 'title',
        label: t('activities.clubEvents.part.fields.title'),
        type: 'text',
        required: true,
        maxLength: PART_TITLE_MAX,
      },
    ]
    if (editing?.kind === 'group') {
      list.push({
        id: 'when',
        label: t('activities.clubEvents.part.fields.when'),
        type: 'custom',
        description: t('activities.clubEvents.part.fields.when.help'),
        component: ({ id }) => (
          <ReadOnlyLine
            id={id}
            text={`${instantDate(editing.startAt)} ${timeRangeOfInstants(editing.startAt, editing.endAt)}`}
          />
        ),
      })
    } else {
      list.push(
        dateField('date', t('activities.clubEvents.part.fields.day'), { required: true }),
        timeField('startTime', t('activities.fields.startTime'), { required: true, layout: 'half' }),
        timeField('endTime', t('activities.fields.endTime'), { required: true, layout: 'half' }),
      )
    }
    if (editing) {
      list.push({
        id: 'groupLine',
        label: t('activities.clubEvents.part.fields.group'),
        type: 'custom',
        component: ({ id }) => (
          <ReadOnlyLine
            id={id}
            text={
              editing.groupName
                ? `${editing.groupName}${editing.sectionName ? ` (${editing.sectionName})` : ''}`
                : t('activities.clubEvents.part.noGroup')
            }
          />
        ),
      })
    } else {
      list.push({
        id: 'groupId',
        label: t('activities.clubEvents.part.fields.group'),
        type: 'select',
        required: true,
        options: [
          ...groups.map((group) => ({
            value: group.id,
            label: group.sectionName ? `${group.name} (${group.sectionName})` : group.name,
          })),
          ...(event.placeExternal ? [{ value: NO_GROUP, label: t('activities.clubEvents.part.noGroup') }] : []),
        ],
        description: t(
          event.placeExternal
            ? 'activities.clubEvents.part.fields.group.help'
            : 'activities.clubEvents.part.fields.group.helpOwnPlace',
        ),
      })
    }
    list.push(
      {
        id: 'categoryLabel',
        label: t('activities.clubEvents.part.fields.category'),
        type: 'text',
        maxLength: PART_CATEGORY_MAX,
        description: t('activities.clubEvents.part.fields.category.help'),
      },
      {
        id: 'type',
        label: t('activities.fields.type'),
        type: 'custom',
        required: true,
        component: ({ id, value, disabled, setValue, values }) => (
          <TypeField
            id={id}
            value={value}
            disabled={disabled}
            setValue={setValue}
            values={values ?? (editing ? { groupId: editing.groupId ?? '' } : {})}
            groups={options.groups}
            t={t}
          />
        ),
      },
    )
    if (editing) {
      if (editing.kind === 'group' && editing.occurrenceId) {
        const occurrenceId = editing.occurrenceId
        list.push({
          id: 'coachLine',
          label: t('activities.fields.coach'),
          type: 'custom',
          component: ({ id }) => (
            <ReadOnlyLine
              id={id}
              text={editing.coachName ?? t('activities.clubEvents.part.noCoach')}
              action={
                <Link
                  className="text-sm underline underline-offset-4"
                  href={occurrenceHref(occurrenceId)}
                  data-testid="club-event-part-change-coach"
                >
                  {t('activities.clubEvents.part.changeCoach')}
                </Link>
              }
            />
          ),
        })
      }
    } else {
      list.push({
        id: 'coachPersonId',
        label: t('activities.fields.coach'),
        type: 'combobox',
        placeholder: t('activities.fields.coach.placeholder'),
        description: t('activities.clubEvents.part.fields.coach.help'),
        loadOptions: (query?: string) => coachOptions(t, query),
        allowCustomValues: false,
      })
    }
    if (!editing || editing.kind === 'group') {
      list.push({
        id: 'gatheringMinutesBefore',
        label: t('activities.fields.gatheringMinutesBefore'),
        type: 'number',
        layout: 'half',
        description: t('activities.fields.gatheringMinutesBefore.help'),
      })
      if (showDeadline) {
        list.push({
          id: 'confirmByHoursBefore',
          label: t('activities.fields.confirmByHoursBefore'),
          type: 'number',
          layout: 'half',
          description: t('activities.fields.confirmByHoursBefore.help'),
        })
      }
    }
    list.push({
      id: 'visitingTeamIds',
      label: t('activities.clubEvents.part.fields.teams'),
      type: 'custom',
      description: t('activities.clubEvents.part.fields.teams.help'),
      component: ({ id, value, disabled, setValue }) => (
        <VisitingTeamsField id={id} value={value} disabled={disabled} setValue={setValue} t={t} />
      ),
    })
    return list
  }, [t, editing, fixedTimes, groups, event.placeExternal, options.groups, showDeadline])

  const groupsLayout = React.useMemo<CrudFormGroup[]>(
    () => [{ id: 'part', column: 1, fields: fields.map((field) => field.id) }],
    [fields],
  )
  const initialValues = React.useMemo(() => initialValuesOf(mode, event), [mode, event])

  const submit = async (values: PartValues) => {
    const title = typeof values.title === 'string' ? values.title.trim() : ''
    const groupId = editing ? editing.groupId : values.groupId === NO_GROUP ? null : (values.groupId ?? '')
    const isGroupPart = editing ? editing.kind === 'group' : groupId !== null
    if (!editing && groupId === '') {
      const message = t('activities.form.errors.required')
      throw createCrudFormError(message, { groupId: message })
    }
    let startsAt: string | null = null
    let endsAt: string | null = null
    if (!fixedTimes) {
      startsAt = toInstant(values.date, values.startTime)
      endsAt = toInstant(values.date, values.endTime)
      if (!startsAt || !endsAt) {
        const message = t('activities.form.errors.required')
        throw createCrudFormError(message, {
          ...(startsAt ? {} : { date: message, startTime: message }),
          ...(endsAt ? {} : { endTime: message }),
        })
      }
    }
    const gathering = isGroupPart ? offsetValue(values.gatheringMinutesBefore, MAX_GATHERING_MINUTES) : null
    if (gathering === 'invalid') {
      const message = t('activities.form.errors.gathering')
      throw createCrudFormError(message, { gatheringMinutesBefore: message })
    }
    const confirmHours =
      isGroupPart && takesDeadline(options.declarationKinds, values.type)
        ? offsetValue(values.confirmByHoursBefore, MAX_CONFIRM_BY_HOURS)
        : null
    if (confirmHours === 'invalid') {
      const message = t('activities.form.errors.confirmBy')
      throw createCrudFormError(message, { confirmByHoursBefore: message })
    }
    const teams = Array.isArray(values.visitingTeamIds)
      ? values.visitingTeamIds.filter((id): id is string => typeof id === 'string' && id.length > 0)
      : []
    const common = {
      title,
      categoryLabel: textOrNull(values.categoryLabel),
      type: typeof values.type === 'string' && values.type ? values.type : 'tournament',
      visitingTeamIds: teams,
      ...(isGroupPart
        ? {
            gatheringMinutesBefore: gathering,
            confirmByMinutesBefore: confirmHours === null ? null : confirmHours * 60,
          }
        : {}),
    }
    const base = `/api/activities/club-events/${encodeURIComponent(event.id)}/parts`
    try {
      if (editing) {
        await withScopedApiRequestHeaders(buildOptimisticLockHeader(editing.updatedAt), () =>
          apiCallOrThrow(
            `${base}/${encodeURIComponent(editing.id)}`,
            {
              method: 'PUT',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ ...common, ...(fixedTimes ? {} : { startsAt, endsAt }) }),
            },
            { errorMessage: t('activities.clubEvents.part.errors.save') },
          ),
        )
      } else {
        const coach =
          isGroupPart && typeof values.coachPersonId === 'string' && values.coachPersonId !== NO_COACH
            ? values.coachPersonId
            : ''
        await apiCallOrThrow(
          base,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ ...common, groupId, startsAt, endsAt, ...(coach ? { coachPersonId: coach } : {}) }),
          },
          { errorMessage: t('activities.clubEvents.part.errors.create') },
        )
      }
    } catch (error: unknown) {
      const found = scheduleConflictsOf(error)
      if (found) {
        setConflicts(found)
        throw createCrudFormError(errorMessage(error, t('activities.conflicts.title')))
      }
      const code = errorCodeOf(error)
      const field =
        code === 'club_event_part_outside_section' || code === 'club_event_open_part_needs_external_place'
          ? 'groupId'
          : code === 'activities_reference_invalid' && (error as { field?: unknown }).field === 'visitingTeamIds'
            ? 'visitingTeamIds'
            : fieldOfError(error)
      if (field && fields.some((entry) => entry.id === field)) {
        const message = errorMessage(error, t('activities.form.errors.invalid'))
        throw createCrudFormError(message, { [field]: message })
      }
      throw error
    }
    setConflicts(null)
    flash(t(editing ? 'activities.clubEvents.part.flash.saved' : 'activities.clubEvents.part.flash.created'), 'success')
    onOpenChange(false)
    await onDone()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        closeAriaLabel={t('activities.common.close')}
        className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"
        data-testid="club-event-part-dialog"
      >
        <DialogHeader>
          <DialogTitle>
            {t(
              editing
                ? 'activities.clubEvents.part.editTitle'
                : mode.kind === 'create' && mode.source
                  ? 'activities.clubEvents.part.copyTitle'
                  : 'activities.clubEvents.part.createTitle',
            )}
          </DialogTitle>
          <DialogDescription>{event.name ?? ''}</DialogDescription>
        </DialogHeader>
        {conflicts ? <ConflictList conflicts={conflicts} /> : null}
        <CrudForm<PartValues>
          embedded
          fields={fields}
          groups={groupsLayout}
          initialValues={initialValues}
          submitLabel={t(editing ? 'activities.common.save' : 'activities.clubEvents.part.submitCreate')}
          extraActions={
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                onOpenChange(false)
              }}
            >
              {t('activities.common.cancel')}
            </Button>
          }
          onSubmit={submit}
        />
      </DialogContent>
    </Dialog>
  )
}
