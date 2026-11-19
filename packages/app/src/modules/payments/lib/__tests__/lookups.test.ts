import { describe, expect, it } from '@jest/globals'
import { LOOKUP_KINDS, foldText, lookupPage, matchesSearch, personLabel, type LookupItem } from '../lookups'

const item = (id: string, label: string): LookupItem => ({ id, label, sectionId: null, sectionName: null })

describe('lookups (#245)', () => {
  it('lists the four kinds the Finance forms read', () => {
    expect(LOOKUP_KINDS).toEqual(['groups', 'activities', 'sections', 'persons'])
  })

  it('folds case, accents and the Polish ł', () => {
    expect(foldText('  Żaki ŁÓDŹ ')).toBe('zaki lodz')
    expect(foldText('łuk')).toBe('luk')
  })

  it('matches every word of the search anywhere in the label', () => {
    expect(matchesSearch('Żaki — Akademia', 'zak akad')).toBe(true)
    expect(matchesSearch('Żaki', 'orliki')).toBe(false)
    expect(matchesSearch('Żaki', '   ')).toBe(true)
    expect(matchesSearch('Żaki', undefined)).toBe(true)
  })

  it('labels a person by name, or by id without one', () => {
    expect(personLabel({ id: 'p1', firstName: 'Ewa', lastName: 'Lis' })).toBe('Ewa Lis')
    expect(personLabel({ id: 'p1', firstName: '', lastName: 'Lis' })).toBe('Lis')
    expect(personLabel({ id: 'p1', firstName: ' ', lastName: '' })).toBe('p1')
  })

  it('filters, orders by label with Polish collation (then id) and pages', () => {
    const items = [item('3', 'Żaki'), item('1', 'Orliki'), item('2', 'Ąąa'), item('0', 'Orliki')]
    expect(lookupPage(items, { page: 1, pageSize: 2 })).toEqual({
      items: [item('2', 'Ąąa'), item('0', 'Orliki')],
      total: 4,
      page: 1,
      pageSize: 2,
      totalPages: 2,
    })
    expect(lookupPage(items, { search: 'zak', page: 1, pageSize: 10 }).items).toEqual([item('3', 'Żaki')])
    expect(lookupPage([], { page: 1, pageSize: 10 })).toEqual({
      items: [],
      total: 0,
      page: 1,
      pageSize: 10,
      totalPages: 1,
    })
  })
})
