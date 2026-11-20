import { describe, expect, it } from '@jest/globals'
import {
  PAST_EVENT_DAYS,
  PUBLIC_EVENTS_LIMIT,
  pastEventsFrom,
  publicClubEventItems,
  publicEventLists,
  publicMapUrl,
  withClubEvents,
  type PublicClubEventEntryInput,
  type PublicClubEventRow,
  type PublicClubEventSpan,
  type PublicEventActivityRow,
  type PublicEventItem,
  type PublicEventPlace,
} from '../public-events'
import type { PublicSessionRow } from '../public-schedule'

const ZONE = 'Europe/Warsaw'
const TODAY = '2026-11-16'

const hall: PublicEventPlace = { name: 'Hala', isExternal: false, address: 'ul. Sportowa 1', geoLat: 1, geoLng: 2 }
const away: PublicEventPlace = { name: 'Stadion Orła', isExternal: true, address: null, geoLat: 52.1, geoLng: 21 }
const places = new Map([
  ['hall', hall],
  ['away', away],
])
const sections = new Map([
  ['s1', 'pilka'],
  ['s2', 'basen'],
])

const event = (id: string, sectionId = 's1', type = 'tournament'): PublicEventActivityRow => ({
  id,
  name: `Event ${id}`,
  type,
  sectionId,
})

// 09:00–13:00 in Warsaw (CET, UTC+1) in winter; `endDate` moves the end for a camp.
const session = (activityId: string, date: string, overrides: Partial<PublicSessionRow> = {}): PublicSessionRow => ({
  activityId,
  groupId: 'g1',
  startAt: new Date(`${date}T08:00:00Z`),
  endAt: new Date(`${date}T12:00:00Z`),
  placeId: 'hall',
  status: 'planned',
  ...overrides,
})

describe('pastEventsFrom', () => {
  it('reaches 60 days back from the club day', () => {
    expect(PAST_EVENT_DAYS).toBe(60)
    expect(pastEventsFrom(TODAY)).toBe('2026-09-17')
  })
})

describe('publicMapUrl', () => {
  it('links the pin of an external venue', () => {
    expect(publicMapUrl(away)).toBe('https://www.openstreetmap.org/?mlat=52.1&mlon=21#map=17/52.1/21')
  })

  it('searches the address of an external venue without a pin', () => {
    expect(publicMapUrl({ ...away, geoLat: null, address: ' ul. Polna 3, Łódź ' })).toBe(
      'https://www.openstreetmap.org/search?query=ul.%20Polna%203%2C%20%C5%81%C3%B3d%C5%BA',
    )
    expect(publicMapUrl({ ...away, geoLng: null, address: '  ' })).toBeNull()
    expect(publicMapUrl({ ...away, geoLat: null, address: null })).toBeNull()
  })

  it('has no link for a club place', () => {
    expect(publicMapUrl(hall)).toBeNull()
  })
})

describe('publicEventLists', () => {
  it('splits upcoming and past events and drops those older than 60 days', () => {
    const lists = publicEventLists(
      [event('old'), event('past30'), event('past10'), event('today'), event('next'), event('swim', 's2', 'sparring')],
      [
        session('old', '2026-08-18'),
        session('past30', '2026-10-17'),
        session('past10', '2026-11-06', { status: 'cancelled' }),
        session('today', TODAY, { placeId: 'away' }),
        session('next', '2026-11-23', { placeId: 'gone' }),
        session('swim', '2026-11-24'),
      ],
      sections,
      places,
      ZONE,
      TODAY,
    )
    expect(lists.upcoming.map((item) => item.name)).toEqual(['Event today', 'Event next', 'Event swim'])
    expect(lists.past.map((item) => item.name)).toEqual(['Event past10', 'Event past30'])
    expect(lists.upcoming[0]).toEqual({
      kind: 'event',
      name: 'Event today',
      type: 'tournament',
      date: TODAY,
      endDate: TODAY,
      startTime: '09:00',
      endTime: '13:00',
      place: 'Stadion Orła',
      mapUrl: 'https://www.openstreetmap.org/?mlat=52.1&mlon=21#map=17/52.1/21',
      cancelled: false,
      past: false,
      sectionSlug: 'pilka',
      clubEventSlug: null,
      partsCount: null,
      posterFileId: null,
    })
    expect(lists.upcoming[1]).toMatchObject({ place: null, mapUrl: null })
    expect(lists.upcoming[2]).toMatchObject({ type: 'sparring', sectionSlug: 'basen', mapUrl: null })
    expect(lists.past[0]).toMatchObject({ past: true, cancelled: true })
  })

  it('names a typed venue and searches it on the map (#270)', () => {
    const venue = { name: 'Stadion Wisły Liszki', address: 'ul. Sportowa 1, Liszki' }
    const lists = publicEventLists(
      [event('away', 's1', 'sparring'), event('nowhere')],
      [session('away', '2026-11-20', { placeId: null, venue }), session('nowhere', '2026-11-21', { placeId: null })],
      sections,
      places,
      ZONE,
      TODAY,
    )
    expect(lists.upcoming[0]).toMatchObject({
      place: 'Stadion Wisły Liszki',
      mapUrl:
        'https://www.openstreetmap.org/search?query=Stadion%20Wis%C5%82y%20Liszki%2C%20ul.%20Sportowa%201%2C%20Liszki',
    })
    expect(lists.upcoming[1]).toMatchObject({ place: null, mapUrl: null })
  })

  it('keeps a camp that started before today and ends later among the upcoming ones', () => {
    const lists = publicEventLists(
      [event('camp', 's1', 'camp')],
      [session('camp', '2026-11-14', { endAt: new Date('2026-11-18T12:00:00Z') })],
      sections,
      places,
      ZONE,
      TODAY,
    )
    expect(lists.past).toEqual([])
    expect(lists.upcoming[0]).toMatchObject({ date: '2026-11-14', endDate: '2026-11-18', past: false })
  })

  it('leaves out events of other sections, unknown events and a second session of the same event', () => {
    const lists = publicEventLists(
      [event('mine'), event('hidden', 's-private')],
      [
        session('mine', '2026-11-20'),
        session('mine', '2026-11-21'),
        session('hidden', '2026-11-20'),
        session('gone', '2026-11-20'),
      ],
      sections,
      places,
      ZONE,
      TODAY,
    )
    expect(lists.upcoming.map((item) => [item.name, item.date])).toEqual([['Event mine', '2026-11-20']])
    expect(lists.past).toEqual([])
  })

  it('caps each list', () => {
    const many = Array.from({ length: PUBLIC_EVENTS_LIMIT + 1 }, (_, index) => event(`e${String(index)}`))
    const lists = publicEventLists(
      many,
      [...many.map((item) => session(item.id, '2026-11-01')), ...many.map((item) => session(item.id, '2026-11-20'))],
      sections,
      places,
      ZONE,
      TODAY,
    )
    expect(lists.past).toHaveLength(PUBLIC_EVENTS_LIMIT)
    expect(lists.upcoming).toEqual([])
    const future = publicEventLists(
      many,
      many.map((item) => session(item.id, '2026-11-20')),
      sections,
      places,
      ZONE,
      TODAY,
    )
    expect(future.upcoming).toHaveLength(PUBLIC_EVENTS_LIMIT)
  })
})

// --- Club events on P-06 (club events spec REQ-T10, DD-T12, TEST-T15; #381) ---

const clubEvent = (id: string, overrides: Partial<PublicClubEventRow> = {}): PublicClubEventRow => ({
  id,
  name: `Cup ${id}`,
  slug: `cup-${id}`,
  sectionId: 's1',
  placeId: 'away',
  status: 'planned',
  ...overrides,
})

// 09:00–13:00 in Warsaw on `date`.
const span = (clubEventId: string, date: string, groupId: string | null = 'g1'): PublicClubEventSpan => ({
  clubEventId,
  startAt: new Date(`${date}T08:00:00Z`),
  endAt: new Date(`${date}T12:00:00Z`),
  groupId,
})

const input = (overrides: Partial<PublicClubEventEntryInput>): PublicClubEventEntryInput => ({
  events: [],
  spans: [],
  posters: new Map(),
  sectionSlugs: sections,
  publicGroupIds: new Set(['g1']),
  filtered: false,
  places,
  timeZone: ZONE,
  today: TODAY,
  ...overrides,
})

describe('publicClubEventItems', () => {
  it('folds the parts of a club event into one entry with its span, place, parts count and poster', () => {
    const items = publicClubEventItems(
      input({
        events: [clubEvent('cup')],
        spans: [span('cup', '2026-11-21'), span('cup', '2026-11-29', null), span('cup', '2026-11-22', 'g-private')],
        posters: new Map([['cup', 'poster-1']]),
      }),
    )
    expect(items).toEqual([
      {
        kind: 'club_event',
        name: 'Cup cup',
        type: 'club_event',
        date: '2026-11-21',
        endDate: '2026-11-29',
        startTime: '09:00',
        endTime: '13:00',
        place: 'Stadion Orła',
        mapUrl: 'https://www.openstreetmap.org/?mlat=52.1&mlon=21#map=17/52.1/21',
        cancelled: false,
        past: false,
        sectionSlug: 'pilka',
        clubEventSlug: 'cup-cup',
        partsCount: 3,
        posterFileId: 'poster-1',
      },
    ])
  })

  it('leaves out an event without a part, has no map link for a club place and no place for an unknown one', () => {
    const items = publicClubEventItems(
      input({
        events: [clubEvent('empty'), clubEvent('home', { placeId: 'hall' }), clubEvent('gone', { placeId: 'nope' })],
        spans: [span('home', '2026-11-20'), span('gone', '2026-11-20')],
      }),
    )
    expect(items.map((item) => [item.clubEventSlug, item.place, item.mapUrl, item.posterFileId])).toEqual([
      ['cup-home', 'Hala', null, null],
      ['cup-gone', null, null, null],
    ])
  })

  it('flags a cancelled event and keeps a past one only while its first part started at most 60 days ago', () => {
    const items = publicClubEventItems(
      input({
        events: [clubEvent('cancelled', { status: 'cancelled' }), clubEvent('recent'), clubEvent('old')],
        spans: [
          span('cancelled', '2026-11-25'),
          span('recent', '2026-10-17'),
          span('recent', '2026-11-06'),
          span('old', '2026-09-07'),
          span('old', '2026-10-17'),
        ],
      }),
    )
    expect(items.map((item) => [item.clubEventSlug, item.cancelled, item.past])).toEqual([
      ['cup-cancelled', true, false],
      ['cup-recent', false, true],
    ])
  })

  it('gives a whole-club event and one of a section that is not public the club, unfiltered', () => {
    const items = publicClubEventItems(
      input({
        events: [clubEvent('club', { sectionId: null }), clubEvent('private', { sectionId: 's-private' })],
        spans: [span('club', '2026-11-20', null), span('private', '2026-11-21')],
      }),
    )
    expect(items.map((item) => [item.clubEventSlug, item.sectionSlug])).toEqual([
      ['cup-club', null],
      ['cup-private', null],
    ])
  })

  it('filtered to a section: its events, and a whole-club event only with a public group of it', () => {
    const items = publicClubEventItems(
      input({
        filtered: true,
        sectionSlugs: new Map([['s1', 'pilka']]),
        events: [
          clubEvent('mine'),
          clubEvent('other', { sectionId: 's2' }),
          clubEvent('club-with', { sectionId: null }),
          clubEvent('club-without', { sectionId: null }),
        ],
        spans: [
          span('mine', '2026-11-20'),
          span('other', '2026-11-20'),
          span('club-with', '2026-11-21', null),
          span('club-with', '2026-11-21', 'g1'),
          span('club-without', '2026-11-22', null),
          span('club-without', '2026-11-22', 'g-private'),
        ],
      }),
    )
    expect(items.map((item) => [item.clubEventSlug, item.sectionSlug])).toEqual([
      ['cup-mine', 'pilka'],
      ['cup-club-with', null],
    ])
  })
})

describe('withClubEvents', () => {
  const item = (name: string, date: string, startTime: string, past: boolean): PublicEventItem => ({
    kind: 'event',
    name,
    type: 'match',
    date,
    endDate: date,
    startTime,
    endTime: '20:00',
    place: null,
    mapUrl: null,
    cancelled: false,
    past,
    sectionSlug: 'pilka',
    clubEventSlug: null,
    partsCount: null,
    posterFileId: null,
  })

  it('merges upcoming soonest first and past newest first', () => {
    const lists = withClubEvents(
      { upcoming: [item('a', '2026-11-20', '10:00', false)], past: [item('p', '2026-11-10', '10:00', true)] },
      [
        { ...item('cup', '2026-11-20', '09:00', false), kind: 'club_event' },
        { ...item('old cup', '2026-11-12', '09:00', true), kind: 'club_event' },
        { ...item('later', '2026-11-21', '09:00', false), kind: 'club_event' },
        { ...item('oldest', '2026-11-01', '09:00', true), kind: 'club_event' },
      ],
    )
    expect(lists.upcoming.map((entry) => entry.name)).toEqual(['cup', 'a', 'later'])
    expect(lists.past.map((entry) => entry.name)).toEqual(['old cup', 'p', 'oldest'])
  })

  it('caps each list', () => {
    const many = Array.from({ length: PUBLIC_EVENTS_LIMIT }, (_, index) =>
      item(`e${String(index)}`, '2026-11-20', '10:00', false),
    )
    const lists = withClubEvents({ upcoming: many, past: [] }, [item('cup', '2026-11-19', '10:00', false)])
    expect(lists.upcoming).toHaveLength(PUBLIC_EVENTS_LIMIT)
    expect(lists.upcoming[0]?.name).toBe('cup')
  })
})
