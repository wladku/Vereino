// TEST-G06 (unit part, foundation II P-23): the shared calendar item, its day buckets and the served ranges.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  CALENDAR_RANGE_MAX_DAYS,
  calendarRangeDays,
  calendarTodayAndTomorrow,
  calendarWeek,
  groupCalendarItemsByDay,
  isServedCalendarRange,
  isValidCalendarItem,
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
