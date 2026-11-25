// Pure rules of the cash handover, phase 4 step 10 (payments spec *Data Models* → `payments_cash_handovers`; REQ-033,
// TEST-046; issue #118 E07-S11, UX concept B-33): who holds which cash payments, why accepting a handover is refused
// and the club's `RG/YYYY/MM/NNN` handover numbers. Since D-042 (REQ-033a, DD-31a, #791) the collector sends a pending
// handover that the treasurer or administrator confirms or rejects, or the collector withdraws: its states, who is
// told it was sent, and why a step is refused. Time is a parameter (engineering standards S3.5); nothing here reads
// the database.
import type { CalendarDate } from '@vereino/core'

/** At most this many payments in one handover. */
export const MAX_HANDOVER_PAYMENTS = 200

/** At most this many characters in the reason of a rejection. */
export const MAX_REJECTION_REASON = 500

/** A handover's state (DD-31a): sent and waiting, or decided. The one-sided fallback is `confirmed` at once. */
export const CASH_HANDOVER_STATUSES = ['pending', 'confirmed', 'rejected', 'withdrawn'] as const

export type CashHandoverStatus = (typeof CASH_HANDOVER_STATUSES)[number]

/** A decision on a pending handover: the confirmers confirm or reject it, the collector withdraws it. */
export type HandoverDecision = 'confirmed' | 'rejected' | 'withdrawn'

/** Why a decision on a handover in `status` is refused, or null: only a pending handover is decided (409). */
export function handoverDecisionRefusal(status: CashHandoverStatus): 'cash_handover_not_pending' | null {
  return status === 'pending' ? null : 'cash_handover_not_pending'
}

/**
 * Who is told a handover was sent: the club administrators and the treasurers on the day, each once, never the
 * collector who sent it (a coordinator who is also an administrator holds no cash, DD-31, but the rule stays plain).
 */
export function handoverConfirmerIds(input: {
  admins: readonly string[]
  treasurers: readonly string[]
  collectorPersonId: string
}): string[] {
  return [...new Set([...input.admins, ...input.treasurers])].filter((id) => id !== input.collectorPersonId).sort()
}

/** `RG/YYYY/MM/` of the month a handover was accepted in: the prefix the club's numbering of that month shares. */
export function handoverPrefix(acceptedOn: CalendarDate): string {
  return `RG/${acceptedOn.slice(0, 4)}/${acceptedOn.slice(5, 7)}/`
}

/** The sequence of a handover number (`RG/2026/11/007` → 7), or null for anything else. */
export function handoverSequence(number: string): number | null {
  const match = /^RG\/\d{4}\/\d{2}\/(\d+)$/.exec(number)
  return match ? Number(match[1]) : null
}

/** The next handover number of the month after `lastSequence` (0 when none was issued): `RG/2026/11/001`. */
export function nextHandoverNumber(acceptedOn: CalendarDate, lastSequence: number): string {
  return `${handoverPrefix(acceptedOn)}${String(lastSequence + 1).padStart(3, '0')}`
}

/** A payment as the handover checks it. */
export type HandoverCandidate = {
  id: string
  method: string
  receiptNumber: string | null
  collectedByPersonId: string | null
  reversesPaymentId: string | null
  cashHandoverId: string | null
  /** The pending handover that reserves this payment (DD-31a), or null. */
  pendingCashHandoverId: string | null
  /** A reversing entry names this payment. */
  reversed: boolean
}

export type HandoverRefusal =
  | 'cash_handover_payments_invalid'
  | 'cash_already_settled'
  | 'cash_handover_payment_pending'
  | 'cash_payment_reversed'

/**
 * Why sending or accepting a handover of `paymentIds` from `collectorPersonId` is refused, or null: every payment must
 * exist and be cash with a receipt collected by that person (422 otherwise; one handover is one collector); a payment
 * already in a handover is settled (409), a payment of a pending handover is reserved by it (409, DD-31a), and a
 * reversed payment is no longer held by anyone (409).
 */
export function handoverRefusal(input: {
  collectorPersonId: string
  paymentIds: readonly string[]
  payments: readonly HandoverCandidate[]
}): HandoverRefusal | null {
  const byId = new Map(input.payments.map((payment) => [payment.id, payment]))
  const selected = input.paymentIds.map((id) => byId.get(id))
  if (
    selected.some(
      (payment) =>
        !payment ||
        payment.method !== 'cash' ||
        !payment.receiptNumber ||
        payment.reversesPaymentId !== null ||
        payment.collectedByPersonId !== input.collectorPersonId,
    )
  ) {
    return 'cash_handover_payments_invalid'
  }
  const candidates = selected as HandoverCandidate[]
  if (candidates.some((payment) => payment.cashHandoverId !== null)) return 'cash_already_settled'
  if (candidates.some((payment) => payment.pendingCashHandoverId !== null)) return 'cash_handover_payment_pending'
  if (candidates.some((payment) => payment.reversed)) return 'cash_payment_reversed'
  return null
}

/**
 * Why confirming a pending handover is refused, or null (DD-31a): its payments are reserved by it, so only a payment
 * reversed while the handover waited is no longer held (409 `cash_payment_reversed`; the confirmer rejects it and the
 * collector sends the rest again). A payment the handover no longer reserves is a broken invariant, refused the same
 * way as a settled one.
 */
export function confirmRefusal(input: {
  handoverId: string
  paymentIds: readonly string[]
  payments: readonly HandoverCandidate[]
}): 'cash_already_settled' | 'cash_payment_reversed' | null {
  const byId = new Map(input.payments.map((payment) => [payment.id, payment]))
  const selected = input.paymentIds.map((id) => byId.get(id))
  if (
    selected.some(
      (payment) => !payment || payment.cashHandoverId !== null || payment.pendingCashHandoverId !== input.handoverId,
    )
  ) {
    return 'cash_already_settled'
  }
  if ((selected as HandoverCandidate[]).some((payment) => payment.reversed)) return 'cash_payment_reversed'
  return null
}

/** The pending handovers' count and total (the Today row "Handovers to confirm", M-18a). */
export function pendingSummary(handovers: readonly { amount: number }[]): { count: number; total: number } {
  return { count: handovers.length, total: handovers.reduce((sum, handover) => sum + handover.amount, 0) }
}

/** A cash payment still held by its collector. */
export type HeldPayment = {
  id: string
  collectorPersonId: string
  receiptNumber: string
  chargeId: string
  paidOn: CalendarDate
  amount: number
  createdAt: string
  /** The pending handover that reserves it (DD-31a): still held, but not selectable in the one-sided acceptance. */
  pendingHandoverId?: string | null
}

export type CollectorCustody = {
  collectorPersonId: string
  payments: HeldPayment[]
  /** The day the oldest held payment was received. */
  oldestPaidOn: CalendarDate
  total: number
}

/**
 * The cash held by each collector (B-33 "Cash to settle"): their payments oldest first, the oldest day and the total;
 * the collectors holding the oldest cash come first, then the larger total. Reversed payments are held by no one.
 */
export function custodyByCollector(
  payments: readonly HeldPayment[],
  reversed: ReadonlySet<string>,
): { items: CollectorCustody[]; total: number } {
  const byCollector = new Map<string, HeldPayment[]>()
  for (const payment of payments) {
    if (reversed.has(payment.id)) continue
    byCollector.set(payment.collectorPersonId, [...(byCollector.get(payment.collectorPersonId) ?? []), payment])
  }
  const items = [...byCollector.entries()].map(([collectorPersonId, held]): CollectorCustody => {
    const sorted = [...held].sort(
      (a, b) => a.paidOn.localeCompare(b.paidOn) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
    )
    return {
      collectorPersonId,
      payments: sorted,
      oldestPaidOn: sorted[0].paidOn,
      total: sorted.reduce((sum, payment) => sum + payment.amount, 0),
    }
  })
  items.sort(
    (a, b) =>
      a.oldestPaidOn.localeCompare(b.oldestPaidOn) ||
      b.total - a.total ||
      a.collectorPersonId.localeCompare(b.collectorPersonId),
  )
  return { items, total: items.reduce((sum, item) => sum + item.total, 0) }
}
