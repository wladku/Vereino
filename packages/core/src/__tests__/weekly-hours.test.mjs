import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  ISO_WEEKDAYS,
  addDays,
  isMonthDay,
  isWallTime,
  isIsoWeekday,
  minutesOfDay,
  openingHoursProblem,
  openingWindowsOn,
  readOpeningHours,
  seasonCovers,
  isoWeekdayOf,
  windowFitsOpeningHours,
  windowsOverlap,
  withinWindows,
} from '../weekly-hours.ts'

const weekdays = (from, to) => [1, 2, 3, 4, 5].map((weekday) => ({ weekday, from, to }))
const weekend = (from, to) => [6, 7].map((weekday) => ({ weekday, from, to }))
/** The Orlik 2024 reference hours: Mon–Fri 8:00–22:00, Sat–Sun 9:00–20:30, all year. */
const ORLIK = {
  seasons: [{ from: '01-01', to: '12-31', windows: [...weekdays('08:00', '22:00'), ...weekend('09:00', '20:30')] }],
}

test('wall times, weekdays and month days are recognized', () => {
  assert.equal(isWallTime('00:00'), true)
  assert.equal(isWallTime('23:59'), true)
  assert.equal(isWallTime('24:00'), true)
  assert.equal(isWallTime('24:01'), false)
  assert.equal(isWallTime('7:00'), false)
  assert.equal(isWallTime(700), false)
  assert.equal(minutesOfDay('16:30'), 990)
  assert.equal(minutesOfDay('24:00'), 1440)
  assert.deepEqual(ISO_WEEKDAYS, [1, 2, 3, 4, 5, 6, 7])
  assert.equal(isIsoWeekday(7), true)
  assert.equal(isIsoWeekday(0), false)
  assert.equal(isIsoWeekday(1.5), false)
  assert.equal(isIsoWeekday('1'), false)
  assert.equal(isMonthDay('02-29'), true)
  assert.equal(isMonthDay('02-30'), false)
  assert.equal(isMonthDay('13-01'), false)
  assert.equal(isMonthDay('00-10'), false)
  assert.equal(isMonthDay('01-00'), false)
  assert.equal(isMonthDay('1-1'), false)
  assert.equal(isMonthDay(101), false)
})

test('isoWeekdayOf and addDays work on calendar dates', () => {
  assert.equal(isoWeekdayOf('2026-11-02'), 1)
  assert.equal(isoWeekdayOf('2026-11-08'), 7)
  assert.equal(addDays('2026-12-31', 1), '2027-01-01')
  assert.equal(addDays('2026-03-01', -1), '2026-02-28')
})

test('a season covers its days, also across the year end', () => {
  assert.equal(seasonCovers({ from: '04-01', to: '10-31' }, '2026-04-01'), true)
  assert.equal(seasonCovers({ from: '04-01', to: '10-31' }, '2026-11-01'), false)
  assert.equal(seasonCovers({ from: '11-01', to: '03-31' }, '2026-12-15'), true)
  assert.equal(seasonCovers({ from: '11-01', to: '03-31' }, '2027-02-01'), true)
  assert.equal(seasonCovers({ from: '11-01', to: '03-31' }, '2027-06-01'), false)
})

test('windows overlap only on the same weekday and when they share a minute', () => {
  const a = { weekday: 1, from: '16:00', to: '18:00' }
  assert.equal(windowsOverlap(a, { weekday: 1, from: '17:00', to: '19:00' }), true)
  assert.equal(windowsOverlap(a, { weekday: 1, from: '18:00', to: '19:00' }), false)
  assert.equal(windowsOverlap(a, { weekday: 2, from: '17:00', to: '19:00' }), false)
})

test('openingHoursProblem accepts valid hours and names the first problem', () => {
  assert.equal(openingHoursProblem(ORLIK), null)
  assert.equal(openingHoursProblem({ seasons: [] }), null)
  assert.equal(openingHoursProblem(null), 'malformed')
  assert.equal(openingHoursProblem('x'), 'malformed')
  assert.equal(openingHoursProblem({}), 'malformed')
  assert.equal(openingHoursProblem({ seasons: [null] }), 'malformed')
  assert.equal(openingHoursProblem({ seasons: [{ from: '01-01', to: '12-31', windows: 'x' }] }), 'malformed')
  assert.equal(openingHoursProblem({ seasons: [{ from: '01-01', to: '12-31', windows: [null] }] }), 'malformed')
  assert.equal(
    openingHoursProblem({
      seasons: [{ from: '01-01', to: '12-31', windows: [{ weekday: 8, from: '08:00', to: '09:00' }] }],
    }),
    'malformed',
  )
  assert.equal(
    openingHoursProblem({
      seasons: [{ from: '01-01', to: '12-31', windows: [{ weekday: 1, from: '10:00', to: '09:00' }] }],
    }),
    'window_inverted',
  )
  assert.equal(
    openingHoursProblem({
      seasons: [
        {
          from: '01-01',
          to: '12-31',
          windows: [
            { weekday: 1, from: '08:00', to: '12:00' },
            { weekday: 1, from: '11:00', to: '14:00' },
          ],
        },
      ],
    }),
    'window_overlap',
  )
  assert.equal(
    openingHoursProblem({
      seasons: [
        { from: '11-01', to: '03-31', windows: [] },
        { from: '03-31', to: '10-31', windows: [] },
      ],
    }),
    'season_overlap',
  )
})

test('readOpeningHours returns valid hours only', () => {
  assert.equal(readOpeningHours(ORLIK), ORLIK)
  assert.equal(readOpeningHours(null), null)
  assert.equal(readOpeningHours(undefined), null)
  assert.equal(readOpeningHours({ seasons: 'x' }), null)
})

test('openingWindowsOn: no hours = no limit, no season = closed', () => {
  assert.equal(openingWindowsOn(null, '2026-11-02'), null)
  assert.deepEqual(openingWindowsOn(ORLIK, '2026-11-02'), [{ weekday: 1, from: '08:00', to: '22:00' }])
  const summer = { seasons: [{ from: '04-01', to: '10-31', windows: weekdays('08:00', '22:00') }] }
  assert.deepEqual(openingWindowsOn(summer, '2026-11-02'), [])
})

test('withinWindows needs the whole range inside one window', () => {
  const windows = [{ weekday: 1, from: '08:00', to: '22:00' }]
  assert.equal(withinWindows(windows, '16:00', '22:00'), true)
  assert.equal(withinWindows(windows, '07:00', '10:00'), false)
  assert.equal(withinWindows([], '16:00', '18:00'), false)
})

test('windowFitsOpeningHours checks every covered date of the period', () => {
  const period = { validFrom: '2026-11-02', validTo: null }
  assert.equal(windowFitsOpeningHours(null, { weekday: 1, from: '07:00', to: '10:00' }, period), true)
  assert.equal(windowFitsOpeningHours(ORLIK, { weekday: 1, from: '16:00', to: '22:00' }, period), true)
  assert.equal(windowFitsOpeningHours(ORLIK, { weekday: 1, from: '07:00', to: '10:00' }, period), false)
  assert.equal(windowFitsOpeningHours(ORLIK, { weekday: 6, from: '09:00', to: '20:30' }, period), true)
  assert.equal(windowFitsOpeningHours(ORLIK, { weekday: 6, from: '09:00', to: '21:00' }, period), false)
  // A closed season is skipped; a period entirely in a closed season does not fit.
  const summer = { seasons: [{ from: '04-01', to: '10-31', windows: weekdays('08:00', '22:00') }] }
  assert.equal(windowFitsOpeningHours(summer, { weekday: 1, from: '16:00', to: '22:00' }, period), true)
  assert.equal(
    windowFitsOpeningHours(
      summer,
      { weekday: 1, from: '16:00', to: '22:00' },
      { validFrom: '2026-11-02', validTo: '2026-12-31' },
    ),
    false,
  )
  // A short closed period without the weekday has no date to check.
  assert.equal(
    windowFitsOpeningHours(
      ORLIK,
      { weekday: 1, from: '16:00', to: '22:00' },
      { validFrom: '2026-11-03', validTo: '2026-11-04' },
    ),
    false,
  )
  assert.equal(
    windowFitsOpeningHours(ORLIK, { weekday: 1, from: '16:00', to: '22:00' }, { validFrom: 'x', validTo: null }),
    false,
  )
})
