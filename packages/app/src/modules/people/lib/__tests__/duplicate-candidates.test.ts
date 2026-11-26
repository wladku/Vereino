import { describe, expect, it } from '@jest/globals'
import {
  adultBirthDateCutoff,
  isMinorOn,
  matchDuplicateCandidates,
  normalizeEmail,
  normalizeName,
  normalizePhone,
  type DuplicateCandidateRow,
} from '../duplicate-candidates'

const TODAY = '2026-11-26'

function row(id: string, overrides: Partial<DuplicateCandidateRow> = {}): DuplicateCandidateRow {
  return { id, firstName: 'Jan', lastName: 'Kowalski', birthDate: null, email: null, phone: null, ...overrides }
}

describe('normalizeName (DD-J11)', () => {
  it('strips diacritics, lower-cases and collapses whitespace', () => {
    expect(normalizeName('  Zofia   Łucja ')).toBe('zofia łucja')
    expect(normalizeName('Żółć Gęślą')).toBe('zołc gesla')
    expect(normalizeName('ÉMILE')).toBe('emile')
  })

  it('reads a missing name as empty', () => {
    expect(normalizeName(null)).toBe('')
    expect(normalizeName(undefined)).toBe('')
  })
})

describe('normalizeEmail', () => {
  it('trims and lower-cases', () => {
    expect(normalizeEmail('  Anna.Nowak@Example.PL ')).toBe('anna.nowak@example.pl')
    expect(normalizeEmail(null)).toBe('')
    expect(normalizeEmail(undefined)).toBe('')
  })
})

describe('normalizePhone', () => {
  it('compares Polish numbers written in any common form equal', () => {
    expect(normalizePhone('+48 600 100 200')).toBe('48600100200')
    expect(normalizePhone('0048600100200')).toBe('48600100200')
    expect(normalizePhone('600-100-200')).toBe('48600100200')
  })

  it('keeps foreign numbers as international digits', () => {
    expect(normalizePhone('0049 30 1234567')).toBe('49301234567')
    expect(normalizePhone('+49 30 1234567')).toBe('49301234567')
  })

  it('reads a missing or digit-free value as empty', () => {
    expect(normalizePhone(null)).toBe('')
    expect(normalizePhone(undefined)).toBe('')
    expect(normalizePhone(' - ')).toBe('')
  })
})

describe('isMinorOn', () => {
  it('is true before the 18th birthday and false from it on', () => {
    expect(isMinorOn('2008-11-27', TODAY)).toBe(true)
    expect(isMinorOn('2008-11-26', TODAY)).toBe(false)
  })

  it('counts a person without a birth date as an adult', () => {
    expect(isMinorOn(null, TODAY)).toBe(false)
    expect(isMinorOn(undefined, TODAY)).toBe(false)
  })
})

describe('adultBirthDateCutoff', () => {
  it('is the same day 18 years back', () => {
    expect(adultBirthDateCutoff(TODAY)).toBe('2008-11-26')
  })

  it('falls back to 28 February when 29 February does not exist 18 years back', () => {
    expect(adultBirthDateCutoff('2028-02-29')).toBe('2010-02-28')
  })
})

describe('matchDuplicateCandidates', () => {
  it('matches name and birth date regardless of case, diacritics and spacing, and flags a minor', () => {
    const rows = [
      row('p1', { firstName: ' JAN ', lastName: 'Kowálski', birthDate: '2016-05-01' }),
      row('p2', { firstName: 'Jan', lastName: 'Kowalski', birthDate: '2016-05-02' }),
      row('p3', { firstName: 'Janek', lastName: 'Kowalski', birthDate: '2016-05-01' }),
      row('p4', { firstName: 'Jan', lastName: 'Nowak', birthDate: '2016-05-01' }),
    ]
    expect(
      matchDuplicateCandidates({ firstName: 'jan', lastName: 'kowalski', birthDate: '2016-05-01' }, rows, TODAY),
    ).toEqual([{ personId: 'p1', reason: 'name_birth_date', isMinor: true }])
  })

  it('does not match names without a birth date or without a last name', () => {
    const rows = [row('p1', { birthDate: '1980-01-01' }), row('p2', { lastName: '', birthDate: '1980-01-01' })]
    expect(matchDuplicateCandidates({ firstName: 'Jan', lastName: 'Kowalski' }, rows, TODAY)).toEqual([])
    expect(
      matchDuplicateCandidates({ firstName: 'Jan', lastName: '  ', birthDate: '1980-01-01' }, rows, TODAY),
    ).toEqual([])
  })

  it('matches e-mail and phone of adults only, and never an empty value', () => {
    const rows = [
      row('adult', { birthDate: '1980-01-01', email: 'Anna@Example.pl', phone: '+48 600 100 200' }),
      row('no-birth-date', { email: ' anna@example.pl ', phone: null }),
      row('minor', { birthDate: '2015-01-01', email: 'anna@example.pl', phone: '600100200' }),
      row('other', { birthDate: '1980-01-01', email: 'other@example.pl', phone: '600100201' }),
    ]
    expect(
      matchDuplicateCandidates(
        { firstName: 'Anna', lastName: 'Nowak', email: 'ANNA@example.pl', phone: '0048 600 100 200' },
        rows,
        TODAY,
      ),
    ).toEqual([
      { personId: 'adult', reason: 'email', isMinor: false },
      { personId: 'no-birth-date', reason: 'email', isMinor: false },
      { personId: 'adult', reason: 'phone', isMinor: false },
    ])
    expect(
      matchDuplicateCandidates({ firstName: 'Anna', lastName: 'Nowak', email: '  ', phone: '-' }, rows, TODAY),
    ).toEqual([])
    expect(matchDuplicateCandidates({ firstName: 'Anna', lastName: 'Nowak' }, [row('x')], TODAY)).toEqual([])
  })

  it('yields one entry per person and reason, ordered by reason then person id, and ignores repeated rows', () => {
    const adult = row('b', { birthDate: '1980-01-01', email: 'jan@example.pl', phone: '600100200' })
    const rows = [
      adult,
      adult,
      row('c', { birthDate: '1980-01-01' }),
      row('a', { birthDate: '1980-01-01', phone: '+48600100200' }),
    ]
    expect(
      matchDuplicateCandidates(
        {
          firstName: 'Jan',
          lastName: 'Kowalski',
          birthDate: '1980-01-01',
          email: 'jan@example.pl',
          phone: '600 100 200',
        },
        rows,
        TODAY,
      ),
    ).toEqual([
      { personId: 'a', reason: 'name_birth_date', isMinor: false },
      { personId: 'b', reason: 'name_birth_date', isMinor: false },
      { personId: 'c', reason: 'name_birth_date', isMinor: false },
      { personId: 'b', reason: 'email', isMinor: false },
      { personId: 'a', reason: 'phone', isMinor: false },
      { personId: 'b', reason: 'phone', isMinor: false },
    ])
  })
})
