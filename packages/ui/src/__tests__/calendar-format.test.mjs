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
  formatClockTime,
  formatTimeRange,
  SECTION_MARKER_COLORS,
  sectionMarkerColors,
  sectionMarkerSlot,
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

test('a gathering time renders HH:mm with a 24-hour clock in the club zone (club spec DD-43)', () => {
  const at = new Date('2026-11-03T15:15:00Z')
  assert.equal(formatClockTime(at, 'pl', 'Europe/Warsaw'), '16:15')
  assert.equal(formatClockTime(at, 'en-US', 'Europe/Warsaw'), '16:15')
  assert.equal(formatClockTime(at, 'en-US', 'UTC'), '15:15')
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

test('a section prefers a stable palette slot derived from its id', () => {
  assert.equal(SECTION_MARKER_COLORS.length, 9)
  assert.equal(SECTION_MARKER_COLORS.includes('gray'), false)
  const slot = sectionMarkerSlot('6f1c2d3e-0000-4000-8000-000000000001')
  assert.equal(sectionMarkerSlot('6f1c2d3e-0000-4000-8000-000000000001'), slot)
  assert.ok(Number.isInteger(slot) && slot >= 0 && slot < SECTION_MARKER_COLORS.length)
  assert.equal(sectionMarkerSlot(''), 0x811c9dc5 % SECTION_MARKER_COLORS.length)
})

/** Ids whose preferred slots are the given ones (found by search, so the test does not hard-code hash values). */
function idsWithSlot(slot, count) {
  const ids = []
  for (let index = 0; ids.length < count; index += 1)
    if (sectionMarkerSlot(`section-${index}`) === slot) ids.push(`section-${index}`)
  return ids
}

test('sections on screen keep their preferred colour, and a clash moves the later id to the next free colour', () => {
  const [first, second] = idsWithSlot(SECTION_MARKER_COLORS.length - 1, 2)
  const alone = sectionMarkerColors([second])
  assert.equal(alone.get(second), SECTION_MARKER_COLORS.at(-1))
  const together = sectionMarkerColors([second, first, second])
  assert.equal(together.size, 2)
  const [earlier, later] = [first, second].sort((a, b) => a.localeCompare(b))
  assert.equal(together.get(earlier), SECTION_MARKER_COLORS.at(-1))
  // The palette wraps around: the next free slot after the last one is the first.
  assert.equal(together.get(later), SECTION_MARKER_COLORS[0])
  assert.deepEqual([...sectionMarkerColors([]).entries()], [])
})

test('every section gets a distinct colour up to the palette size, and the colours repeat beyond it', () => {
  const ids = Array.from({ length: SECTION_MARKER_COLORS.length }, (_, index) => `s-${index}`)
  const colors = sectionMarkerColors(ids)
  assert.equal(new Set(colors.values()).size, SECTION_MARKER_COLORS.length)
  const extra = sectionMarkerColors([...ids, 's-extra'])
  assert.equal(extra.size, SECTION_MARKER_COLORS.length + 1)
  assert.equal(extra.get('s-extra'), SECTION_MARKER_COLORS[sectionMarkerSlot('s-extra')])
})
