// The values of the activity form and the request body built from them (`POST|PUT /api/activities/activities`, `POST
// …/preview`). The recurrence fields (one-off or weekly; weekdays, every n weeks, end, exception dates) become the
// stored rule text through `Recurrence.toText` of `@vereino/core`, and an existing rule is read back with
// `Recurrence.parse`. A one-off activity sends `recurrenceRule: null` and no end date.
import { Recurrence, WEEKDAYS, type Weekday } from '@vereino/core'
import { localToday, textOrNull, type ActivityDetail, type Translate } from './client-helpers'

export type RepeatMode = 'once' | 'weekly'
export type EndMode = 'none' | 'until' | 'count'

export type ActivityFormValues = Record<string, unknown> & {
  groupId?: string
  name?: string
  type?: string
  placeId?: string
  coachPersonId?: string
  description?: string
  isActive?: boolean
  repeat?: RepeatMode
  startsOn?: string
  endsOn?: string
  startTime?: string
  endTime?: string
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
  recurrenceRule: string | null
  startsOn: string
  endsOn: string | null
  startTime: string
  endTime: string
  description: string | null
  isActive: boolean
}

export type ActivityBodyResult =
  { ok: true; body: ActivityBody } | { ok: false; fieldErrors: Record<string, string>; message: string }

const str = (value: unknown): string => (typeof value === 'string' ? value : '')

export function sortedWeekdays(days: readonly unknown[]): Weekday[] {
  return WEEKDAYS.filter((day) => days.includes(day))
}

export function activityToFormValues(activity: ActivityDetail | null): ActivityFormValues {
  const base: ActivityFormValues = {
    groupId: activity?.groupId ?? '',
    name: activity?.name ?? '',
    type: activity?.type ?? 'training',
    placeId: activity?.placeId ?? '',
    coachPersonId: activity?.coachPersonId ?? '',
    description: activity?.description ?? '',
    isActive: activity?.isActive ?? true,
    repeat: activity && !activity.recurrenceRule ? 'once' : 'weekly',
    startsOn: activity?.startsOn ?? localToday(),
    endsOn: activity?.endsOn ?? '',
    startTime: activity?.startTime ?? '',
    endTime: activity?.endTime ?? '',
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
    endMode: rule.until ? 'until' : rule.count !== null ? 'count' : 'none',
    until: rule.until ?? '',
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
      coachPersonId: textOrNull(values.coachPersonId),
      recurrenceRule: rule,
      startsOn: str(values.startsOn),
      endsOn: weekly ? textOrNull(values.endsOn) : null,
      startTime: str(values.startTime),
      endTime: str(values.endTime),
      description: textOrNull(values.description),
      isActive: values.isActive !== false,
    },
  }
}
