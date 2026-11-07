import { describe, expect, it } from '@jest/globals'
import { errorCodes } from '../error-codes'
import {
  CHARGE_SOURCE_TYPES,
  CHARGE_STATUSES,
  COACH_FEE_ACCESS,
  DEFAULT_SIBLING_CONDITIONS,
  DISCOUNT_KINDS,
  FEE_PERIODS,
  FULL_RATE_CHILDREN,
  MAX_AMOUNT,
  ONE_OFF_PERIOD_LABEL,
  activeInPeriod,
  countSessions,
  discountOn,
  discountValueInvalid,
  dueDateIn,
  feeTargetInvalid,
  isBillingPeriod,
  normalizeConditions,
  periodInGenerationRange,
  periodLabelOf,
  periodOfDate,
  periodWindow,
  referenceDate,
  shiftPeriod,
} from '../payments-rules'

describe('payments vocabularies', () => {
  it('declares the fee periods, discount kinds, full-rate children, coach access, statuses and sources', () => {
    expect(FEE_PERIODS).toEqual(['monthly', 'one_off', 'per_occurrence'])
    expect(DISCOUNT_KINDS).toEqual(['sibling', 'custom'])
    expect(FULL_RATE_CHILDREN).toEqual(['oldest', 'youngest'])
    expect(COACH_FEE_ACCESS).toEqual(['collect', 'view', 'none'])
    expect(CHARGE_STATUSES).toEqual(['open', 'partially_paid', 'paid', 'cancelled', 'forfeited'])
    expect(CHARGE_SOURCE_TYPES).toEqual(['fee', 'rental', 'order', 'manual'])
    expect(DEFAULT_SIBLING_CONDITIONS).toEqual({ feePeriods: ['monthly'], fullRate: 'oldest' })
  })

  it('declares the error codes with their statuses', () => {
    expect(Object.fromEntries(errorCodes.map((entry) => [entry.code, entry.status]))).toEqual({
      fee_target_invalid: 422,
      fee_target_unknown: 422,
      fee_period_locked: 422,
      discount_value_invalid: 422,
      discount_conditions_invalid: 422,
      period_out_of_range: 422,
      generation_in_progress: 409,
      generation_already_undone: 409,
      charge_not_payable: 409,
      payment_exceeds_remaining: 422,
      payment_date_in_future: 422,
      charge_has_payments: 409,
      charge_not_cancellable: 409,
      payment_not_reversible: 409,
      payment_already_reversed: 409,
      checkout_charge_forbidden: 403,
      payer_missing: 422,
      charge_not_open: 409,
      gateway_unavailable: 502,
      payment_not_refundable: 409,
      refund_exceeds_remaining: 422,
    })
  })
})

describe('feeTargetInvalid', () => {
  it('accepts exactly one of a group and an activity', () => {
    expect(feeTargetInvalid({ groupId: 'g' })).toBe(false)
    expect(feeTargetInvalid({ activityId: 'a', groupId: null })).toBe(false)
  })

  it('refuses both and neither', () => {
    expect(feeTargetInvalid({ groupId: 'g', activityId: 'a' })).toBe(true)
    expect(feeTargetInvalid({})).toBe(true)
    expect(feeTargetInvalid({ groupId: null, activityId: null })).toBe(true)
  })
})

describe('discountValueInvalid', () => {
  it('needs exactly one of a percent and an amount', () => {
    expect(discountValueInvalid({ kind: 'custom', percent: 10, amount: 500 })).toBe(true)
    expect(discountValueInvalid({ kind: 'custom' })).toBe(true)
    expect(discountValueInvalid({ kind: 'custom', percent: null, amount: null })).toBe(true)
  })

  it('makes a sibling rule a percent', () => {
    expect(discountValueInvalid({ kind: 'sibling', amount: 500 })).toBe(true)
    expect(discountValueInvalid({ kind: 'sibling', percent: 30 })).toBe(false)
  })

  it('takes a whole percent from 1 to 100', () => {
    expect(discountValueInvalid({ kind: 'sibling', percent: 0 })).toBe(true)
    expect(discountValueInvalid({ kind: 'sibling', percent: 101 })).toBe(true)
    expect(discountValueInvalid({ kind: 'sibling', percent: 12.5 })).toBe(true)
    expect(discountValueInvalid({ kind: 'custom', percent: 1 })).toBe(false)
    expect(discountValueInvalid({ kind: 'custom', percent: 100, amount: null })).toBe(false)
  })

  it('takes a whole amount above zero and up to the maximum', () => {
    expect(discountValueInvalid({ kind: 'custom', amount: 0 })).toBe(true)
    expect(discountValueInvalid({ kind: 'custom', amount: MAX_AMOUNT + 1 })).toBe(true)
    expect(discountValueInvalid({ kind: 'custom', amount: 10.5 })).toBe(true)
    expect(discountValueInvalid({ kind: 'custom', amount: 2000, percent: undefined })).toBe(false)
  })
})

describe('normalizeConditions', () => {
  it('fills the R12 defaults of a sibling rule', () => {
    expect(normalizeConditions('sibling', null)).toEqual({ feePeriods: ['monthly'], fullRate: 'oldest' })
    expect(normalizeConditions('sibling', { personIds: ['p'] })).toEqual({
      feePeriods: ['monthly'],
      fullRate: 'oldest',
    })
  })

  it('keeps the chosen periods in their canonical order and the full-rate child', () => {
    expect(normalizeConditions('sibling', { feePeriods: ['one_off', 'monthly'], fullRate: 'youngest' })).toEqual({
      feePeriods: ['monthly', 'one_off'],
      fullRate: 'youngest',
    })
  })

  it('refuses a rule without fee periods', () => {
    expect(normalizeConditions('sibling', { feePeriods: [] })).toBeNull()
  })

  it('needs the persons of a custom rule, deduplicated', () => {
    expect(normalizeConditions('custom', { feePeriods: ['monthly'] })).toBeNull()
    expect(normalizeConditions('custom', { personIds: [] })).toBeNull()
    expect(normalizeConditions('custom', { personIds: ['a', 'b', 'a'], fullRate: 'youngest' })).toEqual({
      feePeriods: ['monthly'],
      personIds: ['a', 'b'],
    })
  })
})

describe('discountOn', () => {
  it('rounds a percent to the grosz', () => {
    expect(discountOn(12000, { percent: 30, amount: null })).toBe(3600)
    expect(discountOn(999, { percent: 15, amount: null })).toBe(150)
  })

  it('caps a fixed amount at the charge', () => {
    expect(discountOn(12000, { percent: null, amount: 2000 })).toBe(2000)
    expect(discountOn(1500, { percent: null, amount: 2000 })).toBe(1500)
    expect(discountOn(1500, { percent: null, amount: null })).toBe(0)
  })
})

describe('billing periods', () => {
  it('recognizes YYYY-MM', () => {
    expect(isBillingPeriod('2026-12')).toBe(true)
    expect(isBillingPeriod('2026-13')).toBe(false)
    expect(isBillingPeriod('2026-1')).toBe(false)
    expect(isBillingPeriod(202612)).toBe(false)
  })

  it('reads the period of a date and shifts periods across years', () => {
    expect(periodOfDate('2026-11-05')).toBe('2026-11')
    expect(shiftPeriod('2026-11', 2)).toBe('2027-01')
    expect(shiftPeriod('2026-01', -1)).toBe('2025-12')
    expect(shiftPeriod('0001-01', 0)).toBe('0001-01')
  })

  it('gives the first and last day of a month, leap years included', () => {
    expect(periodWindow('2026-12')).toEqual({ from: '2026-12-01', to: '2026-12-31' })
    expect(periodWindow('2028-02')).toEqual({ from: '2028-02-01', to: '2028-02-29' })
    expect(periodWindow('2026-04')).toEqual({ from: '2026-04-01', to: '2026-04-30' })
  })

  it('allows 12 months back and 12 ahead of the club month', () => {
    expect(periodInGenerationRange('2025-11', '2026-11-05')).toBe(true)
    expect(periodInGenerationRange('2025-10', '2026-11-05')).toBe(false)
    expect(periodInGenerationRange('2027-11', '2026-11-30')).toBe(true)
    expect(periodInGenerationRange('2027-12', '2026-11-30')).toBe(false)
  })

  it('reads a past month on its last day, a future one on its first and the current one today', () => {
    expect(referenceDate('2026-10', '2026-11-05')).toBe('2026-10-31')
    expect(referenceDate('2026-12', '2026-11-05')).toBe('2026-12-01')
    expect(referenceDate('2026-11', '2026-11-05')).toBe('2026-11-05')
  })

  it('places the due date on the payment day', () => {
    expect(dueDateIn('2026-12', 5)).toBe('2026-12-05')
    expect(dueDateIn('2026-12', 28)).toBe('2026-12-28')
  })

  it('checks a validity against the period', () => {
    expect(activeInPeriod({ validFrom: '2026-09-01', validTo: null }, '2026-12')).toBe(true)
    expect(activeInPeriod({ validFrom: '2026-12-31', validTo: null }, '2026-12')).toBe(true)
    expect(activeInPeriod({ validFrom: '2026-09-01', validTo: '2026-11-30' }, '2026-12')).toBe(false)
    expect(activeInPeriod({ validFrom: '2027-01-01', validTo: null }, '2026-12')).toBe(false)
  })

  it('labels a one-off charge `one_off` and the others with the period', () => {
    expect(periodLabelOf('one_off', '2026-12')).toBe(ONE_OFF_PERIOD_LABEL)
    expect(periodLabelOf('monthly', '2026-12')).toBe('2026-12')
    expect(periodLabelOf('per_occurrence', '2026-12')).toBe('2026-12')
  })
})

describe('countSessions', () => {
  const sessions = [
    { activityId: 'a1', groupId: 'g1', status: 'planned' },
    { activityId: 'a1', groupId: 'g1', status: 'done' },
    { activityId: 'a1', groupId: 'g1', status: 'cancelled' },
    { activityId: 'a2', groupId: 'g1', status: 'planned' },
    { activityId: 'a3', groupId: 'g2', status: 'planned' },
  ]

  it("counts an activity's sessions that are not cancelled", () => {
    expect(countSessions(sessions, { activityId: 'a1' })).toBe(2)
  })

  it("counts every activity of a group's sessions", () => {
    expect(countSessions(sessions, { groupId: 'g1', activityId: null })).toBe(3)
    expect(countSessions(sessions, { groupId: 'g3' })).toBe(0)
  })
})
