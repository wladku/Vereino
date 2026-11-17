import { describe, expect, it } from '@jest/globals'
import {
  COACH_TERMS_BY_MODEL,
  FACILITY_TERM_FIELDS,
  MAX_PAYMENT_DEADLINE_DAYS,
  MAX_RATE_GROSZ,
  coachTermsForModel,
  contractRateColumns,
  contractOn,
  facilityAgreementOf,
  invalidFacilityTerm,
  missingCoachTerms,
  overlappingContract,
  parseCoachTerms,
  parseContractTerms,
  parseFacilityTerms,
  partyAllowed,
} from '../contracts'

describe('management agreement terms (facilities parity DD-R10; #284)', () => {
  it('reads the stored rental terms, dropping anything invalid', () => {
    expect(FACILITY_TERM_FIELDS).toEqual(['paymentDeadlineDays', 'autoExpireUnpaid'])
    expect(MAX_PAYMENT_DEADLINE_DAYS).toBe(60)
    expect(parseFacilityTerms('{"paymentDeadlineDays":5,"autoExpireUnpaid":true,"x":1}')).toEqual({
      paymentDeadlineDays: 5,
      autoExpireUnpaid: true,
    })
    expect(parseFacilityTerms({ paymentDeadlineDays: 0, autoExpireUnpaid: false })).toEqual({
      paymentDeadlineDays: 0,
      autoExpireUnpaid: false,
    })
    expect(parseFacilityTerms({ paymentDeadlineDays: 61, autoExpireUnpaid: 'yes' })).toEqual({})
    expect(parseFacilityTerms({ paymentDeadlineDays: -1 })).toEqual({})
    expect(parseFacilityTerms({ paymentDeadlineDays: 2.5 })).toEqual({})
    expect(parseFacilityTerms({ paymentDeadlineDays: '5' })).toEqual({})
    expect(parseFacilityTerms('not json')).toEqual({})
    expect(parseFacilityTerms('[1]')).toEqual({})
    expect(parseFacilityTerms(null)).toEqual({})
  })

  it('names the first invalid term of a write, or null', () => {
    expect(invalidFacilityTerm({ paymentDeadlineDays: 61 })).toBe('paymentDeadlineDays')
    expect(invalidFacilityTerm({ paymentDeadlineDays: -1 })).toBe('paymentDeadlineDays')
    expect(invalidFacilityTerm({ paymentDeadlineDays: 1.5, autoExpireUnpaid: 'x' })).toBe('paymentDeadlineDays')
    expect(invalidFacilityTerm({ autoExpireUnpaid: 'x' })).toBe('autoExpireUnpaid')
    expect(invalidFacilityTerm({ paymentDeadlineDays: 60, autoExpireUnpaid: true })).toBeNull()
    expect(invalidFacilityTerm({ paymentDeadlineDays: 0 })).toBeNull()
    expect(invalidFacilityTerm({ paymentDeadlineDays: null, autoExpireUnpaid: null })).toBeNull()
    expect(invalidFacilityTerm({})).toBeNull()
  })

  it('reads the terms by the contract kind', () => {
    const stored = '{"paymentDeadlineDays":5,"baseMonthly":100}'
    expect(parseContractTerms('facility_management', stored)).toEqual({ paymentDeadlineDays: 5 })
    expect(parseContractTerms('coach', stored)).toEqual({ baseMonthly: 100 })
    expect(parseContractTerms('coach', null)).toBeNull()
    expect(parseContractTerms(null, undefined)).toBeNull()
  })

  it('makes the unset agreement terms explicit', () => {
    expect(facilityAgreementOf({})).toEqual({ paymentDeadlineDays: null, autoExpireUnpaid: false })
    expect(facilityAgreementOf({ paymentDeadlineDays: 5, autoExpireUnpaid: true })).toEqual({
      paymentDeadlineDays: 5,
      autoExpireUnpaid: true,
    })
  })
})

describe('coach contract terms (#96, R14)', () => {
  it('reads the stored rates, dropping anything that is not a whole, non-negative grosz amount', () => {
    expect(parseCoachTerms('{"baseMonthly":150000,"unitRate":8000,"matchRate":-1,"travelRate":1.5,"x":3}')).toEqual({
      baseMonthly: 150000,
      unitRate: 8000,
    })
    expect(parseCoachTerms({ sessionAmount: 0, tripAmount: MAX_RATE_GROSZ + 1 })).toEqual({ sessionAmount: 0 })
    expect(parseCoachTerms('not json')).toEqual({})
    expect(parseCoachTerms('[1]')).toEqual({})
    expect(parseCoachTerms(null)).toEqual({})
    expect(parseCoachTerms(42)).toEqual({})
  })

  it("lists the model's missing rates and keeps only the model's rates", () => {
    const terms = { baseMonthly: 150000, unitRate: 8000, sessionAmount: 6000 }
    expect(missingCoachTerms(terms, 'units_per_contract')).toEqual(['matchRate', 'travelRate'])
    expect(missingCoachTerms(terms, 'fixed_base_adjusted')).toEqual(['tripAmount'])
    expect(coachTermsForModel(terms, 'fixed_base_adjusted')).toEqual({ baseMonthly: 150000, sessionAmount: 6000 })
    expect(Object.keys(coachTermsForModel(terms, 'units_per_contract'))).toEqual(['baseMonthly', 'unitRate'])
    expect(COACH_TERMS_BY_MODEL.units_per_contract).toHaveLength(4)
  })

  it('puts a coach contract only with a person', () => {
    expect(partyAllowed('coach', 'person')).toBe(true)
    expect(partyAllowed('coach', 'institution')).toBe(false)
    expect(partyAllowed('facility_management', 'institution')).toBe(true)
  })
})

describe('contract periods (#96, README B-07)', () => {
  const january = { id: 'a', validFrom: '2026-01-01', validTo: '2026-01-31' }
  const open = { id: 'b', validFrom: '2026-02-01', validTo: null }

  it('finds another contract that shares a day, never the contract itself', () => {
    expect(overlappingContract({ id: 'c', validFrom: '2026-01-31', validTo: null }, [january, open])).toBe(january)
    expect(overlappingContract({ id: 'c', validFrom: '2025-12-01', validTo: '2025-12-31' }, [january, open])).toBeNull()
    expect(overlappingContract({ ...january, validTo: '2026-01-31' }, [january])).toBeNull()
  })

  it('picks the contract in force on a day, both ends inclusive', () => {
    expect(contractOn([january, open], '2026-01-31')).toBe(january)
    expect(contractOn([january, open], '2026-02-01')).toBe(open)
    expect(contractOn([january, open], '2030-05-05')).toBe(open)
    expect(contractOn([january], '2025-12-31')).toBeNull()
  })
})

describe('contract rate columns (navigation spec REQ-N12, B-07)', () => {
  it('reads Base, Per unit and Match of the units model', () => {
    expect(contractRateColumns({ baseMonthly: 150000, unitRate: 8000, matchRate: 12000, travelRate: 5000 })).toEqual({
      base: 150000,
      perUnit: 8000,
      match: 12000,
    })
  })

  it('takes the session amount as Per unit of the fixed-base model', () => {
    expect(contractRateColumns({ baseMonthly: 200000, sessionAmount: 9000, tripAmount: 4000 })).toEqual({
      base: 200000,
      perUnit: 9000,
      match: null,
    })
  })

  it('is empty without rates', () => {
    expect(contractRateColumns(null)).toEqual({ base: null, perUnit: null, match: null })
    expect(contractRateColumns(undefined)).toEqual({ base: null, perUnit: null, match: null })
  })
})
