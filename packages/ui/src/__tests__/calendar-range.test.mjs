// TEST-W01 (calendar range switch spec REQ-W01, DD-W02, DD-W03, DD-W04, DD-W08): the range rules — the view and anchor
// of the address, Monday weeks across months and years, calendar months of 28/29/30/31 days, moves that keep the
// weekday or the day of the month, the readable window, the headings in pl and en, and the media-query store.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  CALENDAR_RANGES,
  WIDE_CALENDAR_QUERY,
  calendarRangeHref,
  canShiftRange,
  clampToWindow,
  datesOf,
  defaultCalendarRange,
  formatRangeLabel,
  isCalendarRange,
  mediaQueryStore,
  parseCalendarRange,
  rangeOf,
  readableRange,
  shiftRange,
  windowHolds,
} from '../member/calendar-range.ts'

const params = (query) => new URLSearchParams(query)

test('the views, the default per screen and the media query', () => {
  assert.deepEqual(CALENDAR_RANGES, ['day', 'week', 'month'])
  assert.equal(isCalendarRange('week'), true)
  assert.equal(isCalendarRange('agenda'), false)
  assert.equal(isCalendarRange(null), false)
  assert.equal(defaultCalendarRange(false), 'day')
  assert.equal(defaultCalendarRange(true), 'week')
  assert.equal(WIDE_CALENDAR_QUERY, '(min-width: 768px)')
})

test('parseCalendarRange: a known view and date, an extra tab, else the fallback and today', () => {
  const today = '2026-11-26'
  assert.deepEqual(parseCalendarRange(params('range=month&date=2026-12-03'), { today, fallback: 'day' }), {
    range: 'month',
    anchor: '2026-12-03',
    explicit: true,
  })
  assert.deepEqual(parseCalendarRange(params('range=upcoming'), { today, fallback: 'week', extra: ['upcoming'] }), {
    range: 'upcoming',
    anchor: today,
    explicit: true,
  })
  assert.deepEqual(parseCalendarRange(params('range=upcoming&date=2026-02-30'), { today, fallback: 'week' }), {
    range: 'week',
    anchor: today,
    explicit: false,
  })
  assert.deepEqual(parseCalendarRange(params(''), { today, fallback: 'day' }), {
    range: 'day',
    anchor: today,
    explicit: false,
  })
})

test('rangeOf: the day, the Monday–Sunday week across months and years, the calendar month', () => {
  assert.deepEqual(rangeOf('day', '2026-11-26'), { from: '2026-11-26', to: '2026-11-26' })
  // Thursday 26 November 2026 → Monday 23 to Sunday 29.
  assert.deepEqual(rangeOf('week', '2026-11-26'), { from: '2026-11-23', to: '2026-11-29' })
  // A Sunday belongs to the week before; a Monday starts its own.
  assert.deepEqual(rangeOf('week', '2026-11-29'), { from: '2026-11-23', to: '2026-11-29' })
  assert.deepEqual(rangeOf('week', '2026-11-30'), { from: '2026-11-30', to: '2026-12-06' })
  assert.deepEqual(rangeOf('week', '2027-01-01'), { from: '2026-12-28', to: '2027-01-03' })
  // The DST weeks of Europe/Warsaw are seven calendar days like any other.
  assert.deepEqual(rangeOf('week', '2026-03-29'), { from: '2026-03-23', to: '2026-03-29' })
  assert.deepEqual(rangeOf('week', '2026-10-25'), { from: '2026-10-19', to: '2026-10-25' })
  assert.deepEqual(rangeOf('month', '2026-02-14'), { from: '2026-02-01', to: '2026-02-28' })
  assert.deepEqual(rangeOf('month', '2028-02-14'), { from: '2028-02-01', to: '2028-02-29' })
  assert.deepEqual(rangeOf('month', '2026-04-30'), { from: '2026-04-01', to: '2026-04-30' })
  assert.deepEqual(rangeOf('month', '2026-12-31'), { from: '2026-12-01', to: '2026-12-31' })
})

test('datesOf and windowHolds', () => {
  assert.deepEqual(datesOf({ from: '2026-12-30', to: '2027-01-02' }), [
    '2026-12-30',
    '2026-12-31',
    '2027-01-01',
    '2027-01-02',
  ])
  assert.equal(datesOf(rangeOf('week', '2026-10-25')).length, 7)
  const week = rangeOf('week', '2026-11-26')
  assert.equal(windowHolds(week, '2026-11-23'), true)
  assert.equal(windowHolds(week, '2026-11-29'), true)
  assert.equal(windowHolds(week, '2026-11-30'), false)
  assert.equal(windowHolds(week, '2026-11-22'), false)
})

test('shiftRange: a day, a week on the same weekday, a month on the same day clamped to its end', () => {
  assert.equal(shiftRange('day', '2026-12-31', 1), '2027-01-01')
  assert.equal(shiftRange('day', '2026-03-01', -1), '2026-02-28')
  assert.equal(shiftRange('week', '2026-11-26', 1), '2026-12-03')
  assert.equal(shiftRange('week', '2026-01-02', -1), '2025-12-26')
  assert.equal(shiftRange('month', '2026-01-31', 1), '2026-02-28')
  assert.equal(shiftRange('month', '2028-01-31', 1), '2028-02-29')
  assert.equal(shiftRange('month', '2026-03-31', -1), '2026-02-28')
  assert.equal(shiftRange('month', '2026-12-15', 1), '2027-01-15')
  assert.equal(shiftRange('month', '2026-01-05', -1), '2025-12-05')
})

test('canShiftRange: an arrow stops where the next range leaves the readable window', () => {
  const limits = { min: '2026-10-01', max: '2027-11-30' }
  assert.equal(canShiftRange('day', '2026-10-02', -1, limits), true)
  assert.equal(canShiftRange('day', '2026-10-01', -1, limits), false)
  // The week of 1 October 2026 starts in September; its previous week ends on 27 September.
  assert.equal(canShiftRange('week', '2026-10-01', -1, limits), false)
  assert.equal(canShiftRange('week', '2026-10-08', -1, limits), true)
  assert.equal(canShiftRange('month', '2026-10-15', -1, limits), false)
  assert.equal(canShiftRange('month', '2027-11-15', 1, limits), false)
  assert.equal(canShiftRange('month', '2027-10-15', 1, limits), true)
  assert.equal(canShiftRange('day', '2027-11-30', 1, limits), false)
  assert.equal(canShiftRange('week', '2027-11-24', 1, limits), true)
  assert.equal(canShiftRange('day', '2020-01-01', -1), true)
  assert.equal(canShiftRange('day', '2020-01-01', 1, { min: null, max: null }), true)
})

test('clampToWindow and readableRange keep a range inside the readable window', () => {
  const limits = { min: '2026-10-01', max: '2027-11-30' }
  assert.equal(clampToWindow('2026-09-15', limits), '2026-10-01')
  assert.equal(clampToWindow('2028-01-01', limits), '2027-11-30')
  assert.equal(clampToWindow('2026-12-01', limits), '2026-12-01')
  assert.equal(clampToWindow('2026-12-01'), '2026-12-01')
  assert.deepEqual(readableRange({ from: '2026-09-28', to: '2026-10-04' }, limits), {
    from: '2026-10-01',
    to: '2026-10-04',
  })
  assert.deepEqual(readableRange({ from: '2027-11-29', to: '2027-12-05' }, limits), {
    from: '2027-11-29',
    to: '2027-11-30',
  })
  assert.deepEqual(readableRange({ from: '2026-11-23', to: '2026-11-29' }), { from: '2026-11-23', to: '2026-11-29' })
})

test('formatRangeLabel: the day, the week (across months and years) and the month in pl and en', () => {
  assert.equal(formatRangeLabel('day', '2026-11-25', 'pl'), 'środa, 25 listopada')
  assert.equal(formatRangeLabel('day', '2026-11-25', 'en-US'), 'Wednesday, November 25')
  assert.equal(formatRangeLabel('week', '2026-11-26', 'pl'), '23–29 listopada')
  // ICU writes thin spaces around the dash of an English range.
  assert.match(formatRangeLabel('week', '2026-11-26', 'en-US'), /^November 23\s–\s29$/u)
  assert.match(formatRangeLabel('week', '2026-12-02', 'pl'), /^30 listopada\s–\s6 grudnia$/u)
  assert.match(formatRangeLabel('week', '2027-01-01', 'pl'), /^28 grudnia 2026\s–\s3 stycznia 2027$/u)
  assert.equal(formatRangeLabel('month', '2026-11-26', 'pl'), 'listopad 2026')
  assert.equal(formatRangeLabel('month', '2026-11-26', 'en-US'), 'November 2026')
})

test('calendarRangeHref keeps the other parameters, sets the view and drops the replaced ones', () => {
  assert.equal(calendarRangeHref('/club/calendar', '', 'day', '2026-11-26'), '/club/calendar?range=day&date=2026-11-26')
  assert.equal(
    calendarRangeHref('/p/club/places/pitch', params('month=2026-11&x=1'), 'week', '2026-11-26', ['month']),
    '/p/club/places/pitch?x=1&range=week&date=2026-11-26',
  )
  assert.equal(
    calendarRangeHref('/backend/facilities/calendar', 'place=p1&range=day&date=2026-11-01', 'month', '2026-12-01'),
    '/backend/facilities/calendar?place=p1&range=month&date=2026-12-01',
  )
})

test('mediaQueryStore: subscribes to the query and reads it; without a window the page is wide', () => {
  const events = []
  const target = {
    matchMedia(query) {
      return {
        matches: query === WIDE_CALENDAR_QUERY,
        addEventListener: (type, listener) => events.push(['add', type, listener]),
        removeEventListener: (type, listener) => events.push(['remove', type, listener]),
      }
    },
  }
  const onChange = () => undefined
  const store = mediaQueryStore(WIDE_CALENDAR_QUERY, target)
  assert.equal(store.getSnapshot(), true)
  assert.equal(mediaQueryStore('(min-width: 1px)', target).getSnapshot(), false)
  const unsubscribe = store.subscribe(onChange)
  unsubscribe()
  assert.deepEqual(events, [
    ['add', 'change', onChange],
    ['remove', 'change', onChange],
  ])
  const serverStore = mediaQueryStore(WIDE_CALENDAR_QUERY, undefined)
  assert.equal(serverStore.getSnapshot(), true)
  assert.equal(serverStore.subscribe(onChange)(), undefined)
})
