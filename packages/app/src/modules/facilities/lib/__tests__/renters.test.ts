import { describe, expect, it } from '@jest/globals'
import {
  RENTER_RESULTS_MAX,
  foldSearchText,
  mergeRenterOptions,
  renterHistoryStart,
  renterNameMatches,
  type RenterHistoryRow,
} from '../renters'

function rental(overrides: Partial<RenterHistoryRow>): RenterHistoryRow {
  return {
    renterType: 'institution',
    renterId: 'i-1',
    renterDisplayName: 'KS Sąsiedzi',
    renterCategory: 'municipal_club',
    contactName: 'Jan Nowak',
    contactPhone: '600 000 000',
    contactEmail: null,
    startsAt: new Date('2026-10-01T10:00:00Z'),
    ...overrides,
  }
}

describe('foldSearchText', () => {
  it('folds case, diacritics, the Polish ł and spaces', () => {
    expect(foldSearchText('  Łódź   Sąsiedzi ')).toBe('lodz sasiedzi')
    expect(foldSearchText('Żółw')).toBe('zolw')
  })
})

describe('renterNameMatches', () => {
  it('matches every word of the query anywhere in the name', () => {
    expect(renterNameMatches('KS Sąsiedzi', 'sas')).toBe(true)
    expect(renterNameMatches('KS Sąsiedzi', 'sąs ks')).toBe(true)
    expect(renterNameMatches('KS Sąsiedzi', 'sas blok')).toBe(false)
  })

  it('never matches a missing name or an empty query', () => {
    expect(renterNameMatches(null, 'ks')).toBe(false)
    expect(renterNameMatches(undefined, 'ks')).toBe(false)
    expect(renterNameMatches('', 'ks')).toBe(false)
    expect(renterNameMatches('KS Sąsiedzi', '   ')).toBe(false)
  })
})

describe('renterHistoryStart', () => {
  it('reaches 24 months back', () => {
    expect(renterHistoryStart(new Date('2026-11-17T08:00:00Z')).toISOString()).toBe('2024-11-17T08:00:00.000Z')
  })
})

describe('mergeRenterOptions', () => {
  it('lists the history first, most recent rental first, once per renter with its last category and contact', () => {
    const options = mergeRenterOptions(
      {
        history: [
          rental({ startsAt: new Date('2026-09-01T10:00:00Z'), contactName: 'Old Contact' }),
          rental({ renterCategory: 'external_commercial', contactEmail: 'jan@example.pl' }),
          rental({
            renterType: 'person',
            renterId: 'p-1',
            renterDisplayName: 'Sąsiad Anna',
            renterCategory: null,
            contactName: null,
            contactPhone: null,
            startsAt: new Date('2026-08-01T10:00:00Z'),
          }),
        ],
        institutions: [],
        persons: [],
      },
      'sas',
    )
    expect(options).toEqual([
      {
        renterType: 'institution',
        renterId: 'i-1',
        displayName: 'KS Sąsiedzi',
        lastCategory: 'external_commercial',
        lastContact: { name: 'Jan Nowak', phone: '600 000 000', email: 'jan@example.pl' },
      },
      {
        renterType: 'person',
        renterId: 'p-1',
        displayName: 'Sąsiad Anna',
        lastCategory: null,
        lastContact: null,
      },
    ])
  })

  it('keeps an unregistered renter by its folded name and drops rows without a name or a match', () => {
    const options = mergeRenterOptions(
      {
        history: [
          rental({ renterType: 'unregistered', renterId: 'ignored', renterDisplayName: 'Drużyna Firmowa' }),
          rental({
            renterType: 'unregistered',
            renterId: null,
            renterDisplayName: ' drużyna  firmowa ',
            startsAt: new Date('2026-01-01T10:00:00Z'),
          }),
          rental({ renterType: 'unregistered', renterId: null, renterDisplayName: null }),
          rental({ renterType: 'unregistered', renterId: null, renterDisplayName: 'Blokersi' }),
        ],
        institutions: [],
        persons: [],
      },
      'druzyna',
    )
    expect(options).toHaveLength(1)
    expect(options[0]).toMatchObject({ renterType: 'unregistered', renterId: null, displayName: 'Drużyna Firmowa' })
  })

  it('adds the matching institutions, then persons, by name, without repeating a renter of the history', () => {
    const options = mergeRenterOptions(
      {
        history: [rental({})],
        institutions: [
          { id: 'i-2', name: 'Szkoła Sąsiednia' },
          { id: 'i-1', name: 'KS Sąsiedzi' },
          { id: 'i-3', name: 'Blokersi' },
        ],
        persons: [
          { id: 'p-2', name: 'Sąsiad Zenon' },
          { id: 'p-1', name: 'Sąsiad Adam' },
        ],
      },
      'sas',
    )
    expect(options.map((option) => [option.renterType, option.renterId])).toEqual([
      ['institution', 'i-1'],
      ['institution', 'i-2'],
      ['person', 'p-1'],
      ['person', 'p-2'],
    ])
    expect(options[1]).toMatchObject({ lastCategory: null, lastContact: null })
  })

  it('orders equal names by id and returns at most 20 options', () => {
    const institutions = Array.from({ length: 25 }, (_, index) => ({
      id: `i-${String(index).padStart(2, '0')}`,
      name: 'Klub',
    }))
    const options = mergeRenterOptions({ history: [], institutions: [...institutions].reverse(), persons: [] }, 'klub')
    expect(options).toHaveLength(RENTER_RESULTS_MAX)
    expect(options[0]?.renterId).toBe('i-00')
    expect(options[19]?.renterId).toBe('i-19')
  })
})
