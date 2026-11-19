// Date-safe days for the integration tests (MT-TEST-04; lesson `integration-tests-pick-days-two-days-ahead`).
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  MIN_DAYS_AHEAD,
  WEEKDAY_CODES,
  isCalendarDate,
  safeDayAfter,
  shiftDate,
  weekdayCodeOf,
} from '../vereino-test-dates.mjs'

test('isCalendarDate accepts real YYYY-MM-DD dates only', () => {
  assert.equal(isCalendarDate('2026-11-18'), true)
  assert.equal(isCalendarDate('2028-02-29'), true)
  assert.equal(isCalendarDate('2026-02-29'), false)
  assert.equal(isCalendarDate('2026-13-01'), false)
  assert.equal(isCalendarDate('2026-11-8'), false)
  assert.equal(isCalendarDate(20261118), false)
  assert.equal(isCalendarDate(undefined), false)
})

test('shiftDate and weekdayCodeOf are plain calendar arithmetic', () => {
  assert.equal(shiftDate('2026-11-18', 2), '2026-11-20')
  assert.equal(shiftDate('2026-03-01', -1), '2026-02-28')
  assert.equal(weekdayCodeOf('2026-11-18'), 'WE')
  assert.equal(weekdayCodeOf('2026-11-22'), 'SU')
})

test('safeDayAfter never returns today or tomorrow, for every weekday of a whole year', () => {
  for (let offset = 0; offset < 366; offset += 1) {
    const today = shiftDate('2026-01-01', offset)
    const tomorrow = shiftDate(today, 1)
    assert.equal(safeDayAfter(today), shiftDate(today, MIN_DAYS_AHEAD))
    for (const weekday of WEEKDAY_CODES) {
      const day = safeDayAfter(today, weekday)
      assert.ok(day > tomorrow, `${today} ${weekday}: ${day} is today or tomorrow`)
      assert.equal(weekdayCodeOf(day), weekday)
      // The first such day: at most a week after the earliest allowed day.
      assert.ok(day <= shiftDate(today, MIN_DAYS_AHEAD + 6), `${today} ${weekday}: ${day} is not the first one`)
    }
  }
})

test('safeDayAfter respects the weekday and a larger minimum', () => {
  // Wednesday 18 November 2026: the next Wednesday, not today; Friday is exactly two days ahead.
  assert.equal(safeDayAfter('2026-11-18', 'WE'), '2026-11-25')
  assert.equal(safeDayAfter('2026-11-18', 'TH'), '2026-11-26')
  assert.equal(safeDayAfter('2026-11-18', 'FR'), '2026-11-20')
  assert.equal(safeDayAfter('2026-11-18', undefined, 7), '2026-11-25')
  assert.equal(safeDayAfter('2026-11-18', 'MO', 7), '2026-11-30')
})

test('safeDayAfter crosses month, leap-day and year ends', () => {
  assert.equal(safeDayAfter('2026-11-29'), '2026-12-01')
  assert.equal(safeDayAfter('2028-02-28'), '2028-03-01')
  assert.equal(safeDayAfter('2028-02-27'), '2028-02-29')
  assert.equal(safeDayAfter('2026-12-30'), '2027-01-01')
  assert.equal(safeDayAfter('2026-12-31', 'MO'), '2027-01-04')
  assert.equal(safeDayAfter('2026-12-28', 'TU'), '2027-01-05')
})

test('safeDayAfter refuses a bad today, weekday or minimum', () => {
  assert.throws(() => safeDayAfter('2026-02-30'), /today must be a YYYY-MM-DD date/)
  assert.throws(() => safeDayAfter('2026-11-18', 'XX'), /unknown weekday code: XX/)
  assert.throws(() => safeDayAfter('2026-11-18', undefined, 1), /minDaysAhead must be a whole number of at least 2/)
  assert.throws(() => safeDayAfter('2026-11-18', 'MO', 2.5), /minDaysAhead/)
})
