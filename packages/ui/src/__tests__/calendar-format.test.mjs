// TEST-G06 (unit part, foundation II P-23): the member calendar's pure formatting and tone helpers.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  actionButtonVariant,
  badgeVariant,
  calendarItemTone,
  calendarStatusLabel,
  calendarTitleClassName,
  formatDayHeading,
  formatTimeRange,
} from '../member/calendar-format.ts'

test('the day heading shows weekday, day and month of the club-zone date in the reader locale', () => {
  assert.equal(formatDayHeading('2026-11-03', 'en-US'), 'Tuesday, November 3')
  assert.equal(formatDayHeading('2026-11-03', 'pl'), 'wtorek, 3 listopada')
  // The date is read as noon UTC, so no zone west or east of UTC moves it to another day.
  assert.equal(formatDayHeading('2026-01-01', 'en-US'), 'Thursday, January 1')
})

test('the time range renders HH:mm–HH:mm with a 24-hour clock in the club zone', () => {
  const startsAt = new Date('2026-11-03T16:00:00Z')
  const endsAt = new Date('2026-11-03T17:30:00Z')
  assert.equal(formatTimeRange(startsAt, endsAt, 'pl', 'Europe/Warsaw'), '17:00–18:30')
  assert.equal(formatTimeRange(startsAt, endsAt, 'en-US', 'Europe/Warsaw'), '17:00–18:30')
  assert.equal(formatTimeRange(startsAt, endsAt, 'en-US', 'UTC'), '16:00–17:30')
  // Summer time: the same wall time of a July session is one hour further from UTC.
  assert.equal(
    formatTimeRange(new Date('2026-07-07T15:00:00Z'), new Date('2026-07-07T16:30:00Z'), 'pl', 'Europe/Warsaw'),
    '17:00–18:30',
  )
})

test('the item tone follows the status (DD-G08)', () => {
  assert.deepEqual(calendarItemTone('planned'), { badge: 'neutral', muted: false, strike: false })
  assert.deepEqual(calendarItemTone('done'), { badge: 'success', muted: true, strike: false })
  assert.deepEqual(calendarItemTone('cancelled'), { badge: 'error', muted: false, strike: true })
})

test('core badge tones map onto the platform StatusBadge variants one to one', () => {
  for (const tone of ['neutral', 'info', 'success', 'warning', 'error']) assert.equal(badgeVariant(tone), tone)
})

test('action tones map onto Button variants: primary filled, destructive quiet, the rest outlined', () => {
  assert.equal(actionButtonVariant('primary'), 'default')
  assert.equal(actionButtonVariant('destructive'), 'destructive')
  assert.equal(actionButtonVariant('default'), 'outline')
  assert.equal(actionButtonVariant(undefined), 'outline')
})

test('the status badge label comes from the labels and a planned item has none', () => {
  const labels = { done: 'Done', cancelled: 'Cancelled' }
  assert.equal(calendarStatusLabel('done', labels), 'Done')
  assert.equal(calendarStatusLabel('cancelled', labels), 'Cancelled')
  assert.equal(calendarStatusLabel('planned', labels), null)
})

test('the title is struck through when cancelled and muted when done', () => {
  assert.equal(calendarTitleClassName(calendarItemTone('planned')), 'font-semibold')
  assert.equal(calendarTitleClassName(calendarItemTone('done')), 'font-semibold text-muted-foreground')
  assert.equal(calendarTitleClassName(calendarItemTone('cancelled')), 'font-semibold line-through')
})
