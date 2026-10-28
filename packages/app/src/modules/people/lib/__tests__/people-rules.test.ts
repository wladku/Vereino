import { describe, expect, it } from '@jest/globals'
import { errorCodes } from '../error-codes'
import {
  calendarDateInZone,
  isPayerEligible,
  isValidPesel,
  personScope,
  roleScopeProblem,
  type AssignmentRecord,
} from '../people-rules'

const ward = (wardPersonId: string, validFrom: string, validTo: string | null = null) => ({
  wardPersonId,
  validFrom,
  validTo,
})

const assignment = (
  role: AssignmentRecord['role'],
  validFrom: string,
  validTo: string | null = null,
  sectionId: string | null = null,
): AssignmentRecord => ({ role, validFrom, validTo, sectionId })

describe('calendarDateInZone', () => {
  it('returns the calendar date of an instant in the club time zone', () => {
    const lateEvening = new Date('2026-10-27T23:30:00.000Z')
    expect(calendarDateInZone(lateEvening, 'Europe/Warsaw')).toBe('2026-10-28')
    expect(calendarDateInZone(lateEvening, 'UTC')).toBe('2026-10-27')
  })
})

describe('isValidPesel', () => {
  it('accepts 11 digits with a matching check digit (synthetic numbers)', () => {
    expect(isValidPesel('90010100009')).toBe(true)
  })

  it('rejects a wrong check digit, wrong length and non-digits', () => {
    expect(isValidPesel('90010100008')).toBe(false)
    expect(isValidPesel('9001010000')).toBe(false)
    expect(isValidPesel('9001010000a')).toBe(false)
  })
})

describe('roleScopeProblem', () => {
  it('requires a section for a coordinator and refuses one for other roles', () => {
    expect(roleScopeProblem('coordinator', null)).toBe('required')
    expect(roleScopeProblem('coordinator', 'section-a')).toBeNull()
    expect(roleScopeProblem('coach', 'section-a')).toBe('unexpected')
    expect(roleScopeProblem('club_admin', undefined)).toBeNull()
  })
})

describe('personScope', () => {
  const today = '2026-10-27'

  it('gives a person without assignments or wards only the self grant', () => {
    expect(personScope({ personId: 'p1', assignments: [], guardianships: [] }, today)).toEqual([
      { kind: 'self', ids: ['p1'] },
    ])
  })

  it('derives club_admin, coordinator sections and wards from active records only', () => {
    const scope = personScope(
      {
        personId: 'p1',
        assignments: [
          assignment('club_admin', '2026-01-01'),
          assignment('coordinator', '2026-01-01', null, 'section-b'),
          assignment('coordinator', '2026-01-01', null, 'section-a'),
          assignment('coordinator', '2026-01-01', null, 'section-a'),
          assignment('coordinator', '2026-01-01', '2026-10-26', 'section-old'),
          assignment('coordinator', '2026-10-28', null, 'section-future'),
          assignment('coach', '2026-01-01'),
        ],
        guardianships: [
          ward('w2', '2026-01-01'),
          ward('w1', '2026-01-01'),
          ward('w-ended', '2025-01-01', '2026-10-26'),
        ],
      },
      today,
    )
    expect(scope).toEqual([
      { kind: 'club_admin' },
      { kind: 'coordinator', ids: ['section-a', 'section-b'] },
      { kind: 'guardian', ids: ['w1', 'w2'] },
      { kind: 'self', ids: ['p1'] },
    ])
  })

  it('adds no coach grant in phase A1 (group ids come with memberships)', () => {
    expect(
      personScope({ personId: 'p1', assignments: [assignment('coach', today)], guardianships: [] }, today),
    ).toEqual([{ kind: 'self', ids: ['p1'] }])
  })
})

describe('isPayerEligible', () => {
  const activeWard = [{ validFrom: '2020-01-01', validTo: null }]

  it('is true from the 18th birthday of an active guardian', () => {
    expect(isPayerEligible({ birthDate: '2008-10-27', guardianships: activeWard }, '2026-10-27')).toBe(true)
    expect(isPayerEligible({ birthDate: '2008-10-28', guardianships: activeWard }, '2026-10-27')).toBe(false)
  })

  it('is false without a birth date, for an adult without an active guardianship', () => {
    expect(isPayerEligible({ birthDate: null, guardianships: activeWard }, '2026-10-27')).toBe(false)
    expect(isPayerEligible({ birthDate: '1980-01-01', guardianships: [] }, '2026-10-27')).toBe(false)
    expect(
      isPayerEligible(
        { birthDate: '1980-01-01', guardianships: [{ validFrom: '2020-01-01', validTo: '2026-01-01' }] },
        '2026-10-27',
      ),
    ).toBe(false)
  })
})

describe('people error codes', () => {
  it('declares the people codes with their statuses and message keys under people.errors', () => {
    expect(errorCodes.map(({ code, status }) => [code, status])).toEqual([
      ['account_age_below_threshold', 422],
      ['account_birth_date_required', 422],
      ['account_exists', 409],
      ['pesel_duplicate', 409],
      ['pesel_invalid', 422],
      ['role_scope_required', 422],
      ['role_scope_unexpected', 422],
      ['guardianship_self', 422],
    ])
    expect(errorCodes.every((entry) => entry.messageKey === `people.errors.${entry.code}`)).toBe(true)
  })
})
