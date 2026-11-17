import { describe, expect, it } from '@jest/globals'
import {
  MANUAL_DUE_MONTHS,
  MAX_MANUAL_DESCRIPTION_LENGTH,
  MIN_MANUAL_DESCRIPTION_LENGTH,
  assignPayerRefusal,
  manualDueDateInRange,
  manualDueRange,
  manualPayerOf,
  payerEligible,
  payerOptionIds,
  shiftMonths,
  type PayerFacts,
} from '../manual-charges'

const today = '2026-11-17'

function facts(change: Partial<PayerFacts> = {}): PayerFacts {
  return {
    debtorId: 'ward',
    guardianIds: [],
    primaryPayerId: null,
    debtorBirthDate: '2016-05-01',
    today,
    ...change,
  }
}

describe('manual charge bounds', () => {
  it('exposes the description length and the due-date window of the spec', () => {
    expect(MIN_MANUAL_DESCRIPTION_LENGTH).toBe(3)
    expect(MAX_MANUAL_DESCRIPTION_LENGTH).toBe(200)
    expect(MANUAL_DUE_MONTHS).toBe(12)
  })

  it('shifts by whole months across years in both directions', () => {
    expect(shiftMonths('2026-11-17', 12)).toBe('2027-11-17')
    expect(shiftMonths('2026-11-17', -12)).toBe('2025-11-17')
    expect(shiftMonths('2026-11-17', 2)).toBe('2027-01-17')
    expect(shiftMonths('2026-01-17', -1)).toBe('2025-12-17')
    expect(shiftMonths('2026-03-15', 0)).toBe('2026-03-15')
  })

  it('clamps a day the target month lacks to its last day', () => {
    expect(shiftMonths('2027-01-31', 1)).toBe('2027-02-28')
    expect(shiftMonths('2028-03-31', -1)).toBe('2028-02-29')
    expect(shiftMonths('2028-02-29', 12)).toBe('2029-02-28')
  })

  it('accepts a due date from 12 months back to 12 months ahead, both inclusive', () => {
    expect(manualDueRange(today)).toEqual({ from: '2025-11-17', to: '2027-11-17' })
    expect(manualDueDateInRange('2025-11-17', today)).toBe(true)
    expect(manualDueDateInRange('2027-11-17', today)).toBe(true)
    expect(manualDueDateInRange(today, today)).toBe(true)
    expect(manualDueDateInRange('2025-11-16', today)).toBe(false)
    expect(manualDueDateInRange('2027-11-18', today)).toBe(false)
  })
})

describe('payer eligibility', () => {
  it('offers the active guardians of a minor, once each', () => {
    expect(payerOptionIds(facts({ guardianIds: ['mother', 'father', 'mother'] }))).toEqual(['mother', 'father'])
  })

  it('adds an adult debtor after their guardians, and never twice', () => {
    const adult = { debtorBirthDate: '2000-01-01' }
    expect(payerOptionIds(facts({ ...adult, guardianIds: ['carer'] }))).toEqual(['carer', 'ward'])
    expect(payerOptionIds(facts({ ...adult, guardianIds: ['ward'] }))).toEqual(['ward'])
  })

  it('offers nobody for a minor without a guardian or a debtor without a birth date', () => {
    expect(payerOptionIds(facts())).toEqual([])
    expect(payerOptionIds(facts({ debtorBirthDate: null }))).toEqual([])
  })

  it('accepts only a guardian of the debtor or the adult debtor', () => {
    expect(payerEligible('mother', facts({ guardianIds: ['mother'] }))).toBe(true)
    expect(payerEligible('stranger', facts({ guardianIds: ['mother'] }))).toBe(false)
    expect(payerEligible('ward', facts())).toBe(false)
    expect(payerEligible('ward', facts({ debtorBirthDate: '2000-01-01' }))).toBe(true)
  })
})

describe('manualPayerOf', () => {
  it('takes the primary payer first', () => {
    expect(manualPayerOf(facts({ primaryPayerId: 'mother', debtorBirthDate: '2000-01-01' }))).toBe('mother')
  })

  it('lets an adult without a primary payer pay for themselves', () => {
    expect(manualPayerOf(facts({ debtorBirthDate: '2000-01-01' }))).toBe('ward')
  })

  it('leaves a minor without a primary payer, or a debtor without a birth date, without a payer', () => {
    expect(manualPayerOf(facts({ guardianIds: ['mother'] }))).toBeNull()
    expect(manualPayerOf(facts({ debtorBirthDate: null }))).toBeNull()
  })
})

describe('assignPayerRefusal', () => {
  it('allows an open or partially paid charge without a payer', () => {
    expect(assignPayerRefusal({ status: 'open', payerMissing: true })).toBeNull()
    expect(assignPayerRefusal({ status: 'partially_paid', payerMissing: true })).toBeNull()
  })

  it('refuses a charge that already has a payer', () => {
    expect(assignPayerRefusal({ status: 'open', payerMissing: false })).toBe('charge_payer_already_set')
  })

  it('refuses a paid, cancelled or forfeited charge', () => {
    expect(assignPayerRefusal({ status: 'paid', payerMissing: true })).toBe('charge_not_payable')
    expect(assignPayerRefusal({ status: 'cancelled', payerMissing: true })).toBe('charge_not_payable')
    expect(assignPayerRefusal({ status: 'forfeited', payerMissing: false })).toBe('charge_not_payable')
  })
})
