// The `payments` part of the person data export (person data export spec
// `.ai/specs/2026-11-21-vereino-person-data-export.md`, *Contributor inventory* → `payments`, DD-X03, DD-X06; #527):
// pure mapping of the rows `services/data-export-contribution.ts` reads into the eight `payments` sections.
// - A charge names the subject as debtor or payer. The other party is a relation; a payer is always an active guardian
//   of the debtor or the adult debtor (`lib/manual-charges.ts` `payerEligible`), so the other party of a charge is the
//   guardian/ward pair and keeps its name (`payer`, `debtor`).
// - A payment on such a charge shows the amount, the day, the method and the status. The transfer title, the receipt,
//   the recorder, the collector and the bank or cash records are shown only when the subject is the charge's payer.
// - An order names the subject as participant or orderer: the orderer of a ward's order keeps their name, the ward of
//   the orderer too; the contact e-mail and phone only when the subject placed the order; the notes are a review field.
// - A bank transfer matched to the subject as payer keeps its counterparty fields, all review fields.
// - An order link sent to the subject as guardian: dates only.
// No row carries another person's id, a staff member's id, a hash, an idempotency key or a gateway (Stripe) id: the
// checkout's own id is its gateway reference.
import type { DataExportActorCount, DataExportPart, DataExportRow } from '../../people/services/data-export'

export const PAYMENTS_EXPORT_MODULE = 'payments' as const

/** The relations whose display name the file keeps (people `NAMED_RELATIONS`, DD-X03). */
const NAMED_RELATIONS: ReadonlySet<string> = new Set(['guardian', 'ward', 'payer', 'debtor', 'orderer', 'coach'])

/** Another person, never by id: the relation, and the name only for a named relation (people `redactPerson`). */
export function redactPerson(relation: string, name?: string | null): { relation: string; name?: string } {
  const trimmed = name?.trim()
  return NAMED_RELATIONS.has(relation) && trimmed ? { relation, name: trimmed } : { relation }
}

const STAFF = { relation: 'staff' } as const

export type ExportCharge = {
  id: string
  sourceType: string
  sourceId?: string | null
  personId?: string | null
  payerPersonId?: string | null
  payerMissing: boolean
  payerInstitutionId?: string | null
  payeeInstitutionId?: string | null
  /** Decrypted. */
  payerLabel?: string | null
  periodLabel?: string | null
  /** Decrypted. */
  description: string
  amount: number
  discountAmount: number
  discountRuleId?: string | null
  dueDate: string
  payee: string
  status: string
  cancelledAt?: Date | null
  cancelReason?: string | null
  lastRemindedAt?: Date | null
  reminderCount: number
  createdAt: Date
}

export type ExportPayment = {
  id: string
  chargeId: string
  amount: number
  method: string
  paidOn: string
  /** Decrypted. */
  reference?: string | null
  recordedByPersonId?: string | null
  recordedByUserId?: string | null
  reversesPaymentId?: string | null
  gatewayRefundId?: string | null
  isOverpayment: boolean
  collectedByPersonId?: string | null
  receiptNumber?: string | null
  bankTransactionId?: string | null
  cashHandoverId?: string | null
  createdAt: Date
}

export type ExportCheckout = {
  id: string
  chargeIds: readonly string[]
  amount: number
  chargeAmounts?: readonly number[] | null
  feeAmount: number
  status: string
  amountMismatch: boolean
  createdAt: Date
  updatedAt: Date
}

export type ExportPayerRef = { id: string; code: string; createdAt: Date }

export type ExportOrder = {
  id: string
  campaignId: string
  participantPersonId: string
  orderedByPersonId: string
  /** Decrypted. */
  contactEmail?: string | null
  /** Decrypted. */
  contactPhone?: string | null
  printName?: string | null
  printNumber?: number | null
  /** Decrypted. */
  notes?: string | null
  status: string
  chargeId: string
  submittedVia: string
  handedOverAt?: Date | null
  handedOverByPersonId?: string | null
  createdAt: Date
  updatedAt: Date
}

export type ExportOrderLine = {
  id: string
  orderId: string
  productId: string
  size?: string | null
  componentSizes?: Record<string, string> | null
  unitPrice: number
}

export type ExportBankTransaction = {
  id: string
  importId: string
  line: number
  bookedOn: string
  amount: number
  /** Decrypted. */
  counterpartyName?: string | null
  /** Decrypted. */
  counterpartyAccount?: string | null
  /** Decrypted. */
  title: string
  status: string
  allocation: readonly { chargeId: string; amount: number }[]
  matchReason: string
  autoBooked: boolean
  skipReason?: string | null
  skipNote?: string | null
  decidedByPersonId?: string | null
  decidedByUserId?: string | null
  decidedAt?: Date | null
  createdAt: Date
}

export type ExportOrderLink = {
  id: string
  campaignId: string
  expiresAt: Date
  lastUsedAt?: Date | null
  createdAt: Date
}

/** The actor rows (DD-X06) counted per table; `people` drops the zero ones. */
export type PaymentsActorCounts = {
  payments: number
  cashHandovers: number
  orderCampaigns: number
  bankImports: number
  bankTransactions: number
  orders: number
}

export type PaymentsExportInput = {
  subjectId: string
  charges: readonly ExportCharge[]
  payments: readonly ExportPayment[]
  checkouts: readonly ExportCheckout[]
  payerRefs: readonly ExportPayerRef[]
  orders: readonly ExportOrder[]
  orderLines: readonly ExportOrderLine[]
  bankTransactions: readonly ExportBankTransaction[]
  orderLinks: readonly ExportOrderLink[]
  /** Display names of the other persons named by `otherPersonIds`. */
  names: ReadonlyMap<string, string>
  campaignNames: ReadonlyMap<string, string>
  productNames: ReadonlyMap<string, string>
  actorCounts: PaymentsActorCounts
}

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null
}

/** The other persons the charges and orders name (their display names are read once, by the caller). */
export function otherPersonIds(
  subjectId: string,
  charges: readonly Pick<ExportCharge, 'personId' | 'payerPersonId'>[],
  orders: readonly Pick<ExportOrder, 'participantPersonId' | 'orderedByPersonId'>[],
): string[] {
  const ids = [
    ...charges.flatMap((row) => [row.personId, row.payerPersonId]),
    ...orders.flatMap((row) => [row.participantPersonId, row.orderedByPersonId]),
  ]
  return [...new Set(ids.filter((id): id is string => typeof id === 'string' && id !== subjectId))]
}

/** A party of a charge or an order as the file shows it: `subject`, a redacted other person, or none. */
function party(
  id: string | null | undefined,
  subjectId: string,
  relation: string,
  names: ReadonlyMap<string, string>,
): 'subject' | { relation: string; name?: string } | null {
  if (!id) return null
  return id === subjectId ? 'subject' : redactPerson(relation, names.get(id))
}

/** The charges the subject pays: those whose payer is the subject. */
export function chargesPaidBy(subjectId: string, charges: readonly ExportCharge[]): Set<string> {
  return new Set(charges.filter((row) => row.payerPersonId === subjectId).map((row) => row.id))
}

export function chargeRow(row: ExportCharge, subjectId: string, names: ReadonlyMap<string, string>): DataExportRow {
  const isPayer = row.payerPersonId === subjectId
  return {
    id: row.id,
    sourceType: row.sourceType,
    sourceId: row.sourceId ?? null,
    debtor: party(row.personId, subjectId, 'debtor', names),
    payer: party(row.payerPersonId, subjectId, 'payer', names),
    payerMissing: row.payerMissing,
    payerInstitutionId: row.payerInstitutionId ?? null,
    payeeInstitutionId: row.payeeInstitutionId ?? null,
    // A typed payer label names the payer: shown only when that is the subject.
    payerLabel: isPayer ? (row.payerLabel ?? null) : null,
    periodLabel: row.periodLabel ?? null,
    description: row.description,
    amount: row.amount,
    discountAmount: row.discountAmount,
    discountRuleId: row.discountRuleId ?? null,
    dueDate: row.dueDate,
    payee: row.payee,
    status: row.status,
    cancelledAt: iso(row.cancelledAt),
    cancelReason: row.cancelReason ?? null,
    lastRemindedAt: iso(row.lastRemindedAt),
    reminderCount: row.reminderCount,
    createdAt: iso(row.createdAt),
  }
}

export type PaymentStatus = 'booked' | 'reversed' | 'reversal' | 'refund' | 'overpayment'

/** A payment's state: a refund or a reversing entry, an overpayment to refund, a reversed payment, else booked. */
export function paymentStatus(row: ExportPayment, reversedIds: ReadonlySet<string>): PaymentStatus {
  if (row.gatewayRefundId) return 'refund'
  if (row.reversesPaymentId) return 'reversal'
  if (row.isOverpayment) return 'overpayment'
  return reversedIds.has(row.id) ? 'reversed' : 'booked'
}

export function paymentRow(row: ExportPayment, payerView: boolean, reversedIds: ReadonlySet<string>): DataExportRow {
  const base: DataExportRow = {
    id: row.id,
    chargeId: row.chargeId,
    amount: row.amount,
    paidOn: row.paidOn,
    method: row.method,
    status: paymentStatus(row, reversedIds),
  }
  if (!payerView) return base
  return {
    ...base,
    reference: row.reference ?? null,
    receiptNumber: row.receiptNumber ?? null,
    reversesPaymentId: row.reversesPaymentId ?? null,
    recordedBy: row.recordedByPersonId || row.recordedByUserId ? STAFF : null,
    collectedBy: row.collectedByPersonId ? STAFF : null,
    bankTransactionId: row.bankTransactionId ?? null,
    cashHandoverId: row.cashHandoverId ?? null,
    createdAt: iso(row.createdAt),
  }
}

/** A checkout: its own id is the gateway reference; the idempotency key and the gateway transaction stay out. */
export function checkoutRow(row: ExportCheckout): DataExportRow {
  return {
    id: row.id,
    chargeIds: [...row.chargeIds],
    amount: row.amount,
    chargeAmounts: row.chargeAmounts ? [...row.chargeAmounts] : null,
    feeAmount: row.feeAmount,
    status: row.status,
    amountMismatch: row.amountMismatch,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  }
}

export function payerRefRow(row: ExportPayerRef): DataExportRow {
  return { id: row.id, code: row.code, createdAt: iso(row.createdAt) }
}

export function orderRow(
  row: ExportOrder,
  subjectId: string,
  names: ReadonlyMap<string, string>,
  campaignNames: ReadonlyMap<string, string>,
): DataExportRow {
  const placedBySubject = row.orderedByPersonId === subjectId
  return {
    id: row.id,
    campaignId: row.campaignId,
    campaignName: campaignNames.get(row.campaignId) ?? null,
    participant: party(row.participantPersonId, subjectId, 'ward', names),
    orderedBy: party(row.orderedByPersonId, subjectId, 'orderer', names),
    // The orderer's contacts are the subject's only when the subject placed the order.
    contactEmail: placedBySubject ? (row.contactEmail ?? null) : null,
    contactPhone: placedBySubject ? (row.contactPhone ?? null) : null,
    printName: row.printName ?? null,
    printNumber: row.printNumber ?? null,
    notes: row.notes ?? null,
    status: row.status,
    chargeId: row.chargeId,
    submittedVia: row.submittedVia,
    handedOverAt: iso(row.handedOverAt),
    handedOverBy: row.handedOverByPersonId ? STAFF : null,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  }
}

export function orderLineRow(row: ExportOrderLine, productNames: ReadonlyMap<string, string>): DataExportRow {
  return {
    id: row.id,
    orderId: row.orderId,
    productId: row.productId,
    productName: productNames.get(row.productId) ?? null,
    size: row.size ?? null,
    componentSizes: row.componentSizes ? { ...row.componentSizes } : null,
    unitPrice: row.unitPrice,
  }
}

/** A transfer matched to the subject as payer; the fingerprint (`tx_hash`) stays out. */
export function bankTransactionRow(row: ExportBankTransaction): DataExportRow {
  return {
    id: row.id,
    importId: row.importId,
    line: row.line,
    bookedOn: row.bookedOn,
    amount: row.amount,
    counterpartyName: row.counterpartyName ?? null,
    counterpartyAccount: row.counterpartyAccount ?? null,
    title: row.title,
    status: row.status,
    allocation: row.allocation.map((entry) => ({ chargeId: entry.chargeId, amount: entry.amount })),
    matchReason: row.matchReason,
    autoBooked: row.autoBooked,
    skipReason: row.skipReason ?? null,
    skipNote: row.skipNote ?? null,
    decidedBy: row.decidedByPersonId || row.decidedByUserId ? STAFF : null,
    decidedAt: iso(row.decidedAt),
    createdAt: iso(row.createdAt),
  }
}

/** An order link sent to the subject as guardian: dates only, never the token hash. */
export function orderLinkRow(row: ExportOrderLink): DataExportRow {
  return {
    id: row.id,
    campaignId: row.campaignId,
    createdAt: iso(row.createdAt),
    expiresAt: iso(row.expiresAt),
    lastUsedAt: iso(row.lastUsedAt),
  }
}

/** The tables of the actor counts, in `PaymentsActorCounts` order. */
const ACTOR_TABLES: ReadonlyArray<[keyof PaymentsActorCounts, string]> = [
  ['payments', 'payments_payments'],
  ['cashHandovers', 'payments_cash_handovers'],
  ['orderCampaigns', 'payments_order_campaigns'],
  ['bankImports', 'payments_bank_imports'],
  ['bankTransactions', 'payments_bank_transactions'],
  ['orders', 'payments_orders'],
]

export function paymentsActorCounts(counts: PaymentsActorCounts): DataExportActorCount[] {
  return ACTOR_TABLES.map(([key, table]) => ({ module: PAYMENTS_EXPORT_MODULE, table, count: counts[key] }))
}

/** The eight `payments` sections (every one, empty or not) and the actor counts. */
export function paymentsExportPart(input: PaymentsExportInput): DataExportPart {
  const { subjectId, names } = input
  const paidBySubject = chargesPaidBy(subjectId, input.charges)
  const reversedIds = new Set(
    input.payments.flatMap((row) => (row.reversesPaymentId && !row.gatewayRefundId ? [row.reversesPaymentId] : [])),
  )
  const section = (table: string, activity: string, portable: boolean, rows: DataExportRow[]) => ({
    module: PAYMENTS_EXPORT_MODULE,
    table,
    activity,
    portable,
    rows,
  })
  return {
    sections: [
      section(
        'payments_charges',
        'A5',
        false,
        input.charges.map((row) => chargeRow(row, subjectId, names)),
      ),
      section(
        'payments_payments',
        'A5',
        false,
        input.payments.map((row) => paymentRow(row, paidBySubject.has(row.chargeId), reversedIds)),
      ),
      section('payments_checkouts', 'A6', true, input.checkouts.map(checkoutRow)),
      section('payments_payer_refs', 'A5', false, input.payerRefs.map(payerRefRow)),
      {
        ...section(
          'payments_orders',
          'A7',
          true,
          input.orders.map((row) => orderRow(row, subjectId, names, input.campaignNames)),
        ),
        reviewFields: ['notes'],
      },
      section(
        'payments_order_lines',
        'A7',
        true,
        input.orderLines.map((row) => orderLineRow(row, input.productNames)),
      ),
      {
        ...section('payments_bank_transactions', 'A5', false, input.bankTransactions.map(bankTransactionRow)),
        reviewFields: ['counterpartyName', 'counterpartyAccount', 'title', 'skipNote'],
      },
      section('payments_order_links', 'A7', false, input.orderLinks.map(orderLinkRow)),
    ],
    actorCounts: paymentsActorCounts(input.actorCounts),
  }
}
