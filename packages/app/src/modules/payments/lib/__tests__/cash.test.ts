import { describe, expect, it } from '@jest/globals'
import {
  MAX_CASH_CHARGES,
  allocateCash,
  cashRefusal,
  nextReceiptNumber,
  oldestFirst,
  payerSummaries,
  receiptPrefix,
  receiptSequence,
  receiptSummaries,
  selectedTotal,
  type CashCharge,
} from '../cash'

const charge = (id: string, dueDate: string, remaining: number, extra: Partial<CashCharge> = {}): CashCharge => ({
  id,
  status: 'open',
  dueDate,
  createdAt: '2026-10-01T10:00:00.000Z',
  remaining,
  ...extra,
})

describe('oldestFirst', () => {
  it('orders by due date, then creation, then id', () => {
    const rows = [
      charge('c', '2026-11-10', 1),
      charge('b', '2026-10-10', 1, { createdAt: '2026-10-02T00:00:00.000Z' }),
      charge('a', '2026-10-10', 1, { createdAt: '2026-10-02T00:00:00.000Z' }),
      charge('d', '2026-10-10', 1, { createdAt: '2026-10-01T00:00:00.000Z' }),
    ]
    expect(oldestFirst(rows).map((row) => row.id)).toEqual(['d', 'a', 'b', 'c'])
    expect(rows[0]?.id).toBe('c')
  })
})

describe('allocateCash', () => {
  const kit = charge('kit', '2026-11-15', 8500)
  const fee = charge('fee', '2026-10-10', 15000)

  it('pays every selected charge in full', () => {
    expect(allocateCash([kit, fee], 23500)).toEqual([
      { chargeId: 'fee', amount: 15000 },
      { chargeId: 'kit', amount: 8500 },
    ])
  })

  it('pays the oldest first and leaves the newer one untouched or partial', () => {
    expect(allocateCash([kit, fee], 10000)).toEqual([{ chargeId: 'fee', amount: 10000 }])
    expect(allocateCash([kit, fee], 20000)).toEqual([
      { chargeId: 'fee', amount: 15000 },
      { chargeId: 'kit', amount: 5000 },
    ])
  })

  it('skips charges with nothing left', () => {
    expect(allocateCash([charge('zero', '2026-09-01', 0), fee], 100)).toEqual([{ chargeId: 'fee', amount: 100 }])
  })
})

describe('selectedTotal', () => {
  it('sums what remains', () => {
    expect(selectedTotal([{ remaining: 15000 }, { remaining: 8500 }])).toBe(23500)
    expect(selectedTotal([])).toBe(0)
  })
})

describe('cashRefusal', () => {
  const base = { amount: 1000, paidOn: '2026-11-07', today: '2026-11-07' }
  const open = { status: 'open' as const, remaining: 1000 }

  it('accepts cash up to what remains, today or earlier', () => {
    expect(cashRefusal({ ...base, charges: [open] })).toBeNull()
    expect(
      cashRefusal({ ...base, paidOn: '2026-11-01', charges: [{ status: 'partially_paid', remaining: 500 }, open] }),
    ).toBeNull()
  })

  it('refuses a cancelled or forfeited charge', () => {
    expect(cashRefusal({ ...base, charges: [open, { status: 'cancelled', remaining: 0 }] })).toBe('charge_not_payable')
    expect(cashRefusal({ ...base, charges: [{ status: 'forfeited', remaining: 1000 }] })).toBe('charge_not_payable')
  })

  it('refuses a charge with nothing left to pay', () => {
    expect(cashRefusal({ ...base, charges: [{ status: 'paid', remaining: 0 }] })).toBe('charge_already_paid')
    expect(cashRefusal({ ...base, charges: [{ status: 'open', remaining: 0 }] })).toBe('charge_already_paid')
  })

  it('refuses more than the selected charges', () => {
    expect(cashRefusal({ ...base, amount: 1001, charges: [open] })).toBe('cash_exceeds_selected')
  })

  it('refuses a future date', () => {
    expect(cashRefusal({ ...base, paidOn: '2026-11-08', charges: [open] })).toBe('payment_date_in_future')
  })
})

describe('receipt numbers', () => {
  it('numbers within the month of receipt', () => {
    expect(receiptPrefix('2026-11-07')).toBe('KP/2026/11/')
    expect(nextReceiptNumber('2026-11-07', 0)).toBe('KP/2026/11/001')
    expect(nextReceiptNumber('2026-01-31', 41)).toBe('KP/2026/01/042')
    expect(nextReceiptNumber('2026-12-01', 999)).toBe('KP/2026/12/1000')
  })

  it('reads the sequence back', () => {
    expect(receiptSequence('KP/2026/11/007')).toBe(7)
    expect(receiptSequence('KP/2026/11/1000')).toBe(1000)
    expect(receiptSequence('RG/2026/11/007')).toBeNull()
    expect(receiptSequence('KP 1')).toBeNull()
  })

  it('caps one acceptance', () => {
    expect(MAX_CASH_CHARGES).toBe(50)
  })
})

describe('payerSummaries', () => {
  it('groups charges still to pay by payer with their wards and total', () => {
    expect(
      payerSummaries([
        { payerPersonId: 'anna', personId: 'ola', remaining: 15000 },
        { payerPersonId: 'anna', personId: 'kuba', remaining: 8500 },
        { payerPersonId: 'anna', personId: 'ola', remaining: 5000 },
        { payerPersonId: 'anna', personId: 'anna', remaining: 1000 },
        { payerPersonId: 'anna', personId: null, remaining: 500 },
        { payerPersonId: 'jan', personId: 'jan', remaining: 2000 },
        { payerPersonId: 'ewa', personId: 'iga', remaining: 0 },
      ]),
    ).toEqual([
      { payerPersonId: 'anna', wardIds: ['ola', 'kuba'], totalDue: 30000, chargeCount: 5 },
      { payerPersonId: 'jan', wardIds: [], totalDue: 2000, chargeCount: 1 },
    ])
  })
})

describe('receiptSummaries', () => {
  const at = '2026-11-07T08:00:00.000Z'
  it('groups by receipt and leaves reversed payments out of the total', () => {
    const payments = [
      { id: 'p1', receiptNumber: 'KP/2026/11/001', chargeId: 'c1', amount: 15000, createdAt: at },
      { id: 'p2', receiptNumber: 'KP/2026/11/001', chargeId: 'c2', amount: 8500, createdAt: at },
      { id: 'p3', receiptNumber: 'KP/2026/11/002', chargeId: 'c3', amount: 4000, createdAt: at },
      { id: 'p4', receiptNumber: 'KP/2026/11/003', chargeId: 'c4', amount: 1000, createdAt: at },
    ]
    const payers = new Map<string, string | null>([
      ['c1', 'anna'],
      ['c2', 'anna'],
      ['c3', null],
    ])
    expect(receiptSummaries(payments, new Set(['p2', 'p3']), payers)).toEqual({
      items: [
        {
          receiptNumber: 'KP/2026/11/001',
          payerPersonId: 'anna',
          amount: 15000,
          chargeCount: 2,
          reversed: false,
          createdAt: at,
        },
        {
          receiptNumber: 'KP/2026/11/002',
          payerPersonId: null,
          amount: 0,
          chargeCount: 1,
          reversed: true,
          createdAt: at,
        },
        {
          receiptNumber: 'KP/2026/11/003',
          payerPersonId: null,
          amount: 1000,
          chargeCount: 1,
          reversed: false,
          createdAt: at,
        },
      ],
      total: 16000,
    })
    expect(receiptSummaries([], new Set(), new Map())).toEqual({ items: [], total: 0 })
  })
})
