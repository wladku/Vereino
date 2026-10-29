import assert from 'node:assert/strict'
import { test } from 'node:test'
import { assertCalendarDate, calendarDateInZone, isCalendarDate } from '../calendar-date.ts'

test('isCalendarDate accepts real YYYY-MM-DD dates only', () => {
  assert.equal(isCalendarDate('2026-10-27'), true)
  assert.equal(isCalendarDate('2024-02-29'), true)
  assert.equal(isCalendarDate('2026-02-29'), false)
  assert.equal(isCalendarDate('2026-02-30'), false)
  assert.equal(isCalendarDate('2026-13-01'), false)
  assert.equal(isCalendarDate('2026-1-01'), false)
  assert.equal(isCalendarDate('2026-10-27T00:00:00Z'), false)
  assert.equal(isCalendarDate(20261027), false)
  assert.equal(isCalendarDate(null), false)
})

test('assertCalendarDate throws a RangeError naming the field', () => {
  assert.doesNotThrow(() => assertCalendarDate('2026-10-27', 'today'))
  assert.throws(() => assertCalendarDate('27.10.2026', 'today'), {
    name: 'RangeError',
    message: '[internal] today must be a YYYY-MM-DD calendar date',
  })
})

test('calendarDateInZone gives the calendar date of an instant in a time zone', () => {
  const lateEvening = new Date('2026-10-27T23:30:00Z')
  assert.equal(calendarDateInZone(lateEvening, 'Europe/Warsaw'), '2026-10-28')
  assert.equal(calendarDateInZone(lateEvening, 'UTC'), '2026-10-27')
})
