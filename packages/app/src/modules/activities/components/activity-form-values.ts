// The values of the activity form and the request body built from them (`POST|PUT /api/activities/activities`, `POST
// …/preview`). The recurrence fields (one-off or weekly; weekdays, every n weeks, end, exception dates) become the
// stored rule text through `Recurrence.toText` of `@vereino/core`, and an existing rule is read back with
// `Recurrence.parse`. A one-off activity sends `recurrenceRule: null` and no end date. The series end is entered once
// (#268, REQ-A04): the rule's "Last day" is also the activity's `endsOn`. Only a match or a sparring sends an opponent
// (#93), "No coach" sends `coachPersonId: null`, and a tournament sends its invited teams (#268).
import { Recurrence, WEEKDAYS, type Weekday } from '@vereino/core'
import { takesOpponent } from '../lib/activities-rules'
import { MAX_GATHERING_MINUTES } from '../lib/gathering'
import { MAX_CONFIRM_BY_HOURS, NO_COACH, textOrNull, type ActivityDetail, type Translate } from './client-helpers'

export type RepeatMode = 'once' | 'weekly'
export type EndMode = 'none' | 'until' | 'count'

export type ActivityFormValues = Record<string, unknown> & {
  groupId?: string
  name?: string
  type?: string
  placeId?: string
  coachPersonId?: string
  opponentExternalTeamId?: string
  /** The invited external teams of a tournament (#268). */
  invitedExternalTeamIds?: string[]
  /** Derived from the type: the opponent field is shown (a match or a sparring). Never sent. */
  takesOpponent?: boolean
  description?: string
  isActive?: boolean
  /** An away trip (#96). */
  isAway?: boolean
  repeat?: RepeatMode
  startsOn?: string
  endsOn?: string
  startTime?: string
  endTime?: string
  /** The default gathering time in minutes before the start (DD-43); empty = none. */
  gatheringMinutesBefore?: string | number | null
  /** The default declaration deadline in hours before the start (REQ-A07); empty = none. */
  confirmByHoursBefore?: string | number | null
  /** Derived: the type's declaration kind is `confirm`, so the deadline field is shown and sent (REQ-A07). */
  takesDeadline?: boolean
  byDay?: string[]
  interval?: string
  endMode?: EndMode
  until?: string
  count?: string
  exdates?: string[]
  updatedAt?: string | null
}

/** The create body; an update omits `groupId` (the group of an activity is fixed). */
export type ActivityBody = {
  groupId: string
  name: string
  type: string
  placeId: string
  coachPersonId: string | null
  opponentExternalTeamId: string | null
  /** Sent for a tournament only, so an edit of another one-off event keeps its invited teams. */
  invitedExternalTeamIds?: string[]
  recurrenceRule: string | null
  startsOn: string
  endsOn: string | null
  startTime: string
  endTime: string
  gatheringMinutesBefore: number | null
  confirmByMinutesBefore: number | null
  description: string | null
  isActive: boolean
  isAway: boolean
}

export type ActivityBodyResult =
  { ok: true; body: ActivityBody } | { ok: false; fieldErrors: Record<string, string>; message: string }

const str = (value: unknown): string => (typeof value === 'string' ? value : '')

export function sortedWeekdays(days: readonly unknown[]): Weekday[] {
  return WEEKDAYS.filter((day) => days.includes(day))
}

/** The form values of an activity, or of a new one starting on `today` (the club's calendar date, #231). */
export function activityToFormValues(activity: ActivityDetail | null, today: string): ActivityFormValues {
  const base: ActivityFormValues = {
    groupId: activity?.groupId ?? '',
    name: activity?.name ?? '',
    type: activity?.type ?? 'training',
    placeId: activity?.placeId ?? '',
    coachPersonId: activity?.coachPersonId ?? '',
    opponentExternalTeamId: activity?.opponentExternalTeamId ?? '',
    invitedExternalTeamIds: [...(activity?.invitedExternalTeamIds ?? [])],
    takesOpponent: takesOpponent(activity?.type),
    description: activity?.description ?? '',
    isActive: activity?.isActive ?? true,
    isAway: activity?.isAway ?? false,
    repeat: activity && !activity.recurrenceRule ? 'once' : 'weekly',
    startsOn: activity?.startsOn ?? today,
    endsOn: activity?.endsOn ?? '',
    startTime: activity?.startTime ?? '',
    endTime: activity?.endTime ?? '',
    gatheringMinutesBefore:
      activity?.gatheringMinutesBefore !== null && activity?.gatheringMinutesBefore !== undefined
        ? String(activity.gatheringMinutesBefore)
        : '',
    // Whole hours; a deadline set through the API in minutes reads rounded up to the next hour.
    confirmByHoursBefore: activity?.confirmByMinutesBefore
      ? String(Math.ceil(activity.confirmByMinutesBefore / 60))
      : '',
    takesDeadline: true,
    byDay: [],
    interval: '1',
    endMode: 'none',
    until: '',
    count: '',
    exdates: [],
    updatedAt: activity?.updatedAt ?? null,
  }
  if (!activity?.recurrenceRule) return base
  const parsed = Recurrence.parse(activity.recurrenceRule)
  if (!parsed.ok) return base
  const rule = parsed.value
  return {
    ...base,
    byDay: [...rule.byDay],
    interval: String(rule.interval),
    // One "Last day" (#268): an activity whose end was kept only in `endsOn` reads it back as the rule's last day.
    endMode: rule.until || (rule.count === null && activity.endsOn) ? 'until' : rule.count !== null ? 'count' : 'none',
    until: rule.until ?? (rule.count === null ? (activity.endsOn ?? '') : ''),
    count: rule.count !== null ? String(rule.count) : '',
    exdates: [...rule.exdates],
  }
}

function positiveInt(value: string, max: number): number | null {
  if (!/^\d+$/.test(value.trim())) return null
  const parsed = Number(value.trim())
  return parsed >= 1 && parsed <= max ? parsed : null
}

/** The rule text of the weekly fields, or the field errors that keep it from being built. */
function recurrenceRule(
  values: ActivityFormValues,
  t: Translate,
): { rule: string; errors: null } | { rule: null; errors: Record<string, string> } {
  const errors: Record<string, string> = {}
  const byDay = sortedWeekdays(values.byDay ?? [])
  if (byDay.length === 0) errors.byDay = t('activities.form.errors.byDay')
  const interval = positiveInt(str(values.interval) || '1', 52)
  if (interval === null) errors.interval = t('activities.form.errors.interval')
  const endMode = values.endMode ?? 'none'
  const until = endMode === 'until' ? str(values.until) : ''
  if (endMode === 'until' && !until) errors.until = t('activities.form.errors.until')
  const count = endMode === 'count' ? positiveInt(str(values.count), 1000) : null
  if (endMode === 'count' && count === null) errors.count = t('activities.form.errors.count')
  if (Object.keys(errors).length > 0 || interval === null) return { rule: null, errors }
  const exdates = [...new Set((values.exdates ?? []).filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)))].sort()
  return {
    rule: Recurrence.toText({ freq: 'WEEKLY', interval, byDay, until: until || null, count, exdates }),
    errors: null,
  }
}

/** Builds the request body, or the client-side field errors (required fields and the weekly rule). */
export function buildActivityBody(values: ActivityFormValues, t: Translate): ActivityBodyResult {
  const fieldErrors: Record<string, string> = {}
  const required = t('activities.form.errors.required')
  for (const field of ['groupId', 'name', 'type', 'placeId', 'startsOn', 'startTime', 'endTime'] as const) {
    if (!str(values[field]).trim()) fieldErrors[field] = required
  }
  const gathering = values.gatheringMinutesBefore
  const gatheringText = typeof gathering === 'number' ? String(gathering) : str(gathering).trim()
  const gatheringMinutesBefore = gatheringText ? positiveInt(gatheringText, MAX_GATHERING_MINUTES) : null
  if (gatheringText && gatheringMinutesBefore === null) {
    fieldErrors.gatheringMinutesBefore = t('activities.form.errors.gathering')
  }
  // REQ-A07: a type that is not of a `confirm` kind takes no deadline, so a hidden field sends none.
  const confirmByHours = values.confirmByHoursBefore
  const confirmByText =
    values.takesDeadline === false
      ? ''
      : typeof confirmByHours === 'number'
        ? String(confirmByHours)
        : str(confirmByHours).trim()
  const confirmByHoursBefore = confirmByText ? positiveInt(confirmByText, MAX_CONFIRM_BY_HOURS) : null
  if (confirmByText && confirmByHoursBefore === null) {
    fieldErrors.confirmByHoursBefore = t('activities.form.errors.confirmBy')
  }
  const weekly = values.repeat !== 'once'
  let rule: string | null = null
  if (weekly) {
    const built = recurrenceRule(values, t)
    if (built.errors) Object.assign(fieldErrors, built.errors)
    else rule = built.rule
  }
  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, fieldErrors, message: t('activities.form.errors.invalid') }
  }
  return {
    ok: true,
    body: {
      groupId: str(values.groupId),
      name: str(values.name).trim(),
      type: str(values.type),
      placeId: str(values.placeId),
      coachPersonId: values.coachPersonId === NO_COACH ? null : textOrNull(values.coachPersonId),
      opponentExternalTeamId: takesOpponent(values.type) ? textOrNull(values.opponentExternalTeamId) : null,
      ...(values.type === 'tournament'
        ? { invitedExternalTeamIds: [...new Set((values.invitedExternalTeamIds ?? []).filter(Boolean))] }
        : {}),
      recurrenceRule: rule,
      startsOn: str(values.startsOn),
      endsOn: weekly && values.endMode === 'until' ? textOrNull(values.until) : null,
      startTime: str(values.startTime),
      endTime: str(values.endTime),
      gatheringMinutesBefore,
      confirmByMinutesBefore: confirmByHoursBefore === null ? null : confirmByHoursBefore * 60,
      description: textOrNull(values.description),
      isActive: values.isActive !== false,
      isAway: values.isAway === true,
    },
  }
}
