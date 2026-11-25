import { describe, expect, it } from '@jest/globals'
import {
  MAX_HANDOVER_PAYMENTS,
  custodyByCollector,
  handoverPrefix,
  handoverRefusal,
  handoverSequence,
  nextHandoverNumber,
  type HandoverCandidate,
  type HeldPayment,
} from '../cash-handovers'

describe('handover numbers', () => {
  it('prefixes the month a handover was accepted in', () => {
    expect(handoverPrefix('2026-11-19')).toBe('RG/2026/11/')
  })

  it('reads the sequence of a handover number, null for anything else', () => {
    expect(handoverSequence('RG/2026/11/007')).toBe(7)
    expect(handoverSequence('RG/2026/11/1000')).toBe(1000)
    expect(handoverSequence('KP/2026/11/007')).toBeNull()
  })

  it('issues the next number of the month, three digits at least', () => {
    expect(nextHandoverNumber('2026-11-19', 0)).toBe('RG/2026/11/001')
    expect(nextHandoverNumber('2026-12-01', 41)).toBe('RG/2026/12/042')
    expect(nextHandoverNumber('2026-12-01', 999)).toBe('RG/2026/12/1000')
  })

  it('caps one handover', () => {
    expect(MAX_HANDOVER_PAYMENTS).toBe(200)
  })
})

const candidate = (id: string, extra: Partial<HandoverCandidate> = {}): HandoverCandidate => ({
  id,
  method: 'cash',
  receiptNumber: 'KP/2026/11/001',
  collectedByPersonId: 'rafal',
  reversesPaymentId: null,
  cashHandoverId: null,
  reversed: false,
  ...extra,
})

describe('handoverRefusal', () => {
  const refuse = (payments: HandoverCandidate[], paymentIds = payments.map((row) => row.id)) =>
    handoverRefusal({ collectorPersonId: 'rafal', paymentIds, payments })

  it('accepts the cash payments the collector holds', () => {
    expect(refuse([candidate('a'), candidate('b')])).toBeNull()
  })

  it('refuses an unknown payment', () => {
    expect(refuse([candidate('a')], ['a', 'missing'])).toBe('cash_handover_payments_invalid')
  })

  it('refuses a payment that is not collected cash of that person', () => {
    expect(refuse([candidate('a', { method: 'transfer' })])).toBe('cash_handover_payments_invalid')
    expect(refuse([candidate('a', { receiptNumber: null })])).toBe('cash_handover_payments_invalid')
    expect(refuse([candidate('a', { reversesPaymentId: 'x' })])).toBe('cash_handover_payments_invalid')
    expect(refuse([candidate('a', { collectedByPersonId: 'marek' })])).toBe('cash_handover_payments_invalid')
    expect(refuse([candidate('a', { collectedByPersonId: null })])).toBe('cash_handover_payments_invalid')
  })

  it('refuses a payment already settled before a reversed one', () => {
    expect(refuse([candidate('a', { cashHandoverId: 'h1', reversed: true })])).toBe('cash_already_settled')
  })

  it('refuses a reversed payment', () => {
    expect(refuse([candidate('a'), candidate('b', { reversed: true })])).toBe('cash_payment_reversed')
  })
})

const held = (
  id: string,
  collectorPersonId: string,
  paidOn: string,
  amount: number,
  createdAt = 'T1',
): HeldPayment => ({
  id,
  collectorPersonId,
  receiptNumber: `KP/${id}`,
  chargeId: `charge-${id}`,
  paidOn,
  amount,
  createdAt,
})

describe('custodyByCollector', () => {
  it('is empty without held cash', () => {
    expect(custodyByCollector([], new Set())).toEqual({ items: [], total: 0 })
  })

  it('groups by collector, oldest payment first, and leaves reversed payments out', () => {
    const result = custodyByCollector(
      [
        held('w3', 'rafal', '2026-11-10', 13500, 'T2'),
        held('w2', 'rafal', '2026-11-10', 20000, 'T1'),
        held('w4', 'rafal', '2026-11-10', 1000, 'T1'),
        held('w1', 'rafal', '2026-11-03', 20000),
        held('m1', 'marek', '2026-11-12', 5000),
        held('m2', 'marek', '2026-11-01', 7000),
        held('x1', 'zofia', '2026-11-05', 9999),
      ],
      new Set(['x1', 'w4']),
    )
    expect(result.total).toBe(65500)
    expect(result.items.map((item) => item.collectorPersonId)).toEqual(['marek', 'rafal'])
    expect(result.items[1]).toEqual(expect.objectContaining({ oldestPaidOn: '2026-11-03', total: 53500 }))
    expect(result.items[1].payments.map((row) => row.id)).toEqual(['w1', 'w2', 'w3'])
    expect(result.items[0].payments.map((row) => row.id)).toEqual(['m2', 'm1'])
  })

  it('breaks a tie of the oldest day by the larger total, then by the collector', () => {
    const result = custodyByCollector(
      [
        held('a', 'anna', '2026-11-01', 100),
        held('b', 'bartek', '2026-11-01', 500),
        held('c', 'celina', '2026-11-01', 100),
        held('a2', 'anna', '2026-11-01', 0, 'T1'),
      ],
      new Set(),
    )
    expect(result.items.map((item) => item.collectorPersonId)).toEqual(['bartek', 'anna', 'celina'])
    expect(result.items[1].payments.map((row) => row.id)).toEqual(['a', 'a2'])
  })
})
