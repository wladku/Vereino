import { describe, expect, it } from '@jest/globals'
import {
  MAINTENANCE_KINDS,
  MAINTENANCE_SCHEDULE_TYPES,
  dateReminderKey,
  dateReminderStage,
  maintenanceTaskProblem,
  maintenanceTransitions,
  maintenanceWindowChanged,
  nextDueDate,
  parseMaintenanceRecurrence,
  taskOccupies,
  usageReminderKey,
  usedHours,
  type MaintenanceTaskShape,
} from '../maintenance'

const at = (iso: string) => new Date(iso)

describe('maintenance tasks (REQ-022, DD-36)', () => {
  it('lists the kinds and schedules of the glossary', () => {
    expect(MAINTENANCE_KINDS).toContain('brushing')
    expect(MAINTENANCE_SCHEDULE_TYPES).toEqual(['one_off', 'date_recurring', 'usage_hours'])
  })

  it('moves a planned task to done or cancelled only (DD-46)', () => {
    expect(maintenanceTransitions.canTransition('planned', 'done')).toBe(true)
    expect(maintenanceTransitions.canTransition('planned', 'cancelled')).toBe(true)
    expect(maintenanceTransitions.canTransition('done', 'planned')).toBe(false)
    expect(maintenanceTransitions.canTransition('cancelled', 'done')).toBe(false)
  })

  it('parses the RRULE subset of a recurring task', () => {
    expect(parseMaintenanceRecurrence('FREQ=YEARLY')).toEqual({ freq: 'YEARLY', interval: 1 })
    expect(parseMaintenanceRecurrence('RRULE:freq=yearly;interval=5')).toEqual({ freq: 'YEARLY', interval: 5 })
    expect(parseMaintenanceRecurrence('INTERVAL=2;FREQ=DAILY')).toEqual({ freq: 'DAILY', interval: 2 })
    expect(parseMaintenanceRecurrence('FREQ=HOURLY')).toBeNull()
    expect(parseMaintenanceRecurrence('INTERVAL=2')).toBeNull()
    expect(parseMaintenanceRecurrence('FREQ=DAILY;FREQ=WEEKLY')).toBeNull()
    expect(parseMaintenanceRecurrence('FREQ=DAILY;INTERVAL=0')).toBeNull()
    expect(parseMaintenanceRecurrence('FREQ=DAILY;INTERVAL=121')).toBeNull()
    expect(parseMaintenanceRecurrence('FREQ=DAILY;BYDAY=MO')).toBeNull()
    expect(parseMaintenanceRecurrence('FREQ')).toBeNull()
    expect(parseMaintenanceRecurrence('FREQ=DAILY=1')).toBeNull()
  })

  it('computes the next due date', () => {
    expect(nextDueDate('2026-11-10', { freq: 'DAILY', interval: 1 })).toBe('2026-11-11')
    expect(nextDueDate('2026-12-30', { freq: 'WEEKLY', interval: 1 })).toBe('2027-01-06')
    expect(nextDueDate('2026-01-31', { freq: 'MONTHLY', interval: 1 })).toBe('2026-02-28')
    expect(nextDueDate('2026-11-30', { freq: 'MONTHLY', interval: 3 })).toBe('2027-02-28')
    expect(nextDueDate('2028-02-29', { freq: 'YEARLY', interval: 1 })).toBe('2029-02-28')
    expect(nextDueDate('2026-11-10', { freq: 'YEARLY', interval: 5 })).toBe('2031-11-10')
  })

  it('validates the schedule of a task (422)', () => {
    const base: MaintenanceTaskShape = {
      scheduleType: 'one_off',
      startsAt: at('2026-11-14T08:00:00Z'),
      endsAt: at('2026-11-14T10:00:00Z'),
      dueDate: null,
      recurrenceRule: null,
      usageHoursThreshold: null,
    }
    expect(maintenanceTaskProblem(base)).toBeNull()
    expect(maintenanceTaskProblem({ ...base, endsAt: null })).toEqual({
      code: 'maintenance_window_invalid',
      field: 'endsAt',
    })
    expect(maintenanceTaskProblem({ ...base, endsAt: base.startsAt })?.code).toBe('maintenance_window_invalid')
    expect(maintenanceTaskProblem({ ...base, startsAt: at('x') })?.code).toBe('maintenance_window_invalid')
    expect(maintenanceTaskProblem({ ...base, endsAt: at('x') })?.code).toBe('maintenance_window_invalid')
    expect(maintenanceTaskProblem({ ...base, startsAt: null, endsAt: null })).toEqual({
      code: 'maintenance_schedule_invalid',
      field: 'dueDate',
    })
    expect(maintenanceTaskProblem({ ...base, startsAt: null, endsAt: null, dueDate: '2026-11-20' })).toBeNull()

    const recurring = { ...base, scheduleType: 'date_recurring' as const, startsAt: null, endsAt: null }
    expect(maintenanceTaskProblem(recurring)?.field).toBe('dueDate')
    expect(maintenanceTaskProblem({ ...recurring, dueDate: '2026-12-01' })?.field).toBe('recurrenceRule')
    expect(maintenanceTaskProblem({ ...recurring, dueDate: '2026-12-01', recurrenceRule: 'FREQ=SECONDLY' })?.field).toBe(
      'recurrenceRule',
    )
    expect(maintenanceTaskProblem({ ...recurring, dueDate: '2026-12-01', recurrenceRule: 'FREQ=YEARLY' })).toBeNull()

    const usage = { ...base, scheduleType: 'usage_hours' as const, startsAt: null, endsAt: null }
    expect(maintenanceTaskProblem(usage)?.code).toBe('maintenance_usage_threshold_invalid')
    expect(maintenanceTaskProblem({ ...usage, usageHoursThreshold: 0 })?.code).toBe(
      'maintenance_usage_threshold_invalid',
    )
    expect(maintenanceTaskProblem({ ...usage, usageHoursThreshold: 1.5 })?.code).toBe(
      'maintenance_usage_threshold_invalid',
    )
    expect(maintenanceTaskProblem({ ...usage, usageHoursThreshold: 10_001 })?.code).toBe(
      'maintenance_usage_threshold_invalid',
    )
    expect(maintenanceTaskProblem({ ...usage, usageHoursThreshold: 12 })).toBeNull()
  })

  it('occupies the slot only while planned with a window', () => {
    const window = { startsAt: at('2026-11-14T08:00:00Z'), endsAt: at('2026-11-14T10:00:00Z') }
    expect(taskOccupies({ status: 'planned', ...window })).toBe(true)
    expect(taskOccupies({ status: 'done', ...window })).toBe(false)
    expect(taskOccupies({ status: 'planned', startsAt: null, endsAt: null })).toBe(false)
    expect(taskOccupies({ status: 'planned', startsAt: window.startsAt, endsAt: null })).toBe(false)
  })

  it('notices a moved window or place', () => {
    const before = { placeId: 'p', startsAt: at('2026-11-14T08:00:00Z'), endsAt: at('2026-11-14T10:00:00Z') }
    expect(maintenanceWindowChanged(before, { ...before })).toBe(false)
    expect(maintenanceWindowChanged(before, { ...before, placeId: 'q' })).toBe(true)
    expect(maintenanceWindowChanged(before, { ...before, startsAt: null, endsAt: null })).toBe(true)
    expect(maintenanceWindowChanged({ ...before, startsAt: null, endsAt: null }, before)).toBe(true)
    expect(
      maintenanceWindowChanged({ placeId: 'p', startsAt: null, endsAt: null }, { placeId: 'p', startsAt: null, endsAt: null }),
    ).toBe(false)
  })

  it('reminds 14 days and 1 day before the due date', () => {
    expect(dateReminderStage('2026-12-01', '2026-11-01')).toBeNull()
    expect(dateReminderStage('2026-12-01', '2026-11-17')).toBe('d14')
    expect(dateReminderStage('2026-12-01', '2026-11-29')).toBe('d14')
    expect(dateReminderStage('2026-12-01', '2026-11-30')).toBe('d1')
    expect(dateReminderStage('2026-12-01', '2026-12-03')).toBe('d1')
  })

  it('counts the occupied hours as a union clipped to the window', () => {
    const since = at('2026-11-01T00:00:00Z')
    const until = at('2026-11-30T00:00:00Z')
    expect(usedHours([], since, until)).toBe(0)
    expect(
      usedHours(
        [
          { start: at('2026-11-02T10:00:00Z'), end: at('2026-11-02T12:00:00Z') },
          { start: at('2026-11-02T11:00:00Z'), end: at('2026-11-02T13:00:00Z') },
          { start: at('2026-11-02T13:00:00Z'), end: at('2026-11-02T14:00:00Z') },
          { start: at('2026-11-03T10:00:00Z'), end: at('2026-11-03T11:30:00Z') },
          { start: at('2026-10-31T23:00:00Z'), end: at('2026-11-01T01:00:00Z') },
          { start: at('2026-12-01T10:00:00Z'), end: at('2026-12-01T12:00:00Z') },
          { start: at('2026-11-05T10:00:00Z'), end: at('2026-11-05T10:30:00Z') },
          { start: at('2026-11-05T10:10:00Z'), end: at('2026-11-05T10:20:00Z') },
        ],
        since,
        until,
      ),
    ).toBe(4 + 1.5 + 1 + 0.5)
  })

  it('builds the reminder keys (DD-46)', () => {
    expect(dateReminderKey('t', '2026-12-01', 'd14')).toBe('facilities:maint-due:t:2026-12-01:d14')
    expect(usageReminderKey('t', at('2026-11-01T00:00:00Z'))).toBe('facilities:maint-usage:t:2026-11-01T00:00:00.000Z')
  })
})
