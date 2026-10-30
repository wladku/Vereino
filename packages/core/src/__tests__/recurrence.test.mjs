// TEST-G01 (foundation II): the RRULE subset, its expansion at the club's wall time across both DST shifts of
// `Europe/Warsaw`, the `WKST=MO` anchoring, the inclusive `UNTIL`, `COUNT` before exceptions and the series-edit plan.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  Recurrence,
  WEEKDAYS,
  addCalendarDays,
  calendarDaysBetween,
  expandOccurrences,
  isLocalTime,
  mondayOf,
  normalizeLocalTime,
  occurrenceDates,
  seriesEditPlan,
  sessionInstants,
  weekdayOf,
  zonedInstant,
} from '../recurrence.ts'

const WARSAW = 'Europe/Warsaw'

function rule(text, exdates) {
  const result = Recurrence.parse(text, exdates)
  assert.equal(result.ok, true, JSON.stringify(result))
  return result.value
}

function failure(text, exdates) {
  const result = Recurrence.parse(text, exdates)
  assert.equal(result.ok, false)
  return result.error
}

test('parses the supported subset with defaults, prefixes, exceptions and case-insensitive names', () => {
  assert.deepEqual(rule('FREQ=WEEKLY;BYDAY=TU;UNTIL=20270630'), {
    freq: 'WEEKLY',
    interval: 1,
    byDay: ['TU'],
    until: '2027-06-30',
    count: null,
    exdates: [],
  })
  assert.deepEqual(
    rule('RRULE:freq=weekly;interval=2;byday=we,mo,,we;count=10;wkst=mo;\n\nEXDATE;VALUE=DATE:20261111,20261104', [
      '2026-11-04',
      '2026-12-02',
    ]),
    {
      freq: 'WEEKLY',
      interval: 2,
      byDay: ['MO', 'WE'],
      until: null,
      count: 10,
      exdates: ['2026-11-04', '2026-11-11', '2026-12-02'],
    },
  )
  assert.deepEqual(rule('FREQ=WEEKLY;BYDAY=SA\nEXDATE:20261107,').exdates, ['2026-11-07'])
  assert.deepEqual(WEEKDAYS, ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'])
})

test('names the part a rule uses outside the subset', () => {
  assert.deepEqual(failure('FREQ=MONTHLY;BYMONTHDAY=1'), { code: 'recurrence_unsupported', part: 'FREQ=MONTHLY' })
  assert.deepEqual(failure('FREQ=WEEKLY;BYDAY=MO;BYMONTHDAY=1'), {
    code: 'recurrence_unsupported',
    part: 'BYMONTHDAY',
  })
  assert.deepEqual(failure('FREQ=WEEKLY;BYDAY=MO;WKST=SU'), { code: 'recurrence_unsupported', part: 'WKST=SU' })
  assert.deepEqual(failure('FREQ=WEEKLY;BYDAY=1MO'), { code: 'recurrence_unsupported', part: 'BYDAY' })
  assert.deepEqual(failure('DTSTART:20260101T170000\nFREQ=WEEKLY;BYDAY=MO'), {
    code: 'recurrence_unsupported',
    part: 'DTSTART',
  })
})

test('refuses malformed values with their reason', () => {
  const reason = (text, exdates) => failure(text, exdates).reason
  assert.equal(reason('FREQ'), 'malformed')
  assert.equal(reason('=WEEKLY'), 'malformed')
  assert.equal(reason('FREQ=WEEKLY;FREQ=WEEKLY'), 'duplicate_part')
  assert.equal(reason('BYDAY=MO'), 'freq_missing')
  assert.equal(reason('FREQ=WEEKLY;BYDAY=MO;INTERVAL=0'), 'interval')
  assert.equal(reason('FREQ=WEEKLY;BYDAY=MO;INTERVAL=53'), 'interval')
  assert.equal(reason('FREQ=WEEKLY;BYDAY=MO;COUNT=x'), 'count')
  assert.equal(reason('FREQ=WEEKLY;BYDAY=MO;COUNT=1001'), 'count')
  assert.equal(reason('FREQ=WEEKLY;BYDAY=MO;UNTIL=2027-06-30'), 'until')
  assert.equal(reason('FREQ=WEEKLY;BYDAY=MO;UNTIL=20270230'), 'until')
  assert.equal(reason('FREQ=WEEKLY;BYDAY=MO;UNTIL=20270630;COUNT=3'), 'until_and_count')
  assert.equal(reason('FREQ=WEEKLY;BYDAY=XX'), 'byday')
  assert.equal(reason('FREQ=WEEKLY'), 'byday_empty')
  assert.equal(reason('FREQ=WEEKLY;BYDAY=,'), 'byday_empty')
  assert.equal(reason('FREQ=WEEKLY;BYDAY=MO\nEXDATE:2026-11-11'), 'exdate')
  assert.equal(reason('FREQ=WEEKLY;BYDAY=MO', ['11.11.2026']), 'exdate')
})

test('serialises to the standard text and round-trips', () => {
  const plain = rule('FREQ=WEEKLY;BYDAY=TU;UNTIL=20270630')
  assert.deepEqual(Recurrence.serialize(plain), { rrule: 'FREQ=WEEKLY;BYDAY=TU;UNTIL=20270630', exdates: null })
  assert.equal(Recurrence.toText(plain), 'FREQ=WEEKLY;BYDAY=TU;UNTIL=20270630')
  const full = rule('FREQ=WEEKLY;INTERVAL=2;BYDAY=WE,MO;COUNT=6', ['2026-11-11'])
  assert.equal(Recurrence.toText(full), 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;COUNT=6\nEXDATE:20261111')
  assert.deepEqual(rule(Recurrence.toText(full)), full)
  assert.deepEqual(rule(Recurrence.toText(plain)), plain)
})

test('checkStart refuses an end before the first day', () => {
  const until = rule('FREQ=WEEKLY;BYDAY=TU;UNTIL=20270630')
  assert.equal(Recurrence.checkStart(until, '2027-06-30'), null)
  assert.deepEqual(Recurrence.checkStart(until, '2027-07-01'), {
    code: 'recurrence_invalid',
    reason: 'until_before_start',
  })
  assert.equal(Recurrence.checkStart(rule('FREQ=WEEKLY;BYDAY=TU'), '2099-01-01'), null)
})

test('calendar arithmetic is independent of the host zone', () => {
  assert.equal(addCalendarDays('2026-03-28', 2), '2026-03-30')
  assert.equal(addCalendarDays('2026-01-01', -1), '2025-12-31')
  assert.equal(calendarDaysBetween('2026-03-28', '2026-03-30'), 2)
  assert.equal(calendarDaysBetween('2026-10-27', '2026-10-25'), -2)
  assert.equal(weekdayOf('2026-10-27'), 'TU')
  assert.equal(weekdayOf('2026-11-01'), 'SU')
  assert.equal(mondayOf('2026-11-01'), '2026-10-26')
  assert.equal(mondayOf('2026-10-26'), '2026-10-26')
})

test('local times are validated and normalised to seconds', () => {
  assert.equal(isLocalTime('17:00'), true)
  assert.equal(isLocalTime('17:00:30'), true)
  assert.equal(isLocalTime('24:00'), false)
  assert.equal(isLocalTime(1700), false)
  assert.equal(normalizeLocalTime('7:00'.padStart(5, '0')), '07:00:00')
  assert.equal(normalizeLocalTime('18:30:15'), '18:30:15')
  assert.throws(() => normalizeLocalTime('5 pm'), { name: 'RangeError' })
})

test('wall time stays at 17:00 across both DST shifts and the spring gap moves forward', () => {
  assert.equal(zonedInstant('2026-03-28', '17:00', WARSAW).toISOString(), '2026-03-28T16:00:00.000Z')
  assert.equal(zonedInstant('2026-03-29', '17:00', WARSAW).toISOString(), '2026-03-29T15:00:00.000Z')
  assert.equal(zonedInstant('2026-10-24', '17:00', WARSAW).toISOString(), '2026-10-24T15:00:00.000Z')
  assert.equal(zonedInstant('2026-10-25', '17:00', WARSAW).toISOString(), '2026-10-25T16:00:00.000Z')
  // 02:30 does not exist on 29 March 2026 in Warsaw: it becomes 03:30 CEST.
  assert.equal(zonedInstant('2026-03-29', '02:30', WARSAW).toISOString(), '2026-03-29T01:30:00.000Z')
  // 02:30 exists twice on 25 October 2026; its first occurrence (CEST) is used (RFC 5545 §3.3.5).
  assert.equal(zonedInstant('2026-10-25', '02:30:00', WARSAW).toISOString(), '2026-10-25T00:30:00.000Z')
})

test('weekly Tuesday sessions until an inclusive end, at the club wall time across the spring shift', () => {
  const tuesdays = rule('FREQ=WEEKLY;BYDAY=TU;UNTIL=20260407')
  const sessions = expandOccurrences(
    tuesdays,
    { startsOn: '2026-03-17', startTime: '17:00', endTime: '18:30', timeZone: WARSAW },
    { from: '2026-03-01', to: '2026-12-31' },
  )
  assert.deepEqual(
    sessions.map((session) => [session.date, session.startAt.toISOString(), session.endAt.toISOString()]),
    [
      ['2026-03-17', '2026-03-17T16:00:00.000Z', '2026-03-17T17:30:00.000Z'],
      ['2026-03-24', '2026-03-24T16:00:00.000Z', '2026-03-24T17:30:00.000Z'],
      ['2026-03-31', '2026-03-31T15:00:00.000Z', '2026-03-31T16:30:00.000Z'],
      ['2026-04-07', '2026-04-07T15:00:00.000Z', '2026-04-07T16:30:00.000Z'],
    ],
  )
})

test('every second week anchors on the Monday of the first day and is clipped to the window', () => {
  // Starts on a Wednesday: its week (Monday 2026-10-26) is week 0, so Monday 2026-10-26 is before the start and
  // Monday 2026-11-02 is in an odd week.
  const biweekly = rule('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE')
  assert.deepEqual(occurrenceDates(biweekly, '2026-10-28', { from: '2026-10-01', to: '2026-11-25' }), [
    '2026-10-28',
    '2026-11-09',
    '2026-11-11',
    '2026-11-23',
    '2026-11-25',
  ])
  assert.deepEqual(occurrenceDates(biweekly, '2026-10-28', { from: '2026-11-10', to: '2026-11-24' }), [
    '2026-11-11',
    '2026-11-23',
  ])
  assert.deepEqual(occurrenceDates(biweekly, '2026-10-28', { from: '2026-11-10', to: '2026-11-01' }), [])
})

test('COUNT counts instances before exceptions are removed', () => {
  const counted = rule('FREQ=WEEKLY;BYDAY=MO;COUNT=3', ['2026-11-09'])
  assert.deepEqual(occurrenceDates(counted, '2026-11-02', { from: '2026-11-01', to: '2027-12-31' }), [
    '2026-11-02',
    '2026-11-16',
  ])
})

test('an end time not after the start time ends on the next day', () => {
  const overnight = sessionInstants('2026-12-31', '22:00', '01:00', WARSAW)
  assert.equal(overnight.startAt.toISOString(), '2026-12-31T21:00:00.000Z')
  assert.equal(overnight.endAt.toISOString(), '2027-01-01T00:00:00.000Z')
})

test('a series edit keeps past, detached and pinned sessions and upserts or removes the rest', () => {
  const tuesdays = rule('FREQ=WEEKLY;BYDAY=TU')
  const generated = expandOccurrences(
    tuesdays,
    { startsOn: '2026-11-03', startTime: '17:30', endTime: '19:00', timeZone: WARSAW },
    { from: '2026-11-03', to: '2026-12-08' },
  )
  const existing = [
    { id: 'past', date: '2026-11-03', isDetached: false, pinned: false },
    { id: 'moved', date: '2026-11-17', isDetached: true, pinned: false },
    { id: 'cancelled', date: '2026-11-24', isDetached: false, pinned: true },
    { id: 'plain', date: '2026-12-01', isDetached: false, pinned: false },
    { id: 'dropped', date: '2026-12-03', isDetached: false, pinned: false },
    { id: 'duplicate', date: '2026-12-01', isDetached: false, pinned: false },
  ]
  const plan = seriesEditPlan(existing, generated, '2026-11-10')
  assert.deepEqual(
    plan.keep.map((session) => session.id),
    ['past', 'moved', 'cancelled'],
  )
  assert.deepEqual(
    plan.upsert.map((entry) => [entry.occurrence.date, entry.existing?.id ?? null]),
    [
      ['2026-11-10', null],
      ['2026-12-01', 'plain'],
      ['2026-12-08', null],
    ],
  )
  assert.equal(plan.upsert[1]?.occurrence.startAt.toISOString(), '2026-12-01T16:30:00.000Z')
  assert.deepEqual(
    plan.remove.map((session) => session.id),
    ['dropped', 'duplicate'],
  )
})
