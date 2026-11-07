import { describe, expect, it } from '@jest/globals'
import {
  CHECKOUT_EXPIRY_MS,
  CHECKOUT_STATUSES,
  RECONCILE_WINDOW_MS,
  RETURN_POLL_INTERVAL_MS,
  RETURN_POLL_WINDOW_MS,
  checkoutRefusal,
  checkoutTotals,
  fromGatewayAmount,
  fulfilmentPlan,
  isExpirable,
  onlineFeeOf,
  providerOutcome,
  refundRefusal,
  returnState,
  shouldAutoRefresh,
  toGatewayAmount,
  type FulfilmentCharge,
  type OnlineFeeSettings,
} from '../checkout-rules'

const clubPays: OnlineFeeSettings = { onlineFeeMode: 'club_pays', onlineFeePercent: 1.5, onlineFeeFixed: 100 }
const payerPays: OnlineFeeSettings = { onlineFeeMode: 'payer_pays', onlineFeePercent: 1.5, onlineFeeFixed: 100 }

describe('online fee (R13)', () => {
  it('is nothing when the club pays', () => {
    expect(onlineFeeOf(10_000, clubPays)).toBe(0)
  })

  it('is percent plus fixed when the payer pays (TEST-055: 1.5 % + 1 zł of 100 zł)', () => {
    expect(onlineFeeOf(10_000, payerPays)).toBe(250)
  })

  it('rounds the percent part to the grosz and keeps two-decimal percents exact', () => {
    expect(onlineFeeOf(333, { ...payerPays, onlineFeePercent: 1.49, onlineFeeFixed: 0 })).toBe(5)
    expect(onlineFeeOf(10_000, { ...payerPays, onlineFeePercent: 0.29, onlineFeeFixed: 0 })).toBe(29)
  })

  it('is nothing for an empty amount', () => {
    expect(onlineFeeOf(0, payerPays)).toBe(0)
  })

  it('sums the totals with the surcharge line', () => {
    expect(checkoutTotals([15_000, 10_500], payerPays)).toEqual({ amount: 25_500, feeAmount: 483, total: 25_983 })
    expect(checkoutTotals([15_000], clubPays)).toEqual({ amount: 15_000, feeAmount: 0, total: 15_000 })
  })
})

describe('checkout refusal', () => {
  const ok = { status: 'open' as const, payerMissing: false, visible: true }

  it('accepts open charges of the caller', () => {
    expect(checkoutRefusal([ok, ok])).toBeNull()
  })

  it('refuses someone else’s charge first', () => {
    expect(
      checkoutRefusal([
        { ...ok, payerMissing: true },
        { ...ok, visible: false },
      ]),
    ).toBe('checkout_charge_forbidden')
  })

  it('refuses a charge without a payer', () => {
    expect(checkoutRefusal([ok, { ...ok, payerMissing: true, status: 'paid' }])).toBe('payer_missing')
  })

  it('refuses a charge that is not open', () => {
    expect(checkoutRefusal([ok, { ...ok, status: 'partially_paid' }])).toBe('charge_not_open')
  })
})

describe('gateway amounts', () => {
  it('converts grosz to złoty and back', () => {
    expect(toGatewayAmount(25_983)).toBe(259.83)
    expect(fromGatewayAmount(259.83)).toBe(25_983)
    expect(fromGatewayAmount(0.29)).toBe(29)
  })
})

describe('provider outcome', () => {
  it('maps captured, refunded and partially refunded to captured', () => {
    expect(providerOutcome('captured')).toBe('captured')
    expect(providerOutcome('refunded')).toBe('captured')
    expect(providerOutcome('partially_refunded')).toBe('captured')
  })

  it('maps terminal statuses without money to failed', () => {
    expect(providerOutcome('failed')).toBe('failed')
    expect(providerOutcome('cancelled')).toBe('failed')
    expect(providerOutcome('expired')).toBe('failed')
  })

  it('keeps anything else pending', () => {
    expect(providerOutcome('pending')).toBe('pending')
    expect(providerOutcome('authorized')).toBe('pending')
    expect(providerOutcome('unknown')).toBe('pending')
  })
})

describe('fulfilment plan', () => {
  const charge = (id: string, dueDate: string, extra: Partial<FulfilmentCharge> = {}): FulfilmentCharge => ({
    id,
    dueDate,
    status: 'open',
    amountDue: 10_000,
    remaining: 10_000,
    ...extra,
  })

  it('books one payment per open charge, oldest first', () => {
    const plan = fulfilmentPlan({
      amount: 20_000,
      feeAmount: 250,
      received: 20_250,
      charges: [charge('b', '2026-11-10'), charge('a', '2026-10-10')],
    })
    expect(plan).toEqual({
      kind: 'book',
      lines: [
        { chargeId: 'a', amount: 10_000, overpayment: false },
        { chargeId: 'b', amount: 10_000, overpayment: false },
      ],
    })
  })

  it('orders charges due the same day by id', () => {
    const plan = fulfilmentPlan({
      amount: 20_000,
      feeAmount: 0,
      received: 20_000,
      charges: [charge('z', '2026-10-10'), charge('m', '2026-10-10')],
    })
    expect(plan.kind === 'book' && plan.lines.map((line) => line.chargeId)).toEqual(['m', 'z'])
  })

  it('turns the share of a charge paid meanwhile into an overpayment to refund (Q-049)', () => {
    const plan = fulfilmentPlan({
      amount: 20_000,
      feeAmount: 0,
      received: 20_000,
      charges: [charge('a', '2026-10-10', { status: 'paid', remaining: 0 }), charge('b', '2026-11-10')],
    })
    expect(plan).toEqual({
      kind: 'book',
      lines: [
        { chargeId: 'a', amount: 10_000, overpayment: true },
        { chargeId: 'b', amount: 10_000, overpayment: false },
      ],
    })
  })

  it('pays what remains of a partly paid charge and flags the rest', () => {
    const plan = fulfilmentPlan({
      amount: 10_000,
      feeAmount: 0,
      received: 10_000,
      charges: [charge('a', '2026-10-10', { status: 'partially_paid', remaining: 4_000 })],
    })
    expect(plan).toEqual({
      kind: 'book',
      lines: [
        { chargeId: 'a', amount: 4_000, overpayment: false },
        { chargeId: 'a', amount: 6_000, overpayment: true },
      ],
    })
  })

  it('caps an earlier share at its amount due and never below zero', () => {
    const plan = fulfilmentPlan({
      amount: 5_000,
      feeAmount: 0,
      received: 5_000,
      charges: [charge('a', '2026-10-10', { amountDue: -1, remaining: 0 }), charge('b', '2026-11-10')],
    })
    expect(plan).toEqual({ kind: 'book', lines: [{ chargeId: 'b', amount: 5_000, overpayment: false }] })
  })

  it('books nothing when the amount received differs from the total', () => {
    expect(
      fulfilmentPlan({ amount: 10_000, feeAmount: 250, received: 10_000, charges: [charge('a', '2026-10-10')] }),
    ).toEqual({ kind: 'amount_mismatch' })
  })

  it('books nothing without charges', () => {
    expect(fulfilmentPlan({ amount: 0, feeAmount: 0, received: 0, charges: [] })).toEqual({ kind: 'amount_mismatch' })
  })
})

describe('M-09 return state', () => {
  it('declares the checkout statuses and the polling constants', () => {
    expect(CHECKOUT_STATUSES).toEqual(['created', 'completed', 'failed', 'expired'])
    expect(RETURN_POLL_INTERVAL_MS).toBe(3_000)
    expect(RETURN_POLL_WINDOW_MS).toBe(30_000)
  })

  it('maps each checkout status', () => {
    expect(returnState('completed')).toBe('received')
    expect(returnState('created')).toBe('in_progress')
    expect(returnState('failed')).toBe('interrupted')
    expect(returnState('expired')).toBe('interrupted')
  })

  it('refreshes by itself only while in progress and inside the window', () => {
    expect(shouldAutoRefresh('in_progress', 29_999)).toBe(true)
    expect(shouldAutoRefresh('in_progress', 30_000)).toBe(false)
    expect(shouldAutoRefresh('received', 0)).toBe(false)
  })
})

describe('refund refusal', () => {
  it('refunds an online payment up to its unrefunded part', () => {
    expect(refundRefusal({ method: 'online', reversesPaymentId: null, amount: 5_000, refundable: 5_000 })).toBeNull()
  })

  it('refuses a manual payment or a reversing entry', () => {
    expect(refundRefusal({ method: 'cash', reversesPaymentId: null, amount: 1, refundable: 10 })).toBe(
      'payment_not_refundable',
    )
    expect(refundRefusal({ method: 'online', reversesPaymentId: 'x', amount: 1, refundable: 10 })).toBe(
      'payment_not_refundable',
    )
  })

  it('refuses more than the unrefunded part', () => {
    expect(refundRefusal({ method: 'online', reversesPaymentId: null, amount: 11, refundable: 10 })).toBe(
      'refund_exceeds_remaining',
    )
  })
})

describe('sweep', () => {
  const now = new Date('2026-11-06T12:00:00Z')

  it('declares its windows', () => {
    expect(RECONCILE_WINDOW_MS).toBe(604_800_000)
    expect(CHECKOUT_EXPIRY_MS).toBe(86_400_000)
  })

  it('expires a created checkout after 24 hours', () => {
    expect(isExpirable({ status: 'created', createdAt: new Date(now.getTime() - CHECKOUT_EXPIRY_MS) }, now)).toBe(true)
    expect(isExpirable({ status: 'created', createdAt: new Date(now.getTime() - 1_000) }, now)).toBe(false)
    expect(isExpirable({ status: 'failed', createdAt: new Date(0) }, now)).toBe(false)
  })
})
