import { describe, expect, it } from '@jest/globals'
import {
  UPCOMING_EVENTS,
  UPCOMING_SESSIONS,
  publicEventsBlock,
  publicScheduleBlock,
  publicSession,
  seriesWeekdays,
  shortTime,
  type PublicSeriesRow,
  type PublicSessionRow,
} from '../public-schedule'

const ZONE = 'Europe/Warsaw'
const places = new Map([['pool', 'Pływalnia miejska']])

const series = (overrides: Partial<PublicSeriesRow>): PublicSeriesRow => ({
  id: 'a1',
  groupId: 'g1',
  recurrenceRule: 'FREQ=WEEKLY;BYDAY=TH,TU',
  defaultStartTime: '17:00:00',
  defaultEndTime: '18:00:00',
  defaultPlaceId: 'pool',
  ...overrides,
})

// 17:00–18:00 in Warsaw (CET, UTC+1) in November.
const session = (date: string, overrides: Partial<PublicSessionRow> = {}): PublicSessionRow => ({
  activityId: 'a1',
  groupId: 'g1',
  startAt: new Date(`${date}T16:00:00Z`),
  endAt: new Date(`${date}T17:00:00Z`),
  placeId: 'pool',
  status: 'planned',
  ...overrides,
})

describe('shortTime and seriesWeekdays', () => {
  it('shortens a stored time to hours and minutes', () => {
    expect(shortTime('17:00:00')).toBe('17:00')
  })

  it('reads the weekdays of a rule in week order', () => {
    expect(seriesWeekdays('FREQ=WEEKLY;BYDAY=TH,TU\nEXDATE:20261110')).toEqual(['TU', 'TH'])
  })

  it('has no weekdays for a one-off activity or an unreadable rule', () => {
    expect(seriesWeekdays(null)).toEqual([])
    expect(seriesWeekdays('FREQ=DAILY')).toEqual([])
  })
})

describe('publicSession', () => {
  it('shows the club-zone date, times and place and marks a cancelled session', () => {
    expect(publicSession(session('2026-11-10', { status: 'cancelled' }), places, ZONE)).toEqual({
      date: '2026-11-10',
      startTime: '17:00',
      endTime: '18:00',
      place: 'Pływalnia miejska',
      cancelled: true,
    })
    expect(publicSession(session('2026-11-12', { placeId: 'gone' }), places, ZONE)).toMatchObject({
      place: null,
      cancelled: false,
    })
  })
})

describe('publicScheduleBlock', () => {
  it('shows the days, times and place of each series and the next three sessions with a cancellation', () => {
    const sessions = ['2026-11-10', '2026-11-12', '2026-11-17', '2026-11-19'].map((date, index) =>
      session(date, { status: index === 1 ? 'cancelled' : 'planned' }),
    )
    const block = publicScheduleBlock(
      ['g1'],
      [series({}), series({ id: 'a2', recurrenceRule: 'FREQ=WEEKLY;BYDAY=MO', defaultPlaceId: 'gone' })],
      sessions,
      places,
      ZONE,
    )
    expect(block?.groups).toHaveLength(1)
    expect(block?.groups[0].series).toEqual([
      { weekdays: ['MO'], startTime: '17:00', endTime: '18:00', place: null },
      { weekdays: ['TU', 'TH'], startTime: '17:00', endTime: '18:00', place: 'Pływalnia miejska' },
    ])
    expect(block?.groups[0].upcoming.map((item) => [item.date, item.cancelled])).toEqual([
      ['2026-11-10', false],
      ['2026-11-12', true],
      ['2026-11-17', false],
    ])
    expect(block?.groups[0].upcoming).toHaveLength(UPCOMING_SESSIONS)
  })

  it('orders two series on the same first day by their start time', () => {
    const block = publicScheduleBlock(
      ['g1'],
      [series({ defaultStartTime: '18:00:00' }), series({ id: 'a2', recurrenceRule: 'FREQ=WEEKLY;BYDAY=TU' })],
      [],
      places,
      ZONE,
    )
    expect(block?.groups[0].series.map((item) => item.startTime)).toEqual(['17:00', '18:00'])
  })

  it('leaves out a group with neither series nor sessions, and the block without any group', () => {
    const block = publicScheduleBlock(
      ['g1', 'g2'],
      [series({ recurrenceRule: null })],
      [session('2026-11-10')],
      places,
      ZONE,
    )
    expect(block?.groups.map((item) => item.groupId)).toEqual(['g1'])
    expect(block?.groups[0].series).toEqual([])
    expect(publicScheduleBlock(['g2'], [series({})], [], places, ZONE)).toBeNull()
  })
})

describe('publicEventsBlock', () => {
  const sections = new Map([['s1', { name: 'Basen', slug: 'basen' }]])

  it('lists the upcoming events of public sections with their date, place, section and type', () => {
    const block = publicEventsBlock(
      [
        { id: 'e1', name: 'Zawody', type: 'tournament', sectionId: 's1' },
        { id: 'e2', name: 'Ukryte', type: 'other', sectionId: 's-private' },
      ],
      [
        session('2026-11-14', { activityId: 'e1' }),
        session('2026-11-15', { activityId: 'e2' }),
        session('2026-11-16', { activityId: 'gone' }),
      ],
      sections,
      places,
      ZONE,
    )
    expect(block).toEqual({
      events: [
        {
          name: 'Zawody',
          type: 'tournament',
          section: { name: 'Basen', slug: 'basen' },
          date: '2026-11-14',
          startTime: '17:00',
          endTime: '18:00',
          place: 'Pływalnia miejska',
          cancelled: false,
        },
      ],
    })
  })

  it('caps the list and is null without events', () => {
    const many = Array.from({ length: UPCOMING_EVENTS + 2 }, (_, index) => ({
      id: `e${String(index)}`,
      name: `Event ${String(index)}`,
      type: 'other',
      sectionId: 's1',
    }))
    const block = publicEventsBlock(
      many,
      many.map((event) => session('2026-11-14', { activityId: event.id })),
      sections,
      places,
      ZONE,
    )
    expect(block?.events).toHaveLength(UPCOMING_EVENTS)
    expect(publicEventsBlock([], [], sections, places, ZONE)).toBeNull()
  })
})
