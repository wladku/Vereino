import { describe, expect, it } from '@jest/globals'
import {
  HAND_OVER_STATUSES,
  canHandOver,
  childTotals,
  coachCashRefusal,
  describeCharge,
  effectiveFeeAccess,
  feeChargeVisible,
  filterChildren,
  groupFilterOf,
  groupTotals,
  handOverRefusal,
  orderChargeVisible,
  overdueByPayer,
} from '../group-charges'

describe('groupFilterOf', () => {
  it('gives the club administrator every group', () => {
    expect(groupFilterOf([{ kind: 'self', ids: ['p'] }, { kind: 'club_admin' }])).toBeNull()
  })

  it("collects a coordinator's sections and a coach's groups, once each", () => {
    expect(
      groupFilterOf([
        { kind: 'coordinator', ids: ['s1'] },
        { kind: 'coach', ids: ['g1', 'o1'] },
        { kind: 'coach', ids: ['g1'] },
        { kind: 'coordinator' },
      ]),
    ).toEqual({ sectionIds: ['s1'], groupIds: ['g1', 'o1'] })
  })

  it('covers nothing for a member or a guardian', () => {
    expect(
      groupFilterOf([
        { kind: 'self', ids: ['p'] },
        { kind: 'guardian', ids: ['w'] },
      ]),
    ).toBeUndefined()
  })
})

describe('effectiveFeeAccess', () => {
  it('binds everyone but the club administrator to the setting', () => {
    expect(effectiveFeeAccess('view', true)).toBe('collect')
    expect(effectiveFeeAccess('view', false)).toBe('view')
    expect(effectiveFeeAccess('none', false)).toBe('none')
  })
})

describe('feeChargeVisible', () => {
  const fee = (
    status: 'open' | 'partially_paid' | 'paid' | 'cancelled' | 'forfeited',
    periodLabel: string,
    remaining: number,
  ) => ({
    status,
    periodLabel,
    remaining,
  })

  it('shows open fees of any period and the current one once paid', () => {
    expect(feeChargeVisible(fee('open', '2026-09', 100), '2026-11', 'collect')).toBe(true)
    expect(feeChargeVisible(fee('partially_paid', '2026-10', 50), '2026-11', 'view')).toBe(true)
    expect(feeChargeVisible(fee('paid', '2026-11', 0), '2026-11', 'collect')).toBe(true)
  })

  it('hides older paid fees, cancelled and forfeited ones and every fee with "none"', () => {
    expect(feeChargeVisible(fee('paid', '2026-10', 0), '2026-11', 'collect')).toBe(false)
    expect(feeChargeVisible(fee('open', '2026-11', 0), '2026-10', 'collect')).toBe(false)
    expect(feeChargeVisible(fee('cancelled', '2026-11', 100), '2026-11', 'collect')).toBe(false)
    expect(feeChargeVisible(fee('forfeited', '2026-11', 100), '2026-11', 'collect')).toBe(false)
    expect(feeChargeVisible(fee('open', '2026-11', 100), '2026-11', 'none')).toBe(false)
  })
})

describe('orderChargeVisible', () => {
  it('shows orders from the collection on until the campaign is completed and paid', () => {
    expect(orderChargeVisible('open', 'open')).toBe(true)
    expect(orderChargeVisible('delivered', 'paid')).toBe(true)
    expect(orderChargeVisible('completed', 'partially_paid')).toBe(true)
    expect(orderChargeVisible('completed', 'paid')).toBe(false)
  })

  it('hides drafts and cancelled or forfeited charges', () => {
    expect(orderChargeVisible('draft', 'open')).toBe(false)
    expect(orderChargeVisible('open', 'cancelled')).toBe(false)
    expect(orderChargeVisible('open', 'forfeited')).toBe(false)
  })
})

describe('coachCashRefusal', () => {
  it('takes cash for fees only with "collect" and never without a payer', () => {
    expect(coachCashRefusal({ kind: 'fee', payerPersonId: 'p' }, 'collect')).toBeNull()
    expect(coachCashRefusal({ kind: 'fee', payerPersonId: 'p' }, 'view')).toBe('coach_fee_cash_disabled')
    expect(coachCashRefusal({ kind: 'order', payerPersonId: 'p' }, 'none')).toBeNull()
    expect(coachCashRefusal({ kind: 'order', payerPersonId: null }, 'collect')).toBe('charge_payer_missing')
  })
})

describe('describeCharge', () => {
  const line = {
    id: 'c',
    kind: 'fee' as const,
    status: 'open' as const,
    dueDate: '2026-10-05',
    remaining: 15000,
    payerPersonId: 'p',
  }

  it('marks an overdue, collectible charge', () => {
    expect(describeCharge(line, 'collect', '2026-11-09')).toEqual({ ...line, overdue: true, collectible: true })
  })

  it('is not collectible when paid, view-only or without a payer', () => {
    expect(describeCharge({ ...line, status: 'paid', remaining: 0 }, 'collect', '2026-11-09')).toMatchObject({
      overdue: false,
      collectible: false,
    })
    expect(describeCharge(line, 'view', '2026-10-01')).toMatchObject({ overdue: false, collectible: false })
    expect(describeCharge({ ...line, payerPersonId: null }, 'collect', '2026-11-09').collectible).toBe(false)
  })
})

describe('childTotals and groupTotals', () => {
  it("sums a child's due, overdue and missing payer", () => {
    expect(
      childTotals([
        { remaining: 15000, overdue: true, payerPersonId: 'p' },
        { remaining: 8500, overdue: false, payerPersonId: null },
        { remaining: 0, overdue: false, payerPersonId: null },
      ]),
    ).toEqual({ due: 23500, overdue: true, payerMissing: true })
    expect(childTotals([])).toEqual({ due: 0, overdue: false, payerMissing: false })
  })

  it('counts the people to pay and overdue in a group', () => {
    expect(
      groupTotals([
        { due: 23500, overdue: true },
        { due: 15000, overdue: false },
        { due: 0, overdue: false },
      ]),
    ).toEqual({ totalDue: 38500, peopleToPay: 2, peopleOverdue: 1 })
  })
})

describe('filterChildren', () => {
  it('keeps everyone or only those with something due', () => {
    const children = [
      { id: 'a', due: 0 },
      { id: 'b', due: 100 },
    ]
    expect(filterChildren(children, false)).toEqual(children)
    expect(filterChildren(children, true)).toEqual([{ id: 'b', due: 100 }])
  })
})

describe('overdueByPayer', () => {
  it('groups overdue charges with a payer and something left by payer', () => {
    const a = { id: 'a', overdue: true, remaining: 100, payerPersonId: 'p1' }
    const b = { id: 'b', overdue: true, remaining: 100, payerPersonId: 'p2' }
    const c = { id: 'c', overdue: true, remaining: 50, payerPersonId: 'p1' }
    const skipped = [
      { id: 'd', overdue: false, remaining: 100, payerPersonId: 'p1' },
      { id: 'e', overdue: true, remaining: 0, payerPersonId: 'p1' },
      { id: 'f', overdue: true, remaining: 100, payerPersonId: null },
    ]
    expect([...overdueByPayer([a, ...skipped, b, c]).entries()]).toEqual([
      ['p1', [a, c]],
      ['p2', [b]],
    ])
  })
})

describe('handOverRefusal and canHandOver', () => {
  const base = { campaignStatus: 'delivered' as const, handedOver: false, remaining: 0, confirmUnpaid: false }

  it('hands over a paid kit after the delivery', () => {
    expect(HAND_OVER_STATUSES).toEqual(['delivered', 'completed'])
    expect(handOverRefusal(base)).toBeNull()
    expect(handOverRefusal({ ...base, campaignStatus: 'completed' })).toBeNull()
    expect(canHandOver('delivered', false)).toBe(true)
  })

  it('refuses before the delivery and a second time', () => {
    expect(handOverRefusal({ ...base, campaignStatus: 'ordered' })).toBe('order_not_delivered')
    expect(handOverRefusal({ ...base, handedOver: true })).toBe('order_already_handed_over')
    expect(canHandOver('closed', false)).toBe(false)
    expect(canHandOver('delivered', true)).toBe(false)
  })

  it('hands over an unpaid kit only after the warning', () => {
    expect(handOverRefusal({ ...base, remaining: 100 })).toBe('order_unpaid_confirm_required')
    expect(handOverRefusal({ ...base, remaining: 100, confirmUnpaid: true })).toBeNull()
  })
})
