import { describe, expect, it } from '@jest/globals'
import { TODAY_AT_FACILITY_SHOWN, todayAtFacility } from '../today-at-facility'

const places = [
  { id: 'pitch', isExternal: false },
  { id: 'hall', isExternal: false },
  { id: 'away', isExternal: true },
]
const entry = (id: string, placeId: string, time: string) => ({ id, placeId, start: `2026-11-19T${time}:00.000Z` })

describe('todayAtFacility', () => {
  it('lists the entries on the club places by start, then by id, and leaves out external places', () => {
    const result = todayAtFacility({
      places,
      entries: [
        entry('c', 'hall', '10:00'),
        entry('b', 'pitch', '08:00'),
        entry('x', 'away', '07:00'),
        entry('a', 'hall', '10:00'),
        entry('u', 'unknown', '06:00'),
      ],
    })
    expect(result.shown.map((item) => item.id)).toEqual(['b', 'a', 'c'])
    expect(result.more).toBe(0)
    expect(result.firstPlaceId).toBe('pitch')
  })

  it('shows at most eight and counts the rest', () => {
    const entries = Array.from({ length: 11 }, (_, index) =>
      entry(`e${String(index).padStart(2, '0')}`, 'pitch', `${String(8 + index).padStart(2, '0')}:00`),
    )
    const result = todayAtFacility({ places, entries })
    expect(TODAY_AT_FACILITY_SHOWN).toBe(8)
    expect(result.shown).toHaveLength(8)
    expect(result.shown[0].id).toBe('e00')
    expect(result.more).toBe(3)
  })

  it('takes another limit and treats a negative one as zero', () => {
    const entries = [entry('a', 'pitch', '08:00'), entry('b', 'hall', '09:00')]
    expect(todayAtFacility({ places, entries }, 1)).toMatchObject({ more: 1, firstPlaceId: 'pitch' })
    expect(todayAtFacility({ places, entries }, -1)).toEqual({ shown: [], more: 2, firstPlaceId: null })
  })

  it('answers nothing scheduled without entries and leaves the input order alone', () => {
    expect(todayAtFacility({ places, entries: [] })).toEqual({ shown: [], more: 0, firstPlaceId: null })
    const entries = [entry('b', 'pitch', '09:00'), entry('a', 'pitch', '08:00')]
    todayAtFacility({ places, entries })
    expect(entries.map((item) => item.id)).toEqual(['b', 'a'])
  })
})
