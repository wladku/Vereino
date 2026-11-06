import { describe, expect, it } from '@jest/globals'
import {
  bestDiscount,
  compareByAge,
  payerOf,
  planCharges,
  siblingDiscounted,
  type PlanFee,
  type PlanInput,
  type PlanRule,
} from '../charge-plan'

const zaki: PlanFee = { id: 'fee-zaki', name: 'Żaki', amount: 15000, period: 'monthly', dueDay: 10 }
const basen: PlanFee = { id: 'fee-basen', name: 'Basen', amount: 12000, period: 'monthly', dueDay: 5 }
const camp: PlanFee = { id: 'fee-camp', name: 'Obóz', amount: 90000, period: 'one_off', dueDay: 15 }

const sibling30: PlanRule = {
  id: 'rule-sibling',
  name: 'Rodzeństwo',
  kind: 'sibling',
  percent: 30,
  amount: null,
  conditions: { feePeriods: ['monthly'], fullRate: 'oldest' },
}

function input(overrides: Partial<PlanInput> = {}): PlanInput {
  return {
    period: '2026-12',
    referenceDate: '2026-12-01',
    fees: [zaki, basen],
    // Ola (older) plays in Żaki, Kuba (younger) swims; both are wards of the guardian Anna.
    participants: new Map([
      ['fee-zaki', ['ola', 'adam']],
      ['fee-basen', ['kuba', 'minor']],
    ]),
    birthDates: new Map([
      ['ola', '2016-03-01'],
      ['kuba', '2018-06-01'],
      ['adam', '1990-01-01'],
      ['minor', '2015-01-01'],
    ]),
    primaryPayers: new Map([
      ['ola', 'anna'],
      ['kuba', 'anna'],
    ]),
    rules: [sibling30],
    existing: [],
    ...overrides,
  }
}

describe('payerOf', () => {
  const ctx = {
    referenceDate: '2026-12-01',
    primaryPayers: new Map([['ola', 'anna']]),
    birthDates: new Map<string, string | null>([
      ['adam', '1990-01-01'],
      ['minor', '2015-01-01'],
      ['unknown', null],
    ]),
  }

  it('is the primary-payer guardian', () => {
    expect(payerOf('ola', ctx)).toBe('anna')
  })

  it('is the adult themselves without a guardian', () => {
    expect(payerOf('adam', ctx)).toBe('adam')
  })

  it('is nobody for a minor or an unknown birth date', () => {
    expect(payerOf('minor', ctx)).toBeNull()
    expect(payerOf('unknown', ctx)).toBeNull()
    expect(payerOf('absent', ctx)).toBeNull()
  })
})

describe('compareByAge', () => {
  it('puts the oldest first and an unknown birth date last', () => {
    expect(compareByAge({ id: 'a', birthDate: '2016-01-01' }, { id: 'b', birthDate: '2018-01-01' })).toBe(-1)
    expect(compareByAge({ id: 'a', birthDate: '2018-01-01' }, { id: 'b', birthDate: '2016-01-01' })).toBe(1)
    expect(compareByAge({ id: 'a', birthDate: null }, { id: 'b', birthDate: '2016-01-01' })).toBe(1)
    expect(compareByAge({ id: 'a', birthDate: '2016-01-01' }, { id: 'b', birthDate: null })).toBe(-1)
  })

  it('orders equal birth dates by id', () => {
    expect(compareByAge({ id: 'a', birthDate: null }, { id: 'b', birthDate: null })).toBe(-1)
    expect(compareByAge({ id: 'b', birthDate: '2016-01-01' }, { id: 'a', birthDate: '2016-01-01' })).toBe(1)
    expect(compareByAge({ id: 'a', birthDate: '2016-01-01' }, { id: 'a', birthDate: '2016-01-01' })).toBe(0)
  })
})

describe('siblingDiscounted', () => {
  const birthDates = new Map([
    ['ola', '2016-03-01'],
    ['kuba', '2018-06-01'],
    ['ela', '2020-01-01'],
  ])
  const candidates = [
    { feeId: 'fee-zaki', personId: 'ola', payerPersonId: 'anna', period: 'monthly' as const },
    { feeId: 'fee-basen', personId: 'kuba', payerPersonId: 'anna', period: 'monthly' as const },
    { feeId: 'fee-zaki', personId: 'kuba', payerPersonId: 'anna', period: 'monthly' as const },
    { feeId: 'fee-camp', personId: 'ela', payerPersonId: 'anna', period: 'one_off' as const },
    { feeId: 'fee-zaki', personId: 'solo', payerPersonId: 'piotr', period: 'monthly' as const },
    // Two children of one payer without known birth dates are ranked by id.
    { feeId: 'fee-basen', personId: 'nobirth', payerPersonId: 'piotr', period: 'monthly' as const },
    { feeId: 'fee-zaki', personId: 'orphan', payerPersonId: null, period: 'monthly' as const },
  ]

  it('discounts every child of a payer but the oldest, on the covered fee periods', () => {
    const result = siblingDiscounted([sibling30], candidates, birthDates)
    expect([...(result.get('rule-sibling') ?? [])]).toEqual(['kuba', 'solo'])
  })

  it('lets the youngest pay the full rate when the rule says so, across fee periods it covers', () => {
    const youngest: PlanRule = {
      ...sibling30,
      id: 'rule-youngest',
      conditions: { feePeriods: ['monthly', 'one_off'], fullRate: 'youngest' },
    }
    const result = siblingDiscounted([youngest], candidates, birthDates)
    expect([...(result.get('rule-youngest') ?? [])].sort()).toEqual(['kuba', 'nobirth', 'ola'])
  })

  it('never ranks a paying adult among the wards they pay for', () => {
    const withParent = [
      { feeId: 'fee-zumba', personId: 'anna', payerPersonId: 'anna', period: 'monthly' as const },
      ...candidates,
    ]
    const dates = new Map([...birthDates, ['anna', '1986-01-01']])
    expect([...(siblingDiscounted([sibling30], withParent, dates).get('rule-sibling') ?? [])]).toEqual(['kuba', 'solo'])
    const youngest: PlanRule = {
      ...sibling30,
      id: 'rule-youngest',
      conditions: { feePeriods: ['monthly'], fullRate: 'youngest' },
    }
    expect([...(siblingDiscounted([youngest], withParent, dates).get('rule-youngest') ?? [])]).not.toContain('anna')
  })

  it('ignores custom rules', () => {
    const custom: PlanRule = { ...sibling30, id: 'custom', kind: 'custom', conditions: { feePeriods: ['monthly'] } }
    expect(siblingDiscounted([custom], candidates, birthDates).size).toBe(0)
  })
})

describe('bestDiscount', () => {
  const custom20: PlanRule = {
    id: 'rule-custom',
    name: 'Ulga socjalna',
    kind: 'custom',
    percent: null,
    amount: 2000,
    conditions: { feePeriods: ['monthly'], personIds: ['kuba'] },
  }
  const siblings = new Map([['rule-sibling', new Set(['kuba'])]])

  it('takes the most favorable matching rule', () => {
    expect(
      bestDiscount({ personId: 'kuba', period: 'monthly', amount: 12000 }, [custom20, sibling30], siblings),
    ).toEqual({
      ruleId: 'rule-sibling',
      amount: 3600,
    })
    expect(
      bestDiscount({ personId: 'kuba', period: 'monthly', amount: 5000 }, [sibling30, custom20], siblings),
    ).toEqual({
      ruleId: 'rule-custom',
      amount: 2000,
    })
  })

  it('skips rules for other periods, other persons, unranked siblings and a zero discount', () => {
    expect(
      bestDiscount({ personId: 'kuba', period: 'one_off', amount: 12000 }, [sibling30, custom20], siblings),
    ).toBeNull()
    expect(
      bestDiscount({ personId: 'ola', period: 'monthly', amount: 12000 }, [sibling30, custom20], siblings),
    ).toBeNull()
    expect(bestDiscount({ personId: 'kuba', period: 'monthly', amount: 12000 }, [sibling30], new Map())).toBeNull()
    const noPersons: PlanRule = { ...custom20, conditions: { feePeriods: ['monthly'] } }
    expect(bestDiscount({ personId: 'kuba', period: 'monthly', amount: 12000 }, [noPersons], siblings)).toBeNull()
    const zero: PlanRule = { ...custom20, amount: null, percent: null }
    expect(bestDiscount({ personId: 'kuba', period: 'monthly', amount: 12000 }, [zero], siblings)).toBeNull()
  })

  it('breaks ties by rule name, then id, and keeps the first of equal ones', () => {
    const a: PlanRule = { ...custom20, id: 'z', name: 'A' }
    const b: PlanRule = { ...custom20, id: 'y', name: 'B' }
    const aSameName: PlanRule = { ...custom20, id: 'x', name: 'A' }
    const charge = { personId: 'kuba', period: 'monthly' as const, amount: 12000 }
    expect(bestDiscount(charge, [b, a], siblings)?.ruleId).toBe('z')
    expect(bestDiscount(charge, [a, b], siblings)?.ruleId).toBe('z')
    expect(bestDiscount(charge, [a, aSameName], siblings)?.ruleId).toBe('x')
    expect(bestDiscount(charge, [aSameName, a], siblings)?.ruleId).toBe('x')
  })
})

describe('planCharges', () => {
  it('creates one charge per fee and participant with payer, discount and due date (TEST-018)', () => {
    const plan = planCharges(input())
    expect(plan.skipped).toBe(0)
    expect(plan.payerMissing).toBe(1)
    expect(plan.charges).toEqual([
      {
        feeId: 'fee-zaki',
        personId: 'ola',
        payerPersonId: 'anna',
        payerMissing: false,
        periodLabel: '2026-12',
        description: 'Żaki',
        amount: 15000,
        discountAmount: 0,
        discountRuleId: null,
        dueDate: '2026-12-10',
      },
      {
        feeId: 'fee-zaki',
        personId: 'adam',
        payerPersonId: 'adam',
        payerMissing: false,
        periodLabel: '2026-12',
        description: 'Żaki',
        amount: 15000,
        discountAmount: 0,
        discountRuleId: null,
        dueDate: '2026-12-10',
      },
      {
        feeId: 'fee-basen',
        personId: 'kuba',
        payerPersonId: 'anna',
        payerMissing: false,
        periodLabel: '2026-12',
        description: 'Basen',
        amount: 12000,
        discountAmount: 3600,
        discountRuleId: 'rule-sibling',
        dueDate: '2026-12-05',
      },
      {
        feeId: 'fee-basen',
        personId: 'minor',
        payerPersonId: null,
        payerMissing: true,
        periodLabel: '2026-12',
        description: 'Basen',
        amount: 12000,
        discountAmount: 0,
        discountRuleId: null,
        dueDate: '2026-12-05',
      },
    ])
  })

  it('skips every charge that already exists, ranking siblings against them', () => {
    const plan = planCharges(
      input({
        existing: [
          { feeId: 'fee-zaki', personId: 'ola', payerPersonId: 'anna' },
          { feeId: 'fee-zaki', personId: 'adam', payerPersonId: 'adam' },
          { feeId: 'fee-gone', personId: 'adam', payerPersonId: 'adam' },
        ],
      }),
    )
    expect(plan.skipped).toBe(2)
    expect(plan.charges.map((charge) => [charge.personId, charge.discountAmount])).toEqual([
      ['kuba', 3600],
      ['minor', 0],
    ])
  })

  it('reports a repeated run as all skipped', () => {
    const first = planCharges(input())
    const again = planCharges(
      input({
        existing: first.charges.map((charge) => ({
          feeId: charge.feeId,
          personId: charge.personId,
          payerPersonId: charge.payerPersonId,
        })),
      }),
    )
    expect(again).toEqual({ charges: [], skipped: 4, payerMissing: 0 })
  })

  it('charges a one-off fee once, discounted only when the rule covers one-off fees (TEST-048)', () => {
    const base = input({
      fees: [zaki, camp],
      participants: new Map([
        ['fee-zaki', ['ola']],
        ['fee-camp', ['kuba', 'kuba']],
      ]),
    })
    const monthlyOnly = planCharges(base)
    const campCharge = monthlyOnly.charges.find((charge) => charge.feeId === 'fee-camp')
    expect(campCharge).toMatchObject({
      periodLabel: 'one_off',
      amount: 90000,
      discountAmount: 0,
      dueDate: '2026-12-15',
    })
    expect(monthlyOnly.charges).toHaveLength(2)

    const withOneOff = planCharges({
      ...base,
      rules: [{ ...sibling30, conditions: { feePeriods: ['monthly', 'one_off'], fullRate: 'oldest' } }],
    })
    expect(withOneOff.charges.find((charge) => charge.feeId === 'fee-camp')).toMatchObject({
      discountAmount: 27000,
      discountRuleId: 'rule-sibling',
    })
  })

  it('multiplies a per-session fee by the sessions and creates nothing without sessions', () => {
    const perSession: PlanFee = {
      id: 'fee-ps',
      name: 'Zumba',
      amount: 2500,
      period: 'per_occurrence',
      dueDay: 1,
      sessionCount: 4,
    }
    const none: PlanFee = { id: 'fee-none', name: 'Szachy', amount: 2500, period: 'per_occurrence', dueDay: 1 }
    const plan = planCharges(
      input({
        fees: [perSession, none, basen],
        participants: new Map([
          ['fee-ps', ['adam']],
          ['fee-none', ['adam']],
        ]),
      }),
    )
    expect(plan.charges).toHaveLength(1)
    expect(plan.charges[0]).toMatchObject({ feeId: 'fee-ps', amount: 10000, dueDate: '2026-12-01' })
  })
})
