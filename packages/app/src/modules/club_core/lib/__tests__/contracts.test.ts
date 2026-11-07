import { describe, expect, it } from '@jest/globals'
import {
  COACH_TERMS_BY_MODEL,
  MAX_RATE_GROSZ,
  coachTermsForModel,
  contractOn,
  missingCoachTerms,
  overlappingContract,
  parseCoachTerms,
  partyAllowed,
} from '../contracts'

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
