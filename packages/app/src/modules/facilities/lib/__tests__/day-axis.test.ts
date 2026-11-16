import { describe, expect, it } from '@jest/globals'
import {
  AXIS_END,
  AXIS_START,
  axisBounds,
  axisHours,
  axisLength,
  axisOffset,
  bookableWindowsByDay,
  chipDates,
  freeOpenHours,
  isClosedDay,
  layoutLanes,
  maxLanes,
  type FreeHoursInput,
  type ZoneRuleLike,
} from '../day-axis'

const at = (time: string) => {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}
const span = (from: string, to: string) => ({ from: at(from), to: at(to) })

describe('axisBounds', () => {
  it('keeps 08:00–22:00 for a day inside it', () => {
    expect(axisBounds([span('09:00', '21:00')], [span('10:00', '11:30')])).toEqual({ from: AXIS_START, to: AXIS_END })
    expect(axisBounds(null, [])).toEqual({ from: AXIS_START, to: AXIS_END })
  })

  it('widens by whole hours to a 06:00 opening and an entry ending at 23:00', () => {
    expect(axisBounds([span('06:00', '22:00')], [span('21:30', '23:00')])).toEqual({
      from: at('06:00'),
      to: at('23:00'),
    })
    expect(axisBounds(null, [span('06:30', '07:15'), span('22:10', '22:40')])).toEqual({
      from: at('06:00'),
      to: at('23:00'),
    })
  })

  it('ignores empty spans and never leaves the day', () => {
    expect(axisBounds([], [span('05:00', '05:00'), { from: 0, to: 24 * 60 }])).toEqual({ from: 0, to: 24 * 60 })
    expect(axisBounds(null, [{ from: 300, to: 200 }])).toEqual({ from: AXIS_START, to: AXIS_END })
  })
})

describe('axis geometry', () => {
  const bounds = { from: at('08:00'), to: at('11:00') }

  it('lists the whole hours of the axis', () => {
    expect(axisHours(bounds)).toEqual([at('08:00'), at('09:00'), at('10:00')])
  })

  it('measures 40 px per hour', () => {
    expect(axisOffset(at('09:30'), bounds)).toBe(60)
    expect(axisLength(span('09:00', '10:30'))).toBe(60)
  })
})

describe('layoutLanes', () => {
  it('puts three overlapping entries in three lanes and a later one alone at full width', () => {
    const items = [
      { id: 'a', ...span('09:00', '12:00') },
      { id: 'b', ...span('09:00', '10:30') },
      { id: 'c', ...span('10:00', '11:00') },
      { id: 'd', ...span('19:30', '21:00') },
    ]
    const laned = layoutLanes(items)
    const byId = new Map(laned.map((entry) => [entry.item.id, { lane: entry.lane, lanes: entry.lanes }]))
    expect(byId.get('a')).toEqual({ lane: 0, lanes: 3 })
    expect(byId.get('b')).toEqual({ lane: 1, lanes: 3 })
    expect(byId.get('c')).toEqual({ lane: 2, lanes: 3 })
    expect(byId.get('d')).toEqual({ lane: 0, lanes: 1 })
    expect(maxLanes(laned)).toBe(3)
  })

  it('reuses a lane freed before the next start inside one group', () => {
    const laned = layoutLanes([span('09:00', '13:00'), span('09:00', '10:00'), span('10:00', '11:00')])
    expect(laned.map((entry) => [entry.lane, entry.lanes])).toEqual([
      [0, 2],
      [1, 2],
      [1, 2],
    ])
  })

  it('keeps the input order for equal spans and handles an empty day', () => {
    const laned = layoutLanes([
      { id: 'x', ...span('09:00', '10:00') },
      { id: 'y', ...span('09:00', '10:00') },
    ])
    expect(laned.map((entry) => entry.item.id)).toEqual(['x', 'y'])
    expect(layoutLanes([])).toEqual([])
    expect(maxLanes([])).toBe(1)
  })
})

describe('isClosedDay', () => {
  it('is closed only when opening hours list no window', () => {
    expect(isClosedDay([])).toBe(true)
    expect(isClosedDay(null)).toBe(false)
    expect(isClosedDay([span('08:00', '22:00')])).toBe(false)
  })
})

describe('freeOpenHours', () => {
  const base: FreeHoursInput = {
    bounds: { from: at('08:00'), to: at('14:00') },
    opening: [span('09:00', '13:00')],
    zones: [{ ...span('12:00', '13:00'), zone: 'closed' }],
    entries: [span('10:30', '11:00')],
    date: '2026-11-20',
    today: '2026-11-16',
    nowMinutes: at('15:00'),
  }

  it('offers the open hours without an entry or a closed zone on a future day', () => {
    expect(freeOpenHours(base)).toEqual([at('09:00'), at('11:00')])
  })

  it('offers no hour before now on today', () => {
    expect(freeOpenHours({ ...base, date: '2026-11-16', nowMinutes: at('10:00') })).toEqual([at('11:00')])
    expect(freeOpenHours({ ...base, date: '2026-11-16', nowMinutes: at('09:00') })).toEqual([at('09:00'), at('11:00')])
  })

  it('offers no hour on a past day or a closed day', () => {
    expect(freeOpenHours({ ...base, date: '2026-11-15' })).toEqual([])
    expect(freeOpenHours({ ...base, opening: [] })).toEqual([])
  })

  it('treats a day without opening hours as open, other zones as no obstacle', () => {
    expect(
      freeOpenHours({ ...base, opening: null, zones: [{ ...span('08:00', '14:00'), zone: 'public_free' }] }),
    ).toEqual([at('08:00'), at('09:00'), at('11:00'), at('12:00'), at('13:00')])
  })
})

describe('chipDates', () => {
  it('starts today and runs seven days by default, across a month end', () => {
    expect(chipDates('2026-11-28')).toEqual([
      '2026-11-28',
      '2026-11-29',
      '2026-11-30',
      '2026-12-01',
      '2026-12-02',
      '2026-12-03',
      '2026-12-04',
    ])
    expect(chipDates('2026-11-16', 2)).toEqual(['2026-11-16', '2026-11-17'])
  })
})

describe('bookableWindowsByDay', () => {
  const rule = (overrides: Partial<ZoneRuleLike>): ZoneRuleLike => ({
    id: 'r',
    weekdays: [1],
    timeFrom: '16:00',
    timeTo: '22:00',
    zone: 'reservable_paid',
    source: 'availability',
    validFrom: '2026-01-01',
    validTo: null,
    ...overrides,
  })

  it('lists every bookable window in force today per weekday, regulation windows included, by start', () => {
    const byDay = bookableWindowsByDay(
      [
        rule({ id: 'avail', weekdays: [1, 2] }),
        rule({ id: 'regs', weekdays: [1], timeFrom: '09:00', timeTo: '12:00', source: 'regulations' }),
        rule({ id: 'until', weekdays: [2], timeFrom: '16:00', validTo: '2026-12-31' }),
      ],
      '2026-11-16',
    )
    expect(byDay.get(1)).toEqual([
      { id: 'regs', from: '09:00', to: '12:00', validTo: null, source: 'regulations' },
      { id: 'avail', from: '16:00', to: '22:00', validTo: null, source: 'availability' },
    ])
    expect(byDay.get(2)?.map((window) => window.id)).toEqual(['avail', 'until'])
    expect(byDay.has(3)).toBe(false)
  })

  it('leaves out other zones, rules without a start and rules not in force today', () => {
    const byDay = bookableWindowsByDay(
      [
        rule({ id: 'zone', zone: 'club_training' }),
        rule({ id: 'nostart', validFrom: null }),
        rule({ id: 'future', validFrom: '2026-12-01' }),
        rule({ id: 'over', validTo: '2026-11-15' }),
        rule({ id: 'last', validTo: '2026-11-16' }),
      ],
      '2026-11-16',
    )
    expect([...byDay.entries()]).toEqual([
      [1, [{ id: 'last', from: '16:00', to: '22:00', validTo: '2026-11-16', source: 'availability' }]],
    ])
  })
})
