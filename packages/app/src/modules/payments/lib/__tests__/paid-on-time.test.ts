import { describe, expect, it } from '@jest/globals'
import {
  ON_TIME_SOURCE_TYPES,
  countPaidOnTime,
  countsForOnTime,
  paidByDueDate,
  type OnTimeCharge,
} from '../paid-on-time'

const TODAY = '2026-11-26'

function charge(overrides: Partial<OnTimeCharge> = {}): OnTimeCharge {
  return {
    sourceType: 'fee',
    status: 'open',
    amount: 10_000,
    discountAmount: 0,
    dueDate: '2026-11-10',
    payments: [],
    ...overrides,
  }
}

const pay = (amount: number, paidOn: string, isOverpayment = false) => ({ amount, paidOn, isOverpayment })

describe('paidByDueDate', () => {
  it('counts payments on or before the due date', () => {
    expect(paidByDueDate(charge({ payments: [pay(10_000, '2026-11-10')] }))).toBe(true)
    expect(paidByDueDate(charge({ payments: [pay(4_000, '2026-11-01'), pay(6_000, '2026-11-09')] }))).toBe(true)
  })

  it('ignores payments after the due date and overpayments', () => {
    expect(paidByDueDate(charge({ payments: [pay(10_000, '2026-11-11')] }))).toBe(false)
    expect(paidByDueDate(charge({ payments: [pay(10_000, '2026-11-01', true)] }))).toBe(false)
  })

  it('treats a partial payment as not on time and nets a reversing entry', () => {
    expect(paidByDueDate(charge({ payments: [pay(5_000, '2026-11-01')] }))).toBe(false)
    expect(paidByDueDate(charge({ payments: [pay(10_000, '2026-11-01'), pay(-10_000, '2026-11-02')] }))).toBe(false)
  })

  it('compares with the amount less the discount', () => {
    expect(paidByDueDate(charge({ discountAmount: 2_000, payments: [pay(8_000, '2026-11-01')] }))).toBe(true)
  })
})

describe('countsForOnTime', () => {
  it('counts fee and order charges only', () => {
    expect(ON_TIME_SOURCE_TYPES).toEqual(['fee', 'order'])
    expect(countsForOnTime(charge({ sourceType: 'order' }), TODAY)).toBe(true)
    expect(countsForOnTime(charge({ sourceType: 'rental' }), TODAY)).toBe(false)
    expect(countsForOnTime(charge({ sourceType: 'manual' }), TODAY)).toBe(false)
  })

  it('leaves out cancelled charges and charges with nothing to pay', () => {
    expect(countsForOnTime(charge({ status: 'cancelled' }), TODAY)).toBe(false)
    expect(countsForOnTime(charge({ discountAmount: 10_000 }), TODAY)).toBe(false)
  })

  it('counts a charge not yet due only once it is paid', () => {
    expect(countsForOnTime(charge({ dueDate: TODAY }), TODAY)).toBe(false)
    expect(countsForOnTime(charge({ dueDate: TODAY, payments: [pay(10_000, '2026-11-20')] }), TODAY)).toBe(true)
  })
})

describe('countPaidOnTime', () => {
  it('counts the issue example: 9 of 12, partial and late payments not on time, rental excluded', () => {
    const onTime = Array.from({ length: 9 }, () => charge({ status: 'paid', payments: [pay(10_000, '2026-11-05')] }))
    const late = Array.from({ length: 2 }, () => charge({ status: 'paid', payments: [pay(10_000, '2026-11-20')] }))
    const open = charge()
    const partial = charge({ status: 'partially_paid', payments: [pay(5_000, '2026-11-05')] })
    const rental = charge({ sourceType: 'rental', status: 'paid', payments: [pay(10_000, '2026-11-05')] })
    const result = countPaidOnTime([...onTime, ...late, open, rental], TODAY)
    expect(result).toEqual({ count: 9, total: 12 })
    expect(countPaidOnTime([partial], TODAY)).toEqual({ count: 0, total: 1 })
  })

  it('is zero over nothing', () => {
    expect(countPaidOnTime([], TODAY)).toEqual({ count: 0, total: 0 })
  })
})
