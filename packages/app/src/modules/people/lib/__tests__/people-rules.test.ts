import { describe, expect, it } from '@jest/globals'
import { errorCodes } from '../error-codes'
import {
  CONSENT_KINDS,
  GUARDIAN_RELATIONS,
  applyConsentChanges,
  calendarDateInZone,
  consentsView,
  firstOverlapping,
  parseStoredConsents,
  isPayerEligible,
  isValidPesel,
  isRejectedPhone,
  isValidPhone,
  personScope,
  roleScopeProblem,
  sectionCoordinators,
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

describe('isRejectedPhone', () => {
  it('refuses a new number that is neither Polish nor E.164', () => {
    expect(isRejectedPhone('abc', null)).toBe(true)
    expect(isRejectedPhone('abc', undefined)).toBe(true)
    expect(isRejectedPhone('12', '600700800')).toBe(true)
  })

  it('keeps a valid number, a blank value and an unchanged stored value', () => {
    expect(isRejectedPhone('600 700 800', null)).toBe(false)
    expect(isRejectedPhone(null, 'abc')).toBe(false)
    expect(isRejectedPhone(undefined, null)).toBe(false)
    expect(isRejectedPhone('  ', null)).toBe(false)
    expect(isRejectedPhone('call the office', 'call the office')).toBe(false)
  })
})

describe('isValidPhone', () => {
  it('accepts a Polish number, with or without 0048 and separators', () => {
    expect(isValidPhone('600700800')).toBe(true)
    expect(isValidPhone(' 600 700 800 ')).toBe(true)
    expect(isValidPhone('0048 600-700-800')).toBe(true)
    expect(isValidPhone('(22) 123.45.67')).toBe(true)
  })

  it('accepts E.164 with a country code', () => {
    expect(isValidPhone('+48 600 700 800')).toBe(true)
    expect(isValidPhone('+4915112345678')).toBe(true)
  })

  it('rejects text, a leading zero, wrong lengths and a + without a country code', () => {
    expect(isValidPhone('abc')).toBe(false)
    expect(isValidPhone('')).toBe(false)
    expect(isValidPhone('060070080')).toBe(false)
    expect(isValidPhone('60070080')).toBe(false)
    expect(isValidPhone('6007008001')).toBe(false)
    expect(isValidPhone('+0600700800')).toBe(false)
    expect(isValidPhone('+123456')).toBe(false)
    expect(isValidPhone('+1234567890123456')).toBe(false)
  })
})

describe('roleScopeProblem', () => {
  it('requires a section for a coordinator and refuses one for other roles', () => {
    expect(roleScopeProblem('coordinator', { sectionId: null })).toBe('required')
    expect(roleScopeProblem('coordinator', { sectionId: 'section-a' })).toBeNull()
    expect(roleScopeProblem('coach', { sectionId: 'section-a' })).toBe('unexpected')
    expect(roleScopeProblem('club_admin', {})).toBeNull()
  })

  it('requires a place for a facility attendant and refuses one for other roles (#126)', () => {
    expect(roleScopeProblem('facility_operator', {})).toBe('required')
    expect(roleScopeProblem('facility_operator', { placeId: 'hall' })).toBeNull()
    expect(roleScopeProblem('facility_operator', { placeId: 'hall', sectionId: 'section-a' })).toBe('unexpected')
    expect(roleScopeProblem('coordinator', { sectionId: 'section-a', placeId: 'hall' })).toBe('unexpected')
    expect(roleScopeProblem('club_admin', { placeId: 'hall' })).toBe('unexpected')
  })
})

describe('personScope', () => {
  const today = '2026-10-27'

  it('adds the maintenance_planner grant with the maintained places (DD-36, #128)', () => {
    expect(
      personScope(
        { personId: 'p1', assignments: [], guardianships: [], maintenancePlaceIds: ['pitch', 'hall', 'pitch'] },
        today,
      ),
    ).toEqual([
      { kind: 'maintenance_planner', ids: ['hall', 'pitch'] },
      { kind: 'self', ids: ['p1'] },
    ])
  })

  it('adds the facility_operator grant with the active places and their descendants (#126)', () => {
    const attendant = (placeId: string | null, validTo: string | null = null): AssignmentRecord => ({
      role: 'facility_operator',
      validFrom: '2026-01-01',
      validTo,
      sectionId: null,
      placeId,
    })
    expect(
      personScope(
        {
          personId: 'p1',
          assignments: [attendant('hall'), attendant('pitch'), attendant('old', '2026-10-26'), attendant(null)],
          guardianships: [],
          placeDescendants: { hall: ['hall-court-a', 'hall-court-b'], old: ['old-room'] },
        },
        today,
      ),
    ).toEqual([
      { kind: 'facility_operator', ids: ['hall', 'hall-court-a', 'hall-court-b', 'pitch'] },
      { kind: 'self', ids: ['p1'] },
    ])
    expect(personScope({ personId: 'p1', assignments: [attendant('hall')], guardianships: [] }, today)).toEqual([
      { kind: 'facility_operator', ids: ['hall'] },
      { kind: 'self', ids: ['p1'] },
    ])
  })

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

  it('adds no coach grant for a coach assignment without memberships (group ids come from memberships)', () => {
    expect(
      personScope({ personId: 'p1', assignments: [assignment('coach', today)], guardianships: [] }, today),
    ).toEqual([{ kind: 'self', ids: ['p1'] }])
    expect(personScope({ personId: 'p1', assignments: [], guardianships: [], coachedGroupIds: [] }, today)).toEqual([
      { kind: 'self', ids: ['p1'] },
    ])
  })

  it('adds the coached groups, de-duplicated and sorted, after the coordinator grant', () => {
    expect(
      personScope(
        {
          personId: 'p1',
          assignments: [assignment('coordinator', '2026-01-01', null, 'section-a')],
          guardianships: [ward('w1', '2026-01-01')],
          coachedGroupIds: ['group-b', 'group-a', 'group-b', ''],
        },
        today,
      ),
    ).toEqual([
      { kind: 'coordinator', ids: ['section-a'] },
      { kind: 'coach', ids: ['group-a', 'group-b'] },
      { kind: 'guardian', ids: ['w1'] },
      { kind: 'self', ids: ['p1'] },
    ])
  })
})

describe('isPayerEligible', () => {
  const activeWard = [{ validFrom: '2020-01-01', validTo: null }]

  it('is true from the 18th birthday of an active guardian', () => {
    expect(isPayerEligible({ birthDate: '2008-10-27', guardianships: activeWard }, '2026-10-27')).toBe(true)
    expect(isPayerEligible({ birthDate: '2008-10-28', guardianships: activeWard }, '2026-10-27')).toBe(false)
  })

  it('is true for an adult active participant without a guardianship, never for a minor participant', () => {
    expect(isPayerEligible({ birthDate: '1980-01-01', guardianships: [], activeParticipant: true }, '2026-10-27')).toBe(
      true,
    )
    expect(isPayerEligible({ birthDate: '2008-10-28', guardianships: [], activeParticipant: true }, '2026-10-27')).toBe(
      false,
    )
    expect(isPayerEligible({ birthDate: null, guardianships: [], activeParticipant: true }, '2026-10-27')).toBe(false)
    expect(
      isPayerEligible({ birthDate: '1980-01-01', guardianships: [], activeParticipant: false }, '2026-10-27'),
    ).toBe(false)
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
      ['phone_invalid', 422],
      ['role_scope_required', 422],
      ['role_scope_unexpected', 422],
      ['role_place_invalid', 422],
      ['guardianship_self', 422],
      ['guardianship_primary_payer_conflict', 409],
      ['guardianship_ended', 409],
      ['guardianship_duplicate', 409],
      ['guardianship_guardian_is_ward', 422],
      ['guardianship_ward_is_guardian', 422],
      ['role_assignment_duplicate', 409],
      ['person_not_linked', 404],
      ['payments_minor', 403],
      ['external_id_duplicate', 409],
      ['import_mapping_invalid', 422],
      ['import_already_committed', 409],
      ['import_cancelled', 409],
      ['import_review_pending', 422],
      ['import_decision_invalid', 422],
      ['import_person_not_found', 422],
      ['people_filter_age_range', 400],
      ['people_filter_unavailable', 400],
      ['people_filter_too_broad', 422],
      ['people_filter_failed', 503],
    ])
    expect(errorCodes.every((entry) => entry.messageKey === `people.errors.${entry.code}`)).toBe(true)
  })
})

describe('sectionCoordinators', () => {
  const today = '2026-10-28'
  const candidate = (
    assignmentId: string,
    sectionId: string | null,
    validFrom: string,
    validTo: string | null = null,
  ) => ({
    assignmentId,
    personId: `person-${assignmentId}`,
    sectionId,
    firstName: 'Marek',
    lastName: 'Trener',
    validFrom,
    validTo,
    updatedAt: '2026-10-01T00:00:00.000Z',
  })

  it('lists the current and future coordinators of the section, active first', () => {
    const result = sectionCoordinators(
      { id: 'academy', isActive: true },
      [
        candidate('future', 'academy', '2026-11-01'),
        candidate('current', 'academy', '2026-01-01'),
        candidate('ended', 'academy', '2025-01-01', '2026-10-27'),
        candidate('other', 'pool', '2026-01-01'),
      ],
      today,
    )
    expect(result.coordinators.map((row) => [row.assignmentId, row.active])).toEqual([
      ['current', true],
      ['future', false],
    ])
    expect(result.coordinators[0]).not.toHaveProperty('sectionId')
    expect(result.coordinatorMissing).toBe(false)
  })

  it('orders active coordinators by start date', () => {
    const result = sectionCoordinators(
      { id: 'academy', isActive: true },
      [candidate('b', 'academy', '2026-05-01'), candidate('a', 'academy', '2026-01-01', '2026-10-28')],
      today,
    )
    expect(result.coordinators.map((row) => row.assignmentId)).toEqual(['a', 'b'])
  })

  it('flags an active section without an active coordinator, never an inactive one', () => {
    expect(
      sectionCoordinators({ id: 'pool', isActive: true }, [candidate('future', 'pool', '2026-11-01')], today)
        .coordinatorMissing,
    ).toBe(true)
    expect(sectionCoordinators({ id: 'pool', isActive: true }, [], today).coordinatorMissing).toBe(true)
    expect(sectionCoordinators({ id: 'chess', isActive: false }, [], today).coordinatorMissing).toBe(false)
  })
})

describe('firstOverlapping', () => {
  const ended = { id: 'a', validFrom: '2026-01-01', validTo: '2026-06-30' }
  const open = { id: 'b', validFrom: '2026-09-01', validTo: null }
  it('finds a period that shares a day with the candidate', () => {
    expect(firstOverlapping({ validFrom: '2026-06-30', validTo: '2026-07-31' }, [ended, open])).toBe(ended)
    expect(firstOverlapping({ validFrom: '2027-01-01', validTo: null }, [ended, open])).toBe(open)
  })
  it('returns null when every period is outside the candidate', () => {
    expect(firstOverlapping({ validFrom: '2026-07-01', validTo: '2026-08-31' }, [ended, open])).toBeNull()
    expect(firstOverlapping({ validFrom: '2026-07-01', validTo: null }, [])).toBeNull()
  })
})

describe('guardianship vocabularies', () => {
  it('lists the relations and the consent kinds of the club spec', () => {
    expect(GUARDIAN_RELATIONS).toEqual(['parent', 'grandparent', 'legal_guardian', 'other'])
    expect(CONSENT_KINDS).toEqual(['regulations', 'image', 'trips'])
  })
})

describe('parseStoredConsents and consentsView', () => {
  it('keeps well-formed entries and drops the rest', () => {
    const at = '2026-10-01T10:00:00.000Z'
    expect(parseStoredConsents(null)).toEqual({})
    expect(parseStoredConsents('granted')).toEqual({})
    expect(
      parseStoredConsents({
        regulations: { granted: true, at, by_person_id: 'p1' },
        image: { granted: false, at, by_person_id: 7 },
        trips: { granted: 'yes', at },
        unknown: { granted: true, at },
      }),
    ).toEqual({
      regulations: { granted: true, at, by_person_id: 'p1' },
      image: { granted: false, at, by_person_id: null },
    })
    expect(parseStoredConsents({ regulations: null, image: { granted: true, at: 'not a date' } })).toEqual({})
  })
  it('shows every kind, a missing one as never granted', () => {
    const at = '2026-10-01T10:00:00.000Z'
    expect(consentsView({ image: { granted: true, at, by_person_id: 'p1' } })).toEqual({
      regulations: { granted: false, at: null, byPersonId: null },
      image: { granted: true, at, byPersonId: 'p1' },
      trips: { granted: false, at: null, byPersonId: null },
    })
  })
})

describe('applyConsentChanges (P-08 transitions)', () => {
  const first = new Date('2026-10-01T10:00:00.000Z')
  const later = new Date('2026-10-05T12:00:00.000Z')
  it('grants, keeps the original grant date and records who changed it', () => {
    const granted = applyConsentChanges({}, { regulations: true, image: true }, first, 'guardian-1')
    expect(granted.changed).toEqual(['regulations', 'image'])
    expect(granted.consents).toEqual({
      regulations: { granted: true, at: first.toISOString(), by_person_id: 'guardian-1' },
      image: { granted: true, at: first.toISOString(), by_person_id: 'guardian-1' },
    })
    const again = applyConsentChanges(granted.consents, { regulations: true }, later, 'admin-1')
    expect(again.changed).toEqual([])
    expect(again.consents).toEqual(granted.consents)
  })
  it('withdraws a granted consent and ignores withdrawing one never granted', () => {
    const start = { image: { granted: true, at: first.toISOString(), by_person_id: 'guardian-1' } }
    const withdrawn = applyConsentChanges(start, { image: false, trips: false }, later, null)
    expect(withdrawn.changed).toEqual(['image'])
    expect(withdrawn.consents).toEqual({ image: { granted: false, at: later.toISOString(), by_person_id: null } })
    const regranted = applyConsentChanges(withdrawn.consents, { image: true }, later, 'guardian-2')
    expect(regranted.changed).toEqual(['image'])
    expect(regranted.consents.image).toEqual({ granted: true, at: later.toISOString(), by_person_id: 'guardian-2' })
  })
})
