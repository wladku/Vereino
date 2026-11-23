import { describe, expect, it } from '@jest/globals'
import { errorCodes } from '../error-codes'
import {
  CONSENT_KINDS,
  GUARDIAN_RELATIONS,
  applyConsentChanges,
  calendarDateInZone,
  consentsView,
  effectiveConsents,
  firstOverlapping,
  givenToEarlierWording,
  holdsOwnConsents,
  parseStoredConsents,
  isPayerEligible,
  isValidPesel,
  isRejectedPhone,
  isValidPhone,
  personScope,
  ADULT_ONLY_ROLES,
  personAge,
  roleAgeProblem,
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

describe('personAge (README B-10, #262)', () => {
  const today = '2026-11-16'
  it('counts completed years with the Polish plural forms', () => {
    expect(personAge('2025-11-16', today, 'pl')).toEqual({ years: 1, form: 'one' })
    expect(personAge('2023-11-16', today, 'pl')).toEqual({ years: 3, form: 'few' })
    expect(personAge('2014-11-17', today, 'pl')).toEqual({ years: 11, form: 'many' })
  })

  it('uses one and other in English, other for zero', () => {
    expect(personAge('2025-11-16', today, 'en')).toEqual({ years: 1, form: 'one' })
    expect(personAge('2016-01-01', today, 'en')).toEqual({ years: 10, form: 'other' })
    expect(personAge('2026-01-01', today, 'en')).toEqual({ years: 0, form: 'other' })
  })

  it('is null without a valid birth date', () => {
    expect(personAge(null, today, 'pl')).toBeNull()
    expect(personAge(undefined, today, 'pl')).toBeNull()
    expect(personAge('not-a-date', today, 'pl')).toBeNull()
  })
})

describe('roleAgeProblem (navigation spec REQ-N12, V-N05)', () => {
  const today = '2026-11-16'
  it('lists the coordinator as the only adult-only role', () => {
    expect(ADULT_ONLY_ROLES).toEqual(['coordinator'])
  })

  it('refuses a minor coordinator and accepts an adult one', () => {
    expect(roleAgeProblem({ role: 'coordinator', birthDate: '2010-05-01', validFrom: today, today })).toBe(
      'role_requires_adult',
    )
    expect(roleAgeProblem({ role: 'coordinator', birthDate: '2008-11-16', validFrom: today, today })).toBeNull()
  })

  it('judges the age on the later of the start and today', () => {
    // 18 on 2026-12-01: a role from that day is accepted, a backdated one is judged today.
    expect(roleAgeProblem({ role: 'coordinator', birthDate: '2008-12-01', validFrom: '2026-12-01', today })).toBeNull()
    expect(roleAgeProblem({ role: 'coordinator', birthDate: '2008-12-01', validFrom: '2026-01-01', today })).toBe(
      'role_requires_adult',
    )
  })

  it('accepts other roles and a person without a birth date', () => {
    expect(roleAgeProblem({ role: 'coach', birthDate: '2010-05-01', validFrom: today, today })).toBeNull()
    expect(roleAgeProblem({ role: 'coordinator', birthDate: null, validFrom: today, today })).toBeNull()
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

  it('takes neither a section nor a place for a treasurer (#245)', () => {
    expect(roleScopeProblem('treasurer', {})).toBeNull()
    expect(roleScopeProblem('treasurer', { sectionId: 'section-a' })).toBe('unexpected')
    expect(roleScopeProblem('treasurer', { placeId: 'hall' })).toBe('unexpected')
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

  it('adds the club-wide treasurer grant for an active treasurer assignment only (DD-33, #245)', () => {
    const treasurer = (validTo: string | null): AssignmentRecord => ({
      role: 'treasurer',
      validFrom: '2026-01-01',
      validTo,
      sectionId: null,
    })
    expect(personScope({ personId: 'p1', assignments: [treasurer(null)], guardianships: [] }, today)).toEqual([
      { kind: 'treasurer' },
      { kind: 'self', ids: ['p1'] },
    ])
    expect(personScope({ personId: 'p1', assignments: [treasurer('2026-10-26')], guardianships: [] }, today)).toEqual([
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
      ['account_not_found', 404],
      ['invitation_not_pending', 409],
      ['last_club_admin', 422],
      ['account_has_purpose', 409],
      ['club_admin_exists', 409],
      ['user_not_in_organization', 404],
      ['departure_date_in_past', 422],
      ['departure_blocked', 409],
      ['departure_preview_stale', 409],
      ['departure_payer_required', 422],
      ['departure_handover_required', 422],
      ['departure_handover_invalid', 422],
      ['departure_undo_expired', 409],
      ['person_not_left', 409],
      ['departure_request_exists', 409],
      ['departure_request_minor', 422],
      ['departure_request_not_open', 409],
      ['pesel_duplicate', 409],
      ['pesel_invalid', 422],
      ['phone_invalid', 422],
      ['role_scope_required', 422],
      ['role_scope_unexpected', 422],
      ['role_place_invalid', 422],
      ['role_requires_adult', 422],
      ['guardianship_self', 422],
      ['guardianship_primary_payer_conflict', 409],
      ['guardianship_ended', 409],
      ['guardianship_duplicate', 409],
      ['guardianship_guardian_is_ward', 422],
      ['guardianship_ward_is_guardian', 422],
      ['role_assignment_duplicate', 409],
      ['person_not_linked', 404],
      ['consents_minor', 422],
      ['payments_minor', 403],
      ['external_id_duplicate', 409],
      ['import_mapping_invalid', 422],
      ['import_already_committed', 409],
      ['import_cancelled', 409],
      ['import_review_pending', 422],
      ['import_decision_invalid', 422],
      ['import_person_not_found', 422],
      ['import_progress_unavailable', 503],
      ['people_filter_age_range', 400],
      ['people_filter_unavailable', 400],
      ['people_filter_too_broad', 422],
      ['people_filter_failed', 503],
      ['person_photo_format_unsupported', 422],
      ['person_photo_too_large', 422],
      ['anonymize_blocked', 409],
      ['confirmation_mismatch', 422],
      ['person_in_use', 409],
      ['person_anonymized', 409],
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

describe('holdsOwnConsents (REQ-L10)', () => {
  it('holds own consents from the 18th birthday with a known birth date', () => {
    expect(holdsOwnConsents('2008-11-19', '2026-11-19')).toBe(true)
    expect(holdsOwnConsents('2008-11-20T00:00:00.000Z', '2026-11-19')).toBe(false)
    expect(holdsOwnConsents(null, '2026-11-19')).toBe(false)
    expect(holdsOwnConsents(undefined, '2026-11-19')).toBe(false)
    expect(holdsOwnConsents('not a date', '2026-11-19')).toBe(false)
  })
})

describe('effectiveConsents (REQ-L10)', () => {
  const entry = (granted: boolean, at: string) => ({ granted, at, by_person_id: null })
  it('takes the adult’s own decision when there is one', () => {
    const own = { image: entry(false, '2026-11-02T10:00:00.000Z') }
    const guardian = { image: entry(true, '2026-11-05T10:00:00.000Z'), trips: entry(true, '2026-11-01T10:00:00.000Z') }
    expect(effectiveConsents(own, [guardian])).toEqual({ regulations: false, image: false, trips: true })
  })
  it('takes the most recent decision among the active guardianships', () => {
    const first = { regulations: entry(true, '2026-11-01T10:00:00.000Z') }
    const second = { regulations: entry(false, '2026-11-03T10:00:00.000Z'), image: entry(true, '2026-11-01T00:00:00Z') }
    expect(effectiveConsents(null, [second, first])).toEqual({ regulations: false, image: true, trips: false })
    expect(effectiveConsents(null, [first, second]).regulations).toBe(false)
    expect(effectiveConsents(null, [])).toEqual({ regulations: false, image: false, trips: false })
  })
})

describe('givenToEarlierWording (DD-L11)', () => {
  it('marks a consent given before the text changed', () => {
    const consent = { granted: true, at: '2026-11-01T10:00:00.000Z' }
    expect(givenToEarlierWording(consent, '2026-11-02T10:00:00.000Z')).toBe(true)
    expect(givenToEarlierWording(consent, '2026-10-30T10:00:00.000Z')).toBe(false)
    expect(givenToEarlierWording(consent, null)).toBe(false)
    expect(givenToEarlierWording({ granted: false, at: consent.at }, '2026-11-02T10:00:00.000Z')).toBe(false)
    expect(givenToEarlierWording({ granted: true, at: null }, '2026-11-02T10:00:00.000Z')).toBe(false)
  })
})
