import { describe, expect, it } from '@jest/globals'
import {
  PAST_EVENT_DAYS,
  PUBLIC_EVENTS_LIMIT,
  pastEventsFrom,
  publicEventLists,
  publicMapUrl,
  type PublicEventActivityRow,
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
    })
    expect(lists.upcoming[1]).toMatchObject({ place: null, mapUrl: null })
    expect(lists.upcoming[2]).toMatchObject({ type: 'sparring', sectionSlug: 'basen', mapUrl: null })
    expect(lists.past[0]).toMatchObject({ past: true, cancelled: true })
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
