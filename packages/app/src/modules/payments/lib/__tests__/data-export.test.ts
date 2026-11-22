import { describe, expect, it } from '@jest/globals'
import {
  bankTransactionRow,
  chargeRow,
  chargesPaidBy,
  checkoutRow,
  orderLineRow,
  orderLinkRow,
  orderRow,
  otherPersonIds,
  paymentRow,
  paymentStatus,
  paymentsActorCounts,
  paymentsExportPart,
  payerRefRow,
  redactPerson,
  type ExportBankTransaction,
  type ExportCharge,
  type ExportOrder,
  type ExportPayment,
  type PaymentsExportInput,
} from '../data-export'

const SUBJECT = 'subj-0000'
const GUARDIAN = 'guard-0000'
const WARD = 'ward-0000'
const STAFF_PERSON = 'staff-0000'
const STAFF_USER = 'user-staff'
const at = new Date('2026-03-01T10:00:00.000Z')
const names = new Map([
  [GUARDIAN, 'Anna Nowak'],
  [WARD, 'Jan Nowak'],
])

function charge(over: Partial<ExportCharge> = {}): ExportCharge {
  return {
    id: 'charge-1',
    sourceType: 'fee',
    sourceId: 'fee-1',
    personId: SUBJECT,
    payerPersonId: GUARDIAN,
    payerMissing: false,
    payerLabel: 'Typed Name',
    description: 'Fee March',
    amount: 10000,
    discountAmount: 0,
    dueDate: '2026-03-10',
    payee: 'club',
    status: 'open',
    reminderCount: 0,
    createdAt: at,
    ...over,
  }
}

function payment(over: Partial<ExportPayment> = {}): ExportPayment {
  return {
    id: 'pay-1',
    chargeId: 'charge-1',
    amount: 10000,
    method: 'cash',
    paidOn: '2026-03-05',
    reference: 'Title naming someone',
    recordedByPersonId: STAFF_PERSON,
    recordedByUserId: STAFF_USER,
    isOverpayment: false,
    collectedByPersonId: STAFF_PERSON,
    receiptNumber: 'KP/2026/03/001',
    bankTransactionId: 'bt-1',
    cashHandoverId: 'ho-1',
    createdAt: at,
    ...over,
  }
}

function order(over: Partial<ExportOrder> = {}): ExportOrder {
  return {
    id: 'order-1',
    campaignId: 'camp-1',
    participantPersonId: WARD,
    orderedByPersonId: SUBJECT,
    contactEmail: 'me@example.test',
    contactPhone: '+48 600 000 000',
    printName: 'JAN',
    printNumber: 7,
    notes: 'Also for his brother',
    status: 'submitted',
    chargeId: 'charge-o',
    submittedVia: 'app',
    handedOverAt: at,
    handedOverByPersonId: STAFF_PERSON,
    createdAt: at,
    updatedAt: at,
    ...over,
  }
}

function transfer(over: Partial<ExportBankTransaction> = {}): ExportBankTransaction {
  return {
    id: 'bt-1',
    importId: 'imp-1',
    line: 3,
    bookedOn: '2026-03-04',
    amount: 10000,
    counterpartyName: 'ANNA NOWAK',
    counterpartyAccount: 'PL00 1111',
    title: 'GW-ABCD fee',
    status: 'booked',
    allocation: [{ chargeId: 'charge-1', amount: 10000 }],
    matchReason: 'payer_code',
    autoBooked: true,
    decidedByPersonId: STAFF_PERSON,
    decidedAt: at,
    createdAt: at,
    ...over,
  }
}

/** Every string anywhere in a value (keys excluded). */
function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(strings)
  if (value && typeof value === 'object') return Object.values(value).flatMap(strings)
  return []
}

/** Every key anywhere in a value. */
function keys(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(keys)
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) => [key, ...keys(item)])
  }
  return []
}

describe('redactPerson', () => {
  it('keeps the name only for a named relation', () => {
    expect(redactPerson('payer', ' Anna ')).toEqual({ relation: 'payer', name: 'Anna' })
    expect(redactPerson('staff', 'Anna')).toEqual({ relation: 'staff' })
    expect(redactPerson('payer', '  ')).toEqual({ relation: 'payer' })
    expect(redactPerson('payer')).toEqual({ relation: 'payer' })
  })
})

describe('otherPersonIds', () => {
  it('lists the other parties of charges and orders once, never the subject or a missing one', () => {
    expect(
      otherPersonIds(
        SUBJECT,
        [charge(), charge({ personId: null, payerPersonId: SUBJECT }), charge({ personId: WARD })],
        [order(), order({ participantPersonId: SUBJECT, orderedByPersonId: GUARDIAN })],
      ),
    ).toEqual([GUARDIAN, WARD])
  })
})

describe('chargeRow', () => {
  it('shows the subject as debtor and the guardian payer by name, without the payer label', () => {
    const row = chargeRow(charge({ cancelledAt: at, lastRemindedAt: at, cancelReason: 'x' }), SUBJECT, names)
    expect(row.debtor).toBe('subject')
    expect(row.payer).toEqual({ relation: 'payer', name: 'Anna Nowak' })
    expect(row.payerLabel).toBeNull()
    expect(row.cancelledAt).toBe(at.toISOString())
    expect(row.lastRemindedAt).toBe(at.toISOString())
    expect(row.cancelReason).toBe('x')
  })

  it('shows the subject as payer with the label and the ward as debtor; an unknown name is a relation only', () => {
    const row = chargeRow(charge({ personId: WARD, payerPersonId: SUBJECT }), SUBJECT, names)
    expect(row.payer).toBe('subject')
    expect(row.debtor).toEqual({ relation: 'debtor', name: 'Jan Nowak' })
    expect(row.payerLabel).toBe('Typed Name')
    const unknown = chargeRow(charge({ personId: 'someone', payerPersonId: SUBJECT, payerLabel: null }), SUBJECT, names)
    expect(unknown.debtor).toEqual({ relation: 'debtor' })
    expect(unknown.payerLabel).toBeNull()
  })

  it('defaults the optional columns to null', () => {
    const row = chargeRow(
      charge({ sourceId: undefined, personId: undefined, payerPersonId: SUBJECT, payerLabel: undefined }),
      SUBJECT,
      names,
    )
    expect(row).toMatchObject({
      sourceId: null,
      debtor: null,
      payerInstitutionId: null,
      payeeInstitutionId: null,
      payerLabel: null,
      periodLabel: null,
      discountRuleId: null,
      cancelledAt: null,
      cancelReason: null,
      lastRemindedAt: null,
    })
  })
})

describe('paymentStatus', () => {
  it('reads refund, reversal, overpayment, reversed and booked', () => {
    const none = new Set<string>()
    expect(paymentStatus(payment({ gatewayRefundId: 're_1', reversesPaymentId: 'p0' }), none)).toBe('refund')
    expect(paymentStatus(payment({ reversesPaymentId: 'p0' }), none)).toBe('reversal')
    expect(paymentStatus(payment({ isOverpayment: true }), none)).toBe('overpayment')
    expect(paymentStatus(payment(), new Set(['pay-1']))).toBe('reversed')
    expect(paymentStatus(payment(), none)).toBe('booked')
  })
})

describe('paymentRow', () => {
  it('shows only amount, day, method and status when the subject is not the payer', () => {
    expect(paymentRow(payment(), false, new Set())).toEqual({
      id: 'pay-1',
      chargeId: 'charge-1',
      amount: 10000,
      paidOn: '2026-03-05',
      method: 'cash',
      status: 'booked',
    })
  })

  it('adds the title, receipt and records for the payer, staff as a relation only', () => {
    const row = paymentRow(payment(), true, new Set())
    expect(row).toMatchObject({
      reference: 'Title naming someone',
      receiptNumber: 'KP/2026/03/001',
      recordedBy: { relation: 'staff' },
      collectedBy: { relation: 'staff' },
      bankTransactionId: 'bt-1',
      cashHandoverId: 'ho-1',
      createdAt: at.toISOString(),
    })
    expect(strings(row)).not.toContain(STAFF_PERSON)
    expect(strings(row)).not.toContain(STAFF_USER)
  })

  it('reads a recorder known by user only, and nulls the missing records', () => {
    const row = paymentRow(
      payment({
        recordedByPersonId: null,
        collectedByPersonId: null,
        reference: null,
        receiptNumber: null,
        bankTransactionId: null,
        cashHandoverId: null,
      }),
      true,
      new Set(),
    )
    expect(row).toMatchObject({
      recordedBy: { relation: 'staff' },
      collectedBy: null,
      reference: null,
      receiptNumber: null,
      reversesPaymentId: null,
      bankTransactionId: null,
      cashHandoverId: null,
    })
    expect(paymentRow(payment({ recordedByPersonId: null, recordedByUserId: null }), true, new Set()).recordedBy).toBe(
      null,
    )
  })
})

describe('checkoutRow and payerRefRow', () => {
  it('keep the checkout reference and drop the idempotency key and the gateway transaction', () => {
    const row = checkoutRow({
      id: 'chk-1',
      chargeIds: ['charge-1'],
      amount: 10000,
      chargeAmounts: [10000],
      feeAmount: 0,
      status: 'completed',
      amountMismatch: false,
      createdAt: at,
      updatedAt: at,
      ...({ idempotencyKey: 'idem', gatewayTransactionId: 'gw' } as object),
    })
    expect(row).toEqual({
      id: 'chk-1',
      chargeIds: ['charge-1'],
      amount: 10000,
      chargeAmounts: [10000],
      feeAmount: 0,
      status: 'completed',
      amountMismatch: false,
      createdAt: at.toISOString(),
      updatedAt: at.toISOString(),
    })
    expect(
      checkoutRow({
        id: 'c',
        chargeIds: [],
        amount: 0,
        chargeAmounts: null,
        feeAmount: 0,
        status: 'created',
        amountMismatch: false,
        createdAt: at,
        updatedAt: at,
      }).chargeAmounts,
    ).toBeNull()
    expect(payerRefRow({ id: 'ref-1', code: 'GW-ABCD', createdAt: at })).toEqual({
      id: 'ref-1',
      code: 'GW-ABCD',
      createdAt: at.toISOString(),
    })
  })
})

describe('orderRow', () => {
  const campaigns = new Map([['camp-1', 'Kits 2026']])

  it('shows the orderer subject with contacts and the ward by name, staff hand-over as a relation', () => {
    const row = orderRow(order(), SUBJECT, names, campaigns)
    expect(row).toMatchObject({
      campaignName: 'Kits 2026',
      participant: { relation: 'ward', name: 'Jan Nowak' },
      orderedBy: 'subject',
      contactEmail: 'me@example.test',
      contactPhone: '+48 600 000 000',
      handedOverBy: { relation: 'staff' },
      handedOverAt: at.toISOString(),
    })
  })

  it("drops the orderer's contacts when the subject is the participant; nulls the optional columns", () => {
    const row = orderRow(
      order({
        participantPersonId: SUBJECT,
        orderedByPersonId: GUARDIAN,
        campaignId: 'camp-x',
        printName: null,
        printNumber: null,
        notes: null,
        handedOverAt: null,
        handedOverByPersonId: null,
      }),
      SUBJECT,
      names,
      campaigns,
    )
    expect(row).toMatchObject({
      campaignName: null,
      participant: 'subject',
      orderedBy: { relation: 'orderer', name: 'Anna Nowak' },
      contactEmail: null,
      contactPhone: null,
      printName: null,
      printNumber: null,
      notes: null,
      handedOverAt: null,
      handedOverBy: null,
    })
    const self = orderRow(
      order({ participantPersonId: SUBJECT, contactEmail: undefined, contactPhone: undefined }),
      SUBJECT,
      names,
      campaigns,
    )
    expect(self).toMatchObject({ participant: 'subject', orderedBy: 'subject', contactEmail: null, contactPhone: null })
  })
})

describe('orderLineRow, bankTransactionRow, orderLinkRow', () => {
  it('map an order line with its product name', () => {
    expect(
      orderLineRow(
        { id: 'l1', orderId: 'order-1', productId: 'p1', size: 'M', componentSizes: { p2: 'S' }, unitPrice: 5000 },
        new Map([['p1', 'Shirt']]),
      ),
    ).toEqual({
      id: 'l1',
      orderId: 'order-1',
      productId: 'p1',
      productName: 'Shirt',
      size: 'M',
      componentSizes: { p2: 'S' },
      unitPrice: 5000,
    })
    expect(orderLineRow({ id: 'l2', orderId: 'o', productId: 'p9', unitPrice: 1 }, new Map())).toMatchObject({
      productName: null,
      size: null,
      componentSizes: null,
    })
  })

  it('map a transfer without its fingerprint, the decider as staff', () => {
    const row = bankTransactionRow({ ...transfer(), ...({ txHash: 'secret-hash' } as object) })
    expect(row).toMatchObject({
      counterpartyName: 'ANNA NOWAK',
      counterpartyAccount: 'PL00 1111',
      title: 'GW-ABCD fee',
      decidedBy: { relation: 'staff' },
      decidedAt: at.toISOString(),
      allocation: [{ chargeId: 'charge-1', amount: 10000 }],
    })
    expect(keys(row)).not.toContain('txHash')
    expect(strings(row)).not.toContain('secret-hash')
    expect(
      bankTransactionRow(
        transfer({
          counterpartyName: null,
          counterpartyAccount: undefined,
          skipReason: 'other',
          skipNote: 'n',
          decidedByPersonId: null,
          decidedByUserId: STAFF_USER,
          decidedAt: null,
        }),
      ),
    ).toMatchObject({
      counterpartyName: null,
      counterpartyAccount: null,
      skipReason: 'other',
      skipNote: 'n',
      decidedBy: { relation: 'staff' },
      decidedAt: null,
    })
    expect(bankTransactionRow(transfer({ decidedByPersonId: null })).decidedBy).toBeNull()
  })

  it('map an order link to dates only, never the token hash', () => {
    const link = { id: 'link-1', campaignId: 'camp-1', expiresAt: at, createdAt: at }
    const row = orderLinkRow({ ...link, ...({ tokenHash: 'h' } as object) })
    expect(row).toEqual({
      id: 'link-1',
      campaignId: 'camp-1',
      createdAt: at.toISOString(),
      expiresAt: at.toISOString(),
      lastUsedAt: null,
    })
    expect(orderLinkRow({ ...link, lastUsedAt: at }).lastUsedAt).toBe(at.toISOString())
  })
})

describe('chargesPaidBy and paymentsActorCounts', () => {
  it('lists the charges the subject pays', () => {
    expect([...chargesPaidBy(SUBJECT, [charge(), charge({ id: 'c2', payerPersonId: SUBJECT })])]).toEqual(['c2'])
  })

  it('names one actor count per table', () => {
    expect(
      paymentsActorCounts({
        payments: 1,
        cashHandovers: 2,
        orderCampaigns: 3,
        bankImports: 4,
        bankTransactions: 5,
        orders: 6,
      }),
    ).toEqual([
      { module: 'payments', table: 'payments_payments', count: 1 },
      { module: 'payments', table: 'payments_cash_handovers', count: 2 },
      { module: 'payments', table: 'payments_order_campaigns', count: 3 },
      { module: 'payments', table: 'payments_bank_imports', count: 4 },
      { module: 'payments', table: 'payments_bank_transactions', count: 5 },
      { module: 'payments', table: 'payments_orders', count: 6 },
    ])
  })
})

describe('paymentsExportPart', () => {
  const empty: PaymentsExportInput = {
    subjectId: SUBJECT,
    charges: [],
    payments: [],
    checkouts: [],
    payerRefs: [],
    orders: [],
    orderLines: [],
    bankTransactions: [],
    orderLinks: [],
    names: new Map(),
    campaignNames: new Map(),
    productNames: new Map(),
    actorCounts: { payments: 0, cashHandovers: 0, orderCampaigns: 0, bankImports: 0, bankTransactions: 0, orders: 0 },
  }

  it('returns every section, empty, with its activity, portability and review fields', () => {
    const part = paymentsExportPart(empty)
    expect(
      part.sections.map(({ table, activity, portable, rows, reviewFields }) => ({
        table,
        activity,
        portable,
        rows: rows.length,
        reviewFields,
      })),
    ).toEqual([
      { table: 'payments_charges', activity: 'A5', portable: false, rows: 0, reviewFields: undefined },
      { table: 'payments_payments', activity: 'A5', portable: false, rows: 0, reviewFields: undefined },
      { table: 'payments_checkouts', activity: 'A6', portable: true, rows: 0, reviewFields: undefined },
      { table: 'payments_payer_refs', activity: 'A5', portable: false, rows: 0, reviewFields: undefined },
      { table: 'payments_orders', activity: 'A7', portable: true, rows: 0, reviewFields: ['notes'] },
      { table: 'payments_order_lines', activity: 'A7', portable: true, rows: 0, reviewFields: undefined },
      {
        table: 'payments_bank_transactions',
        activity: 'A5',
        portable: false,
        rows: 0,
        reviewFields: ['counterpartyName', 'counterpartyAccount', 'title', 'skipNote'],
      },
      { table: 'payments_order_links', activity: 'A7', portable: false, rows: 0, reviewFields: undefined },
    ])
    expect(part.sections.every((section) => section.module === 'payments')).toBe(true)
    expect(part.actorCounts).toHaveLength(6)
  })

  it('never shows another person or staff id, a hash or a gateway id', () => {
    const part = paymentsExportPart({
      ...empty,
      charges: [charge(), charge({ id: 'charge-2', personId: WARD, payerPersonId: SUBJECT })],
      payments: [
        payment(),
        payment({ id: 'pay-2', chargeId: 'charge-2', gatewayRefundId: 're_secret', reversesPaymentId: 'pay-3' }),
        payment({ id: 'pay-3', chargeId: 'charge-2', method: 'online' }),
        payment({ id: 'pay-4', chargeId: 'charge-2', reversesPaymentId: 'pay-5' }),
        payment({ id: 'pay-5', chargeId: 'charge-2' }),
      ],
      orders: [order()],
      orderLines: [{ id: 'l1', orderId: 'order-1', productId: 'p1', unitPrice: 5000 }],
      bankTransactions: [{ ...transfer(), ...({ txHash: 'tx-hash' } as object) }],
      orderLinks: [{ id: 'link-1', campaignId: 'camp-1', expiresAt: at, createdAt: at }],
      names,
    })
    const all = strings(part.sections)
    for (const id of [GUARDIAN, WARD, STAFF_PERSON, STAFF_USER, 're_secret', 'tx-hash']) {
      expect(all).not.toContain(id)
    }
    expect(keys(part.sections).filter((key) => /hash$/i.test(key) || key === 'gatewayRefundId')).toEqual([])
    const payments = part.sections[1].rows
    // Not the payer of charge-1: its payment loses the title, the receipt and the recorder.
    expect(payments[0]).not.toHaveProperty('reference')
    expect(payments[1]).toMatchObject({ reference: 'Title naming someone', status: 'refund' })
    expect(payments[2]).toMatchObject({ status: 'booked' })
    expect(payments[3]).toMatchObject({ status: 'reversal' })
    expect(payments[4]).toMatchObject({ status: 'reversed' })
    expect(part.sections[5].rows).toEqual([expect.objectContaining({ id: 'l1', productName: null })])
  })
})
