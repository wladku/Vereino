// Pure rules of the maintenance tasks (facilities spec glossary *Maintenance task*, REQ-022, DD-36, DD-46; #128): work
// or an inspection on a place, planned with a time window (it then occupies the slot like a closure), by a due date
// (one-off or recurring by date) or by hours of use. Nothing here reads the database or the clock (S3.5): the caller
// passes the dates and the current instant.
import { defineTransitions, type CalendarDate } from '@vereino/core'

export const MAINTENANCE_KINDS = [
  'line_marking',
  'mowing',
  'aeration',
  'irrigation',
  'brushing',
  'inspection',
  'other',
] as const
export type MaintenanceKind = (typeof MAINTENANCE_KINDS)[number]

export const MAINTENANCE_RESPONSIBLE = ['club', 'owner'] as const
export type MaintenanceResponsible = (typeof MAINTENANCE_RESPONSIBLE)[number]

export const MAINTENANCE_SCHEDULE_TYPES = ['one_off', 'date_recurring', 'usage_hours'] as const
export type MaintenanceScheduleType = (typeof MAINTENANCE_SCHEDULE_TYPES)[number]

export const MAINTENANCE_STATUSES = ['planned', 'done', 'cancelled'] as const
export type MaintenanceStatus = (typeof MAINTENANCE_STATUSES)[number]

/** DD-46: a task is planned, then done or cancelled; both are final. */
export const maintenanceTransitions = defineTransitions({
  states: MAINTENANCE_STATUSES,
  entry: ['planned'],
  transitions: [
    ['planned', 'done'],
    ['planned', 'cancelled'],
  ],
  terminal: ['done', 'cancelled'],
})

/** The largest `usage_hours_threshold` and recurrence interval accepted. */
export const MAX_USAGE_HOURS_THRESHOLD = 10_000
export const MAX_RECURRENCE_INTERVAL = 120

/** The recurrence by date of a `date_recurring` task: the RRULE subset `FREQ=…[;INTERVAL=n]`. */
export type MaintenanceRecurrence = { freq: 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'; interval: number }

const FREQUENCIES = new Set(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'])

/**
 * Parses the RRULE of a recurring task (`FREQ=YEARLY`, `FREQ=YEARLY;INTERVAL=5`, an optional `RRULE:` prefix), or
 * null for anything outside the subset — daily, annual and five-year inspections need no more.
 */
export function parseMaintenanceRecurrence(rule: string): MaintenanceRecurrence | null {
  const parts = rule
    .trim()
    .replace(/^RRULE:/i, '')
    .toUpperCase()
    .split(';')
  let freq: string | null = null
  let interval = 1
  for (const part of parts) {
    const [name, value, extra] = part.split('=')
    if (extra !== undefined || !value) return null
    if (name === 'FREQ' && freq === null && FREQUENCIES.has(value)) freq = value
    else if (name === 'INTERVAL' && /^[1-9]\d*$/.test(value) && Number(value) <= MAX_RECURRENCE_INTERVAL) {
      interval = Number(value)
    } else return null
  }
  return freq ? { freq: freq as MaintenanceRecurrence['freq'], interval } : null
}

function addMonths(date: CalendarDate, months: number): CalendarDate {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number]
  const index = year * 12 + (month - 1) + months
  const targetYear = Math.floor(index / 12)
  const targetMonth = (index % 12) + 1
  const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate()
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${String(targetYear)}-${pad(targetMonth)}-${pad(Math.min(day, lastDay))}`
}

/** The due date after `dueDate` (a month end is kept within the shorter month: 31 Jan → 28/29 Feb). */
export function nextDueDate(dueDate: CalendarDate, rule: MaintenanceRecurrence): CalendarDate {
  if (rule.freq === 'MONTHLY') return addMonths(dueDate, rule.interval)
  if (rule.freq === 'YEARLY') return addMonths(dueDate, rule.interval * 12)
  const days = rule.freq === 'WEEKLY' ? rule.interval * 7 : rule.interval
  const next = new Date(`${dueDate}T00:00:00Z`)
  next.setUTCDate(next.getUTCDate() + days)
  return next.toISOString().slice(0, 10)
}

export type MaintenanceTaskShape = {
  scheduleType: MaintenanceScheduleType
  startsAt: Date | null
  endsAt: Date | null
  dueDate: CalendarDate | null
  recurrenceRule: string | null
  usageHoursThreshold: number | null
}

export type MaintenanceProblem = {
  code: 'maintenance_window_invalid' | 'maintenance_schedule_invalid' | 'maintenance_usage_threshold_invalid'
  field: string
}

/**
 * Why a task is not valid, or null (422): a window needs both ends with the end after the start; a one-off task needs
 * a window or a due date; a recurring task a due date and a supported RRULE; a usage task a whole threshold ≥ 1.
 */
export function maintenanceTaskProblem(task: MaintenanceTaskShape): MaintenanceProblem | null {
  const { startsAt, endsAt } = task
  if ((startsAt === null) !== (endsAt === null)) return { code: 'maintenance_window_invalid', field: 'endsAt' }
  if (startsAt && endsAt) {
    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
      return { code: 'maintenance_window_invalid', field: 'endsAt' }
    }
  }
  if (task.scheduleType === 'one_off' && startsAt === null && task.dueDate === null) {
    return { code: 'maintenance_schedule_invalid', field: 'dueDate' }
  }
  if (task.scheduleType === 'date_recurring') {
    if (task.dueDate === null) return { code: 'maintenance_schedule_invalid', field: 'dueDate' }
    if (!task.recurrenceRule || !parseMaintenanceRecurrence(task.recurrenceRule)) {
      return { code: 'maintenance_schedule_invalid', field: 'recurrenceRule' }
    }
  }
  if (task.scheduleType === 'usage_hours') {
    const threshold = task.usageHoursThreshold
    if (threshold === null || !Number.isInteger(threshold) || threshold < 1 || threshold > MAX_USAGE_HOURS_THRESHOLD) {
      return { code: 'maintenance_usage_threshold_invalid', field: 'usageHoursThreshold' }
    }
  }
  return null
}

/** True when a `planned` task occupies its window (glossary *Slot occupancy*). */
export function taskOccupies(task: {
  status: MaintenanceStatus
  startsAt?: Date | null
  endsAt?: Date | null
}): boolean {
  return task.status === 'planned' && !!task.startsAt && !!task.endsAt
}

/** True when an update moved the window of a task (creating or moving it flags the conflicts again). */
export function maintenanceWindowChanged(
  before: { placeId: string; startsAt: Date | null; endsAt: Date | null },
  after: { placeId: string; startsAt: Date | null; endsAt: Date | null },
): boolean {
  return (
    before.placeId !== after.placeId ||
    (before.startsAt?.getTime() ?? null) !== (after.startsAt?.getTime() ?? null) ||
    (before.endsAt?.getTime() ?? null) !== (after.endsAt?.getTime() ?? null)
  )
}

/** Which date reminder is due on `today`: 14 days before the due date, then 1 day before (or once overdue). */
export type DateReminderStage = 'd14' | 'd1'

export function dateReminderStage(dueDate: CalendarDate, today: CalendarDate): DateReminderStage | null {
  const days = Math.round((Date.parse(`${dueDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000)
  if (days <= 1) return 'd1'
  return days <= 14 ? 'd14' : null
}

/**
 * The hours a place family was occupied in `since`–`until` (glossary *Maintenance task* `usage_hours`): the union of
 * the intervals clipped to the window, so two entries at the same time (a session on a court and a booking of the
 * hall) count once.
 */
export function usedHours(intervals: ReadonlyArray<{ start: Date; end: Date }>, since: Date, until: Date): number {
  const clipped = intervals
    .map((interval) => ({
      start: Math.max(interval.start.getTime(), since.getTime()),
      end: Math.min(interval.end.getTime(), until.getTime()),
    }))
    .filter((interval) => interval.end > interval.start)
    .sort((a, b) => a.start - b.start)
  let total = 0
  let current: { start: number; end: number } | null = null
  for (const interval of clipped) {
    if (current && interval.start <= current.end) {
      current.end = Math.max(current.end, interval.end)
      continue
    }
    if (current) total += current.end - current.start
    current = { ...interval }
  }
  if (current) total += current.end - current.start
  return total / 3_600_000
}

/** The idempotency keys of the reminders (DD-46: the dispatch key is the "sent" marker). */
export function dateReminderKey(taskId: string, dueDate: CalendarDate, stage: DateReminderStage): string {
  return `facilities:maint-due:${taskId}:${dueDate}:${stage}`
}

export function usageReminderKey(taskId: string, usageCountedFrom: Date): string {
  return `facilities:maint-usage:${taskId}:${usageCountedFrom.toISOString()}`
}
