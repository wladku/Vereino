import { describe, expect, it } from '@jest/globals'
import {
  CHARGE_PERSPECTIVES,
  DEFAULT_CHARGE_PERSPECTIVE,
  MANUAL_PAYMENT_METHODS,
  OPEN_CHARGE_STATUSES,
  PAYEES,
  PAYMENT_METHODS,
  amountDueOf,
  cancelRefusal,
  csvCell,
  formatZloty,
  isOverdue,
  paidTotal,
  paymentRefusal,
  perspectiveQuery,
  remainingOf,
  reverseRefusal,
  settledStatus,
  toCsv,
  visiblePerspectives,
  chargePerspectiveOf,
  chargesPerspectiveHref,
  MAX_PAYER_LABEL_LENGTH,
  MAX_SOURCE_CHARGE_AMOUNT,
  payerDisplayName,
  rentalsPerspectiveShown,
  sourceAmountValid,
  sourceCancelDecision,
  sourceChargeStatus,
  sourcePayerOf,
} from '../charge-ledger'

describe('charge ledger vocabularies', () => {
  it('declares the payment methods, payees, open statuses and perspectives', () => {
    expect(PAYMENT_METHODS).toEqual(['cash', 'transfer', 'online'])
    expect(MANUAL_PAYMENT_METHODS).toEqual(['cash', 'transfer'])
    expect(PAYEES).toEqual(['club', 'owner_institution'])
    expect(OPEN_CHARGE_STATUSES).toEqual(['open', 'partially_paid'])
    expect(CHARGE_PERSPECTIVES).toContain(DEFAULT_CHARGE_PERSPECTIVE)
    expect(DEFAULT_CHARGE_PERSPECTIVE).toBe('fees')
  })
})

describe('balances', () => {
  it('computes the amount due, the paid total with reversing entries and what remains', () => {
    expect(amountDueOf({ amount: 15000, discountAmount: 4500 })).toBe(10500)
    expect(paidTotal([])).toBe(0)
    expect(paidTotal([{ amount: 10000 }, { amount: 5000 }, { amount: -5000 }])).toBe(10000)
    expect(remainingOf(15000, 10000)).toBe(5000)
    expect(remainingOf(15000, 20000)).toBe(0)
  })

  it('derives the status from what was paid and keeps a cancelled or forfeited charge', () => {
    expect(settledStatus('open', 15000, 0)).toBe('open')
    expect(settledStatus('open', 15000, 10000)).toBe('partially_paid')
    expect(settledStatus('partially_paid', 15000, 15000)).toBe('paid')
    expect(settledStatus('paid', 15000, 10000)).toBe('partially_paid')
    expect(settledStatus('partially_paid', 15000, 0)).toBe('open')
    expect(settledStatus('open', 0, 0)).toBe('open')
    expect(settledStatus('cancelled', 15000, 15000)).toBe('cancelled')
    expect(settledStatus('forfeited', 15000, 0)).toBe('forfeited')
  })

  it('marks a charge overdue only when it is still to pay and its due date has passed', () => {
    const today = '2026-11-06'
    expect(isOverdue({ status: 'open', dueDate: '2026-11-05' }, today)).toBe(true)
    expect(isOverdue({ status: 'partially_paid', dueDate: '2026-10-01' }, today)).toBe(true)
    expect(isOverdue({ status: 'open', dueDate: '2026-11-06' }, today)).toBe(false)
    expect(isOverdue({ status: 'paid', dueDate: '2026-10-01' }, today)).toBe(false)
    expect(isOverdue({ status: 'cancelled', dueDate: '2026-10-01' }, today)).toBe(false)
    expect(isOverdue({ status: null, dueDate: '2026-10-01' }, today)).toBe(false)
    expect(isOverdue({ status: 'open', dueDate: null }, today)).toBe(false)
  })
})

describe('refusals', () => {
  const base = { status: 'open' as const, remaining: 5000, amount: 5000, paidOn: '2026-11-06', today: '2026-11-06' }

  it('refuses a payment on a closed charge, above the remainder or in the future', () => {
    expect(paymentRefusal(base)).toBeNull()
    expect(paymentRefusal({ ...base, status: 'partially_paid', paidOn: '2026-11-01' })).toBeNull()
    expect(paymentRefusal({ ...base, status: 'cancelled' })).toBe('charge_not_payable')
    expect(paymentRefusal({ ...base, status: 'forfeited' })).toBe('charge_not_payable')
    expect(paymentRefusal({ ...base, amount: 6000 })).toBe('payment_exceeds_remaining')
    expect(paymentRefusal({ ...base, status: 'paid', remaining: 0 })).toBe('payment_exceeds_remaining')
    expect(paymentRefusal({ ...base, paidOn: '2026-11-07' })).toBe('payment_date_in_future')
  })

  it('cancels only an open charge with nothing paid', () => {
    expect(cancelRefusal({ status: 'open', paid: 0 })).toBeNull()
    expect(cancelRefusal({ status: 'partially_paid', paid: 100 })).toBe('charge_has_payments')
    expect(cancelRefusal({ status: 'paid', paid: 100 })).toBe('charge_has_payments')
    expect(cancelRefusal({ status: 'open', paid: 100 })).toBe('charge_has_payments')
    expect(cancelRefusal({ status: 'cancelled', paid: 0 })).toBe('charge_not_cancellable')
    expect(cancelRefusal({ status: 'forfeited', paid: 0 })).toBe('charge_not_cancellable')
  })

  it('reverses a manual payment once, never a reversing entry or an online payment', () => {
    const cash = { method: 'cash', reversesPaymentId: null, reversed: false }
    expect(reverseRefusal(cash)).toBeNull()
    expect(reverseRefusal({ ...cash, method: 'transfer' })).toBeNull()
    expect(reverseRefusal({ ...cash, reversed: true })).toBe('payment_already_reversed')
    expect(reverseRefusal({ ...cash, method: 'online' })).toBe('payment_not_reversible')
    expect(reverseRefusal({ ...cash, reversesPaymentId: 'p-1' })).toBe('payment_not_reversible')
  })
})

describe('formatZloty', () => {
  it('writes whole złoty without decimals, grosz with a comma and thousands with a space', () => {
    expect(formatZloty(5000)).toBe('50 zł')
    expect(formatZloty(5050)).toBe('50,50 zł')
    expect(formatZloty(5)).toBe('0,05 zł')
    expect(formatZloty(123456)).toBe('1 234,56 zł')
    expect(formatZloty(100000000)).toBe('1 000 000 zł')
    expect(formatZloty(-5000)).toBe('-50 zł')
  })
})

describe('perspectives', () => {
  it('maps every perspective to its list filters', () => {
    expect(perspectiveQuery('fees')).toEqual({ sourceType: 'fee' })
    expect(perspectiveQuery('all')).toEqual({})
    expect(perspectiveQuery('overdue')).toEqual({ overdue: '1' })
    expect(perspectiveQuery('payer_missing')).toEqual({ payerMissing: '1' })
    expect(perspectiveQuery('cash')).toEqual({ paymentMethod: 'cash' })
    expect(perspectiveQuery('orders')).toEqual({ sourceType: 'order' })
    expect(perspectiveQuery('rentals')).toEqual({ sourceType: 'rental' })
  })

  it('shows rentals only when DD-C02 allows', () => {
    expect(visiblePerspectives(false)).not.toContain('rentals')
    expect(visiblePerspectives(true)).toEqual([...CHARGE_PERSPECTIVES])
  })

  it('allows rentals with facilities registered or with a live rental charge (DD-C02)', () => {
    expect(rentalsPerspectiveShown({ facilitiesRegistered: true, liveRentalCharges: 0 })).toBe(true)
    expect(rentalsPerspectiveShown({ facilitiesRegistered: false, liveRentalCharges: 2 })).toBe(true)
    expect(rentalsPerspectiveShown({ facilitiesRegistered: false, liveRentalCharges: 0 })).toBe(false)
  })
})

describe('rental charges (DD-19, DD-C01)', () => {
  const institution = '11111111-1111-4111-8111-111111111111'
  const person = '22222222-2222-4222-8222-222222222222'

  it('takes the payer in the order institution, person, typed-in name', () => {
    expect(sourcePayerOf({ payerInstitutionId: institution, payerPersonId: person, payerDisplayName: 'X' })).toEqual({
      payerInstitutionId: institution,
      payerPersonId: null,
      payerLabel: null,
    })
    expect(sourcePayerOf({ payerInstitutionId: null, payerPersonId: person, payerDisplayName: 'X' })).toEqual({
      payerInstitutionId: null,
      payerPersonId: person,
      payerLabel: null,
    })
    expect(sourcePayerOf({ payerDisplayName: '  Jan Wynajmujący  ' })).toEqual({
      payerInstitutionId: null,
      payerPersonId: null,
      payerLabel: 'Jan Wynajmujący',
    })
    expect(sourcePayerOf({ payerDisplayName: 'a'.repeat(250) })?.payerLabel).toHaveLength(MAX_PAYER_LABEL_LENGTH)
  })

  it('has no payer without an id or a name', () => {
    expect(sourcePayerOf({})).toBeNull()
    expect(sourcePayerOf({ payerInstitutionId: null, payerPersonId: null, payerDisplayName: '   ' })).toBeNull()
    expect(sourcePayerOf({ payerDisplayName: null })).toBeNull()
  })

  it('accepts whole grosz from a free rental up to the facilities maximum', () => {
    expect(sourceAmountValid(0)).toBe(true)
    expect(sourceAmountValid(50_000)).toBe(true)
    expect(sourceAmountValid(MAX_SOURCE_CHARGE_AMOUNT)).toBe(true)
    expect(sourceAmountValid(MAX_SOURCE_CHARGE_AMOUNT + 1)).toBe(false)
    expect(sourceAmountValid(-1)).toBe(false)
    expect(sourceAmountValid(1.5)).toBe(false)
    expect(sourceAmountValid(Number.NaN)).toBe(false)
  })

  it('creates a free rental charge paid and every other one open', () => {
    expect(sourceChargeStatus(0)).toBe('paid')
    expect(sourceChargeStatus(1)).toBe('open')
  })

  it('cancels a charge without payments, keeps a paid one and skips a closed one', () => {
    expect(sourceCancelDecision({ status: 'open', hasPayments: false })).toBe('cancel')
    expect(sourceCancelDecision({ status: 'paid', hasPayments: false })).toBe('cancel')
    expect(sourceCancelDecision({ status: 'open', hasPayments: true })).toBe('charge_paid')
    expect(sourceCancelDecision({ status: 'partially_paid', hasPayments: false })).toBe('charge_paid')
    expect(sourceCancelDecision({ status: 'paid', hasPayments: true })).toBe('charge_paid')
    expect(sourceCancelDecision({ status: 'cancelled', hasPayments: false })).toBe('none')
    expect(sourceCancelDecision({ status: 'forfeited', hasPayments: true })).toBe('none')
  })

  it('shows the payer institution, then the person, then the typed-in name', () => {
    const payer = { firstName: 'Anna', lastName: 'Nowak' }
    expect(payerDisplayName({ payerInstitution: { name: 'KS Sąsiedzi' }, payer, payerLabel: 'X' })).toBe('KS Sąsiedzi')
    expect(payerDisplayName({ payerInstitution: null, payer, payerLabel: 'X' })).toBe('Anna Nowak')
    expect(payerDisplayName({ payer: { firstName: '', lastName: '' }, payerLabel: 'Jan' })).toBe('Jan')
    expect(payerDisplayName({ payerInstitution: { name: '' }, payerLabel: '' })).toBeNull()
    expect(payerDisplayName({})).toBeNull()
  })
})

describe('perspective links', () => {
  it('opens B-21 in a perspective and reads it back', () => {
    expect(chargesPerspectiveHref('/backend/payments/charges', 'overdue')).toBe(
      '/backend/payments/charges?perspective=overdue',
    )
    expect(chargesPerspectiveHref('/backend/payments/charges', 'fees')).toBe('/backend/payments/charges')
    const shown = visiblePerspectives(false)
    expect(chargePerspectiveOf('payer_missing', shown)).toBe('payer_missing')
    expect(chargePerspectiveOf('rentals', shown)).toBe('fees')
    expect(chargePerspectiveOf(null, shown)).toBe('fees')
  })
})

describe('CSV', () => {
  it('escapes separators, quotes, line breaks and formulas', () => {
    expect(csvCell(null)).toBe('')
    expect(csvCell(undefined)).toBe('')
    expect(csvCell(-150)).toBe('-150')
    expect(csvCell('Nowak')).toBe('Nowak')
    expect(csvCell('a;b')).toBe('"a;b"')
    expect(csvCell('a,b', ',')).toBe('"a,b"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('two\nlines')).toBe('"two\nlines"')
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)")
    expect(csvCell('+48')).toBe("'+48")
    expect(csvCell('-1')).toBe("'-1")
    expect(csvCell('@x')).toBe("'@x")
  })

  it('joins rows with the separator and CRLF', () => {
    expect(
      toCsv([
        ['Name', 'Amount'],
        ['Nowak; Anna', 150],
      ]),
    ).toBe('Name;Amount\r\n"Nowak; Anna";150')
    expect(toCsv([['a', 'b']], ',')).toBe('a,b')
  })
})
