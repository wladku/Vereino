// Pure rules of the online checkout, phase 4 step 4 (payments spec DD-42, *Domain Vocabulary* → Payment, Checkout
// fulfilment, Online refund; REQ-012, R13; TEST-019, TEST-055, TEST-057; issue #110 E07-S03): the surcharge of the
// `payer_pays` mode, why a charge cannot be paid online, the grosz ↔ złoty boundary of the gateway, the outcome of a
// provider status, how a captured checkout is spread over its charges (from the oldest; a share whose charge is no
// longer open becomes an overpayment "to refund", Q-049), the M-09 state, why a refund is refused and which
// checkouts the sweep expires. Since the payments parity spec (DD-C07, #298) a `partially_paid` charge is paid online
// for what remains: the checkout stores each charge's remainder as its share, and the fulfilment spreads by the shares.
// Time is a parameter (engineering standards S3.5); nothing here reads the database.
import type { ChargeStatus } from './payments-rules'

/** The club setting `online_fee_mode` (R13, D-022): the club pays the commission, or the payer pays it on top. */
export type OnlineFeeSettings = {
  onlineFeeMode: 'club_pays' | 'payer_pays'
  /** Percent of the paid amount, up to two decimals (1.5 = 1.5 %). */
  onlineFeePercent: number
  /** Grosz added to each online payment. */
  onlineFeeFixed: number
}

/**
 * The surcharge of a checkout of `amount` grosz: nothing when the club pays; `percent × amount + fixed` (rounded to
 * the grosz) when the payer pays — a separate line of the checkout, never a payment of a charge.
 */
export function onlineFeeOf(amount: number, settings: OnlineFeeSettings): number {
  if (settings.onlineFeeMode !== 'payer_pays' || amount <= 0) return 0
  // The percent has at most two decimals, so basis points keep the product exact.
  const basisPoints = Math.round(settings.onlineFeePercent * 100)
  return Math.round((amount * basisPoints) / 10_000) + settings.onlineFeeFixed
}

export type CheckoutTotals = { amount: number; feeAmount: number; total: number }

/** The checkout's amount (the charges' shares — what remains on each), its surcharge and what the payer pays. */
export function checkoutTotals(shares: readonly number[], settings: OnlineFeeSettings): CheckoutTotals {
  const amount = shares.reduce((sum, share) => sum + share, 0)
  const feeAmount = onlineFeeOf(amount, settings)
  return { amount, feeAmount, total: amount + feeAmount }
}

/** A charge as the checkout sees it. `visible`: the caller pays it, or it is their own or their ward's charge. */
export type CheckoutCharge = {
  status: ChargeStatus
  payerMissing: boolean
  visible: boolean
}

export type CheckoutRefusal = 'checkout_charge_forbidden' | 'payer_missing' | 'charge_not_open'

/** The statuses paid online, for what remains on the charge (DD-C07). */
export const ONLINE_PAYABLE_STATUSES: readonly ChargeStatus[] = ['open', 'partially_paid']

/** True for a charge status that can be paid online (`open`, `partially_paid`). */
export function isOnlinePayable(status: ChargeStatus): boolean {
  return ONLINE_PAYABLE_STATUSES.includes(status)
}

/**
 * Why the charges cannot be paid online, or null: a charge the caller does not see is someone else's (403); a charge
 * without a payer cannot be paid online (422, "no payer — contact the club"); a `paid`, `cancelled` or `forfeited`
 * charge answers 409 `charge_not_open` (the code is kept, Contract 2); `open` and `partially_paid` are paid for what
 * remains (DD-C07).
 */
export function checkoutRefusal(charges: readonly CheckoutCharge[]): CheckoutRefusal | null {
  if (charges.some((charge) => !charge.visible)) return 'checkout_charge_forbidden'
  if (charges.some((charge) => charge.payerMissing)) return 'payer_missing'
  if (charges.some((charge) => !isOnlinePayable(charge.status))) return 'charge_not_open'
  return null
}

/**
 * Each charge's share of a new checkout, in the order of `chargeIds`: what remains on it now (never below zero). The
 * shares are stored in `charge_amounts` and sum to the checkout's amount (DD-C07).
 */
export function checkoutShares(chargeIds: readonly string[], remaining: ReadonlyMap<string, number>): number[] {
  return chargeIds.map((id) => Math.max(remaining.get(id) ?? 0, 0))
}

/** Grosz as the gateway's amount in złoty (S10.9: the only place the unit changes, DD-42). */
export function toGatewayAmount(grosz: number): number {
  return grosz / 100
}

/** The gateway's amount in złoty as grosz. */
export function fromGatewayAmount(zloty: number): number {
  return Math.round(zloty * 100)
}

/** What a provider status means for a checkout. */
export type ProviderOutcome = 'captured' | 'failed' | 'pending'

/**
 * `captured` once the money arrived (a later refund still means it arrived); `failed` for a terminal status without
 * money; `pending` otherwise (still being paid, or unknown).
 */
export function providerOutcome(status: string): ProviderOutcome {
  if (status === 'captured' || status === 'refunded' || status === 'partially_refunded') return 'captured'
  if (status === 'failed' || status === 'cancelled' || status === 'expired') return 'failed'
  return 'pending'
}

/** A charge of a checkout at fulfilment, with what remains to pay on it now and its stored share (null before #298). */
export type FulfilmentCharge = {
  id: string
  dueDate: string
  status: ChargeStatus
  amountDue: number
  remaining: number
  share: number | null
}

export type FulfilmentLine = { chargeId: string; amount: number; overpayment: boolean }

export type FulfilmentPlan = { kind: 'book'; lines: FulfilmentLine[] } | { kind: 'amount_mismatch' }

/**
 * How a captured checkout is booked (DD-42, DD-C07). The amount received must equal the checkout's total (charges and
 * surcharge), else nothing is booked and the checkout is flagged. The charges' amount is spread from the oldest
 * charge (due date, then id): each takes up to its stored share — its amount due for a checkout without shares; what a
 * still-payable charge needs is a payment of it, the rest of the share — the part above what remains after a payment
 * made meanwhile, the whole share of a charge paid or cancelled meanwhile — is an overpayment of that charge flagged
 * "to refund" (Q-049). Anything left after the last share is an overpayment of the last charge.
 */
export function fulfilmentPlan(input: {
  amount: number
  feeAmount: number
  received: number
  charges: readonly FulfilmentCharge[]
}): FulfilmentPlan {
  if (input.received !== input.amount + input.feeAmount || input.charges.length === 0) {
    return { kind: 'amount_mismatch' }
  }
  const ordered = [...input.charges].sort((a, b) =>
    a.dueDate === b.dueDate ? a.id.localeCompare(b.id) : a.dueDate.localeCompare(b.dueDate),
  )
  const lines: FulfilmentLine[] = []
  let left = input.amount
  for (const [index, charge] of ordered.entries()) {
    const last = index === ordered.length - 1
    const share = last ? left : Math.min(Math.max(charge.share ?? charge.amountDue, 0), left)
    left -= share
    const paid = isOnlinePayable(charge.status) ? Math.min(share, charge.remaining) : 0
    if (paid > 0) lines.push({ chargeId: charge.id, amount: paid, overpayment: false })
    if (share - paid > 0) lines.push({ chargeId: charge.id, amount: share - paid, overpayment: true })
  }
  return { kind: 'book', lines }
}

/** The stored checkout statuses (payments spec *Data Models* → `payments_checkouts`). */
export const CHECKOUT_STATUSES = ['created', 'completed', 'failed', 'expired'] as const
export type CheckoutStatus = (typeof CHECKOUT_STATUSES)[number]

/** What M-09 shows: received, in progress (not captured yet — it refreshes), or interrupted (the charges stay open). */
export type ReturnState = 'received' | 'in_progress' | 'interrupted'

export function returnState(status: CheckoutStatus): ReturnState {
  if (status === 'completed') return 'received'
  if (status === 'created') return 'in_progress'
  return 'interrupted'
}

/** How long M-09 refreshes by itself, and how often (the issue: every few seconds for 30 s, then a button). */
export const RETURN_POLL_INTERVAL_MS = 3_000
export const RETURN_POLL_WINDOW_MS = 30_000

/** True while M-09 still refreshes by itself. */
export function shouldAutoRefresh(state: ReturnState, elapsedMs: number): boolean {
  return state === 'in_progress' && elapsedMs < RETURN_POLL_WINDOW_MS
}

export type RefundRefusal = 'payment_not_refundable' | 'refund_exceeds_remaining'

/**
 * Why a refund is refused, or null: only an `online` payment that is not itself a reversing entry is refunded (409),
 * and at most its part not refunded yet (422).
 */
export function refundRefusal(input: {
  method: string
  reversesPaymentId: string | null
  amount: number
  refundable: number
}): RefundRefusal | null {
  if (input.method !== 'online' || input.reversesPaymentId !== null) return 'payment_not_refundable'
  if (input.amount > input.refundable) return 'refund_exceeds_remaining'
  return null
}

/** The checkouts the sweep still looks at (younger than 7 days) and when a `created` one expires (24 hours). */
export const RECONCILE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000
export const CHECKOUT_EXPIRY_MS = 24 * 60 * 60 * 1000

/** True for a `created` checkout old enough to be expired when the provider has not captured it. */
export function isExpirable(checkout: { status: CheckoutStatus; createdAt: Date }, now: Date): boolean {
  return checkout.status === 'created' && now.getTime() - checkout.createdAt.getTime() >= CHECKOUT_EXPIRY_MS
}
