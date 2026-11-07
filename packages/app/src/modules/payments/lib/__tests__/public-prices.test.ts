import { describe, expect, it } from '@jest/globals'
import { publicPricesBlock, siblingPercentFor, type PublicDiscountRuleRow, type PublicFeeRow } from '../public-prices'

const today = '2026-11-06'

function fee(groupId: string | null, amount: number, extra: Partial<PublicFeeRow> = {}): PublicFeeRow {
  return { groupId, amount, period: 'monthly', validFrom: '2026-01-01', validTo: null, ...extra }
}

function rule(percent: number | null, extra: Partial<PublicDiscountRuleRow> = {}): PublicDiscountRuleRow {
  return {
    kind: 'sibling',
    percent,
    conditions: { feePeriods: ['monthly'], fullRate: 'oldest' },
    validFrom: '2026-01-01',
    validTo: null,
    ...extra,
  }
}

describe('siblingPercentFor', () => {
  it('picks the most favorable sibling percent valid today that covers the period', () => {
    expect(siblingPercentFor([rule(20), rule(30), rule(10)], 'monthly', today)).toBe(30)
  })

  it('ignores custom rules, rules without a percent, other periods and rules not valid today', () => {
    const rules = [
      rule(50, { kind: 'custom', conditions: { feePeriods: ['monthly'], personIds: ['p'] } }),
      rule(null),
      rule(40, { conditions: { feePeriods: ['one_off'], fullRate: 'oldest' } }),
      rule(45, { validFrom: '2026-12-01' }),
      rule(35, { validTo: '2026-11-05' }),
    ]
    expect(siblingPercentFor(rules, 'monthly', today)).toBeNull()
    expect(siblingPercentFor(rules, 'one_off', today)).toBe(40)
  })
})

describe('publicPricesBlock', () => {
  it('lists the valid fees of each public group in the groups order with the sibling discount', () => {
    const fees = [
      fee('b', 12000),
      fee('a', 30000, { period: 'one_off' }),
      fee('a', 2000, { period: 'per_occurrence' }),
      fee('a', 15000),
      fee('a', 9000),
      fee(null, 50000),
      fee('hidden', 10000),
    ]
    expect(publicPricesBlock(['a', 'b', 'a'], fees, [rule(30)], today)).toEqual({
      groups: [
        {
          groupId: 'a',
          fees: [
            { amount: 9000, currency: 'PLN', period: 'monthly', siblingDiscountPercent: 30 },
            { amount: 15000, currency: 'PLN', period: 'monthly', siblingDiscountPercent: 30 },
            { amount: 30000, currency: 'PLN', period: 'one_off', siblingDiscountPercent: null },
            { amount: 2000, currency: 'PLN', period: 'per_occurrence', siblingDiscountPercent: null },
          ],
        },
        { groupId: 'b', fees: [{ amount: 12000, currency: 'PLN', period: 'monthly', siblingDiscountPercent: 30 }] },
      ],
    })
  })

  it('leaves out fees not valid today and groups without a valid fee', () => {
    const fees = [
      fee('a', 12000, { validFrom: '2026-12-01' }),
      fee('a', 11000, { validTo: '2026-10-31' }),
      fee('b', 5000),
    ]
    expect(publicPricesBlock(['a', 'b'], fees, [], today)).toEqual({
      groups: [
        { groupId: 'b', fees: [{ amount: 5000, currency: 'PLN', period: 'monthly', siblingDiscountPercent: null }] },
      ],
    })
  })

  it('is null when no public group has a valid fee', () => {
    expect(publicPricesBlock(['a'], [fee('b', 100)], [rule(30)], today)).toBeNull()
    expect(publicPricesBlock([], [], [], today)).toBeNull()
  })
})
