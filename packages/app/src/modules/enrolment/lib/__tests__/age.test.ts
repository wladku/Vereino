import { describe, expect, it } from '@jest/globals'
import { ageFitOf, ageLimitIssue, ageOnReference, ageReferenceDate, parseReferenceDay } from '../age'

describe('ageReferenceDate (DD-J03)', () => {
  it('takes the latest reference day on or before the day + 60 days', () => {
    expect(ageReferenceDate('2026-07-03', '09-01')).toBe('2026-09-01')
    expect(ageReferenceDate('2026-07-02', '09-01')).toBe('2025-09-01')
    expect(ageReferenceDate('2026-11-26', '09-01')).toBe('2026-09-01')
    expect(ageReferenceDate('2026-12-20', '01-15')).toBe('2027-01-15')
  })

  it('reads an invalid day as 1 September and 29 February as 28 February in a common year', () => {
    expect(ageReferenceDate('2026-11-26', 'nonsense')).toBe('2026-09-01')
    expect(ageReferenceDate('2027-03-10', '02-29')).toBe('2027-02-28')
    expect(ageReferenceDate('2028-03-10', '02-29')).toBe('2028-02-29')
  })
})

describe('parseReferenceDay', () => {
  it('accepts a real MM-DD only', () => {
    expect(parseReferenceDay('09-01')).toBe('09-01')
    expect(parseReferenceDay('02-29')).toBe('02-29')
    expect(parseReferenceDay('02-30')).toBeNull()
    expect(parseReferenceDay('9-1')).toBeNull()
    expect(parseReferenceDay(901)).toBeNull()
  })
})

describe('ageLimitIssue (BR-J2)', () => {
  const reference = '2026-09-01'
  const today = '2026-11-26'
  it('refuses a birth date in the future', () => {
    expect(ageLimitIssue('child', '2026-12-01', reference, today)).toBe('birth_date_future')
  })
  it('keeps a child within 3–17 on the reference date', () => {
    expect(ageLimitIssue('child', '2023-09-01', reference, today)).toBeNull()
    expect(ageLimitIssue('child', '2023-09-02', reference, today)).toBe('age_out_of_bounds')
    expect(ageLimitIssue('child', '2008-09-02', reference, today)).toBeNull()
    expect(ageLimitIssue('child', '2008-09-01', reference, today)).toBe('age_out_of_bounds')
  })
  it('wants an adult of 18 on the reference date and today', () => {
    expect(ageLimitIssue('adult', '2000-01-01', reference, today)).toBeNull()
    expect(ageLimitIssue('adult', '2008-09-02', reference, today)).toBe('age_out_of_bounds')
    expect(ageLimitIssue('adult', '2008-09-01', '2026-09-01', '2026-08-01')).toBe('age_out_of_bounds')
  })
})

describe('ageFitOf (REQ-J05, REQ-J06)', () => {
  it('fits, is outside or is unknown', () => {
    const ages = { kind: 'age' as const, ageFrom: 7, ageTo: 9 }
    expect(ageFitOf('2017-03-14', '2026-09-01', ages)).toBe('fits')
    expect(ageFitOf('2014-03-14', '2026-09-01', ages)).toBe('outside')
    expect(ageFitOf('2017-03-14', '2026-09-01', null)).toBe('unknown')
    const u9 = { kind: 'birth_years' as const, uFrom: 8, uTo: 9, referenceYear: 2026, from: 2018, to: 2019 }
    expect(ageFitOf('2018-12-31', '2026-09-01', u9)).toBe('fits')
    expect(ageFitOf('2017-01-01', '2026-09-01', u9)).toBe('outside')
  })
  it('counts the age on the reference date', () => {
    expect(ageOnReference('2017-03-14', '2026-09-01')).toBe(9)
  })
})
