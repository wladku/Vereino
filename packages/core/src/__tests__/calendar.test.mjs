// TEST-G06 (unit part, foundation II P-23): the shared calendar item, its day buckets and the served ranges.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  CALENDAR_RANGE_MAX_DAYS,
  calendarMonth,
  calendarRangeDays,
  calendarSections,
  calendarTodayAndTomorrow,
  calendarWeek,
  groupCalendarItemsByDay,
  isServedCalendarRange,
  isValidCalendarItem,
  trimCalendarRange,
  validCalendarItems,
} from '../calendar.ts'

const item = (id, startsAt, endsAt, extra = {}) => ({
  id,
  title: `Session ${id}`,
  startsAt: new Date(startsAt),
  endsAt: new Date(endsAt),
  status: 'planned',
  ...extra,
})

test('an item is valid only when both instants parse and it starts before it ends', () => {
  assert.equal(isValidCalendarItem(item('a', '2026-11-03T16:00:00Z', '2026-11-03T17:30:00Z')), true)
  assert.equal(isValidCalendarItem(item('b', '2026-11-03T17:30:00Z', '2026-11-03T17:30:00Z')), false)
  assert.equal(isValidCalendarItem(item('c', '2026-11-03T18:00:00Z', '2026-11-03T17:30:00Z')), false)
  assert.equal(isValidCalendarItem(item('d', 'not a date', '2026-11-03T17:30:00Z')), false)
  assert.equal(isValidCalendarItem(item('e', '2026-11-03T17:30:00Z', 'not a date')), false)
})

test('validCalendarItems keeps the valid items in start order and returns the dropped ones apart', () => {
  const later = item('later', '2026-11-03T18:00:00Z', '2026-11-03T19:00:00Z')
  const earlier = item('earlier', '2026-11-03T16:00:00Z', '2026-11-03T17:30:00Z')
  const sameStartB = item('b', '2026-11-03T16:00:00Z', '2026-11-03T16:45:00Z', { title: 'B class' })
  const sameStartA = item('a', '2026-11-03T16:00:00Z', '2026-11-03T16:45:00Z', { title: 'A class' })
  const invalid = item('x', '2026-11-03T18:00:00Z', '2026-11-03T17:00:00Z')
  const result = validCalendarItems([later, invalid, earlier, sameStartB, sameStartA])
  assert.deepEqual(
    result.items.map((entry) => entry.id),
    ['a', 'b', 'earlier', 'later'],
  )
  assert.deepEqual(result.dropped, [invalid])
})

test('groupCalendarItemsByDay buckets by the club-zone date of the start, oldest day first', () => {
  // 23:30 UTC on 3 November is 00:30 on 4 November in Warsaw: the item belongs to the 4th there.
  const lateEvening = item('late', '2026-11-03T23:30:00Z', '2026-11-04T00:30:00Z')
  const thursday = item('thu', '2026-11-05T15:00:00Z', '2026-11-05T15:45:00Z')
  const tuesday = item('tue', '2026-11-03T16:00:00Z', '2026-11-03T17:30:00Z')
  const days = groupCalendarItemsByDay([thursday, lateEvening, tuesday], 'Europe/Warsaw')
  assert.deepEqual(
    days.map((day) => [day.date, day.items.map((entry) => entry.id)]),
    [
      ['2026-11-03', ['tue']],
      ['2026-11-04', ['late']],
      ['2026-11-05', ['thu']],
    ],
  )
  assert.deepEqual(groupCalendarItemsByDay([lateEvening], 'UTC')[0].date, '2026-11-03')
  assert.deepEqual(groupCalendarItemsByDay([], 'Europe/Warsaw'), [])
})

test('a served range is ordered and at most 62 days long', () => {
  assert.equal(CALENDAR_RANGE_MAX_DAYS, 62)
  assert.equal(calendarRangeDays({ from: '2026-11-02', to: '2026-11-08' }), 7)
  assert.equal(calendarRangeDays({ from: '2026-11-02', to: '2026-11-02' }), 1)
  assert.equal(calendarRangeDays({ from: '2026-11-08', to: '2026-11-02' }), null)
  assert.equal(isServedCalendarRange({ from: '2026-11-02', to: '2027-01-02' }), true)
  assert.equal(isServedCalendarRange({ from: '2026-11-02', to: '2027-01-03' }), false)
  assert.equal(isServedCalendarRange({ from: '2026-11-08', to: '2026-11-02' }), false)
})

test('calendarWeek is the Monday–Sunday week of the day, moved by whole weeks', () => {
  assert.deepEqual(calendarWeek('2026-11-05'), { from: '2026-11-02', to: '2026-11-08' })
  assert.deepEqual(calendarWeek('2026-11-02'), { from: '2026-11-02', to: '2026-11-08' })
  assert.deepEqual(calendarWeek('2026-11-08'), { from: '2026-11-02', to: '2026-11-08' })
  assert.deepEqual(calendarWeek('2026-11-05', 1), { from: '2026-11-09', to: '2026-11-15' })
  assert.deepEqual(calendarWeek('2026-11-05', -1), { from: '2026-10-26', to: '2026-11-01' })
})

test('the Today tiles cover today and tomorrow', () => {
  assert.deepEqual(calendarTodayAndTomorrow('2026-12-31'), { from: '2026-12-31', to: '2027-01-01' })
})

test('calendarMonth is the calendar month of the day, moved by whole months across year ends and leap years', () => {
  assert.deepEqual(calendarMonth('2026-11-05'), { from: '2026-11-01', to: '2026-11-30' })
  assert.deepEqual(calendarMonth('2026-11-30', 1), { from: '2026-12-01', to: '2026-12-31' })
  assert.deepEqual(calendarMonth('2026-12-15', 1), { from: '2027-01-01', to: '2027-01-31' })
  assert.deepEqual(calendarMonth('2027-01-31', -2), { from: '2026-11-01', to: '2026-11-30' })
  assert.deepEqual(calendarMonth('2028-01-31', 1), { from: '2028-02-01', to: '2028-02-29' })
  assert.deepEqual(calendarMonth('2027-03-01', -1), { from: '2027-02-01', to: '2027-02-28' })
  // A month is always a served range.
  for (let offset = 0; offset < 12; offset += 1)
    assert.equal(isServedCalendarRange(calendarMonth('2026-01-10', offset)), true)
})

test('trimCalendarRange keeps a served range, cuts a longer one to 62 days from its start and swaps an inverted one', () => {
  assert.deepEqual(trimCalendarRange({ from: '2026-11-02', to: '2026-11-08' }), {
    from: '2026-11-02',
    to: '2026-11-08',
  })
  assert.deepEqual(trimCalendarRange({ from: '2026-11-02', to: '2027-01-02' }), {
    from: '2026-11-02',
    to: '2027-01-02',
  })
  const trimmed = trimCalendarRange({ from: '2026-11-02', to: '2027-02-28' })
  assert.deepEqual(trimmed, { from: '2026-11-02', to: '2027-01-02' })
  assert.equal(isServedCalendarRange(trimmed), true)
  assert.deepEqual(trimCalendarRange({ from: '2026-11-08', to: '2026-11-02' }), {
    from: '2026-11-02',
    to: '2026-11-08',
  })
  assert.deepEqual(trimCalendarRange({ from: '2026-11-02', to: '2026-11-30' }, 7), {
    from: '2026-11-02',
    to: '2026-11-08',
  })
})

test('calendarSections lists each section once, by label then id; items without a section add none', () => {
  const academy = { id: 's-academy', label: 'Akademia piłkarska' }
  const pool = { id: 's-pool', label: 'Basen' }
  const poolTwin = { id: 's-pool-2', label: 'Basen' }
  const items = [
    item('a', '2026-11-03T16:00:00Z', '2026-11-03T17:30:00Z', { section: pool }),
    item('b', '2026-11-04T16:00:00Z', '2026-11-04T17:30:00Z', { section: academy }),
    item('c', '2026-11-05T16:00:00Z', '2026-11-05T17:30:00Z', { section: pool }),
    item('d', '2026-11-06T16:00:00Z', '2026-11-06T17:30:00Z', { section: poolTwin }),
    item('e', '2026-11-07T16:00:00Z', '2026-11-07T17:30:00Z', { section: null }),
    item('f', '2026-11-07T16:00:00Z', '2026-11-07T17:30:00Z'),
  ]
  assert.deepEqual(calendarSections(items), [academy, pool, poolTwin])
  assert.deepEqual(calendarSections([]), [])
})
