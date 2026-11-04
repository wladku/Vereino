import { describe, expect, it } from '@jest/globals'
import { MAX_COACH_OPTIONS, coachOptions, foldForSearch } from '../coach-options'

const wojtek = { id: 'p-1', firstName: 'Wojciech', lastName: 'Łukaszewski' }
const anna = { id: 'p-2', firstName: 'Anna', lastName: 'Nowak' }
const adam = { id: 'p-3', firstName: 'Adam', lastName: 'Nowak' }
const twin = { id: 'p-0', firstName: 'Adam', lastName: 'Nowak' }

describe('foldForSearch', () => {
  it('drops case and diacritics, the Polish ł included', () => {
    expect(foldForSearch('Łukasz Żółć')).toBe('lukasz zolc')
    expect(foldForSearch('łoś')).toBe('los')
  })
})

describe('coachOptions', () => {
  it('lists everyone by last name, then first name and id, for a blank search', () => {
    // Polish collation: "Ł" sorts right after "L", before "N".
    expect(coachOptions([anna, wojtek, adam, twin], '  ')).toEqual([
      { id: 'p-1', name: 'Wojciech Łukaszewski' },
      { id: 'p-0', name: 'Adam Nowak' },
      { id: 'p-3', name: 'Adam Nowak' },
      { id: 'p-2', name: 'Anna Nowak' },
    ])
    expect(coachOptions([anna], null)).toEqual([{ id: 'p-2', name: 'Anna Nowak' }])
    expect(coachOptions([anna], undefined)).toHaveLength(1)
  })

  it('matches every word against the start of a name, ignoring case and diacritics', () => {
    expect(coachOptions([anna, wojtek, adam], 'luk')).toEqual([{ id: 'p-1', name: 'Wojciech Łukaszewski' }])
    expect(coachOptions([anna, wojtek, adam], 'nowak an')).toEqual([{ id: 'p-2', name: 'Anna Nowak' }])
    expect(coachOptions([anna, wojtek, adam], 'owak')).toEqual([])
  })

  it('stops at the limit', () => {
    const many = Array.from({ length: MAX_COACH_OPTIONS + 5 }, (_, index) => ({
      id: `p-${String(index).padStart(3, '0')}`,
      firstName: 'Jan',
      lastName: 'Kowalski',
    }))
    expect(coachOptions(many, '')).toHaveLength(MAX_COACH_OPTIONS)
    expect(coachOptions(many, 'jan', 2).map((option) => option.id)).toEqual(['p-000', 'p-001'])
  })
})
