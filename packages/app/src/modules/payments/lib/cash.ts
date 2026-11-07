// Pure rules of "Accept cash", phase 4 step 8 (payments spec *Domain Vocabulary* → Cash payment; REQ-031, TEST-043;
// issue #114 E07-S07): the order the selected charges are paid in (oldest first), how an amount is spread over them
// (a lower amount is a partial payment of the newest it reaches), why an acceptance is refused, and the club's
// `KP/YYYY/MM/NNN` receipt numbers. Time is a parameter (engineering standards S3.5); nothing here reads the database.
import type { CalendarDate } from '@vereino/core'
import type { ChargeStatus } from './payments-rules'

/** At most this many charges in one acceptance (a family's open charges fit easily). */
export const MAX_CASH_CHARGES = 50

/** A selected charge as the allocation needs it: its due date, when it was created and what remains of it. */
export type CashCharge = {
  id: string
  status: ChargeStatus
  dueDate: CalendarDate
  /** ISO timestamp; breaks a due-date tie. */
  createdAt: string
  remaining: number
}

export type CashAllocation = { chargeId: string; amount: number }

/** The charges in the order cash pays them: the earliest due date first, then the earliest created, then the id. */
export function oldestFirst<T extends Pick<CashCharge, 'id' | 'dueDate' | 'createdAt'>>(charges: readonly T[]): T[] {
  return [...charges].sort(
    (a, b) => a.dueDate.localeCompare(b.dueDate) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
  )
}

/** The total still to pay on the selected charges. */
export function selectedTotal(charges: readonly Pick<CashCharge, 'remaining'>[]): number {
  return charges.reduce((sum, charge) => sum + charge.remaining, 0)
}

/**
 * Spreads `amount` over the charges oldest first: each takes what remains of it until the amount runs out, so a
 * lower amount leaves the newest charges partially paid or untouched. Charges that take nothing are left out.
 */
export function allocateCash(charges: readonly CashCharge[], amount: number): CashAllocation[] {
  const allocations: CashAllocation[] = []
  let left = amount
  for (const charge of oldestFirst(charges)) {
    if (left <= 0) break
    const share = Math.min(left, charge.remaining)
    if (share > 0) allocations.push({ chargeId: charge.id, amount: share })
    left -= share
  }
  return allocations
}

export type CashRefusal =
  'charge_not_payable' | 'charge_already_paid' | 'cash_exceeds_selected' | 'payment_date_in_future'

/**
 * Why an acceptance is refused, or null: a cancelled or forfeited charge takes nothing (409), nor does a charge with
 * nothing left to pay (409); the amount may not exceed what remains on the selected charges (422), and cash cannot be
 * received in the future (422).
 */
export function cashRefusal(input: {
  charges: readonly Pick<CashCharge, 'status' | 'remaining'>[]
  amount: number
  paidOn: CalendarDate
  today: CalendarDate
}): CashRefusal | null {
  if (input.charges.some((charge) => charge.status === 'cancelled' || charge.status === 'forfeited')) {
    return 'charge_not_payable'
  }
  if (input.charges.some((charge) => charge.status === 'paid' || charge.remaining <= 0)) return 'charge_already_paid'
  if (input.amount > selectedTotal(input.charges)) return 'cash_exceeds_selected'
  if (input.paidOn > input.today) return 'payment_date_in_future'
  return null
}

/** `KP/YYYY/MM/` of the month cash was received in: the prefix the club's numbering of that month shares. */
export function receiptPrefix(paidOn: CalendarDate): string {
  return `KP/${paidOn.slice(0, 4)}/${paidOn.slice(5, 7)}/`
}

/** The sequence of a receipt number (`KP/2026/11/007` → 7), or null for anything else. */
export function receiptSequence(receiptNumber: string): number | null {
  const match = /^KP\/\d{4}\/\d{2}\/(\d+)$/.exec(receiptNumber)
  return match ? Number(match[1]) : null
}

/** The next receipt number of the month after `lastSequence` (0 when none was issued): `KP/2026/11/001`. */
export function nextReceiptNumber(paidOn: CalendarDate, lastSequence: number): string {
  return `${receiptPrefix(paidOn)}${String(lastSequence + 1).padStart(3, '0')}`
}

// --- The payer select and "Received by me today" ---

export type PayerSummary = { payerPersonId: string; wardIds: string[]; totalDue: number; chargeCount: number }

/**
 * The payers of charges still to pay, each with the wards the charges are for (the debtors other than the payer, in
 * order of first appearance), the total due and the number of charges; payers with nothing due are left out.
 */
export function payerSummaries(
  charges: readonly { payerPersonId: string; personId: string | null; remaining: number }[],
): PayerSummary[] {
  const byPayer = new Map<string, PayerSummary>()
  for (const charge of charges) {
    if (charge.remaining <= 0) continue
    const summary = byPayer.get(charge.payerPersonId) ?? {
      payerPersonId: charge.payerPersonId,
      wardIds: [],
      totalDue: 0,
      chargeCount: 0,
    }
    summary.totalDue += charge.remaining
    summary.chargeCount += 1
    if (charge.personId && charge.personId !== charge.payerPersonId && !summary.wardIds.includes(charge.personId)) {
      summary.wardIds.push(charge.personId)
    }
    byPayer.set(charge.payerPersonId, summary)
  }
  return [...byPayer.values()]
}

export type ReceiptSummary = {
  receiptNumber: string
  payerPersonId: string | null
  /** What the receipt still holds: its payments less the reversed ones. */
  amount: number
  chargeCount: number
  /** Every payment of the receipt was reversed. */
  reversed: boolean
  createdAt: string
}

/**
 * The cash payments of one collector grouped by receipt, in the order they were accepted, and the total to hand over
 * (reversed payments count for nothing).
 */
export function receiptSummaries(
  payments: readonly { id: string; receiptNumber: string; chargeId: string; amount: number; createdAt: string }[],
  reversed: ReadonlySet<string>,
  payerOf: ReadonlyMap<string, string | null>,
): { items: ReceiptSummary[]; total: number } {
  const byNumber = new Map<string, ReceiptSummary>()
  for (const payment of payments) {
    const summary = byNumber.get(payment.receiptNumber) ?? {
      receiptNumber: payment.receiptNumber,
      payerPersonId: payerOf.get(payment.chargeId) ?? null,
      amount: 0,
      chargeCount: 0,
      reversed: true,
      createdAt: payment.createdAt,
    }
    summary.chargeCount += 1
    if (!reversed.has(payment.id)) {
      summary.amount += payment.amount
      summary.reversed = false
    }
    byNumber.set(payment.receiptNumber, summary)
  }
  const items = [...byNumber.values()]
  return { items, total: items.reduce((sum, item) => sum + item.amount, 0) }
}
