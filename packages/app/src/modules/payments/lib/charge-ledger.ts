// Pure rules of the charge ledger, phase 4 step 3 (payments spec *Domain Vocabulary* → Charge, Payment; REQ-011,
// REQ-012, TEST-020; issue #109 E07-S02): the payment methods, the amount due and what remains of it, the status a
// charge derives from its payments, the overdue marker, why a payment, a cancellation or a reversal is refused, the
// B-21 perspectives and the CSV export. A payment is an immutable credit; a correction is a reversing entry (a
// negative payment linked by `reverses_payment_id`), so the sum of a charge's payments is what was paid. Time is a
// parameter (engineering standards S3.5); nothing here reads the database.
import type { CalendarDate } from '@vereino/core'
import type { ChargeStatus } from './payments-rules'

/** `cash` and `transfer` are recorded by the administrator; `online` arrives through the checkout (step 4). */
export const PAYMENT_METHODS = ['cash', 'transfer', 'online'] as const
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]

export const MANUAL_PAYMENT_METHODS = ['cash', 'transfer'] as const
export type ManualPaymentMethod = (typeof MANUAL_PAYMENT_METHODS)[number]

/** Who receives the money: the club, or the institution that owns the place (a municipality). */
export const PAYEES = ['club', 'owner_institution'] as const
export type Payee = (typeof PAYEES)[number]

/** The statuses a payment can still be recorded against; overdue is derived from them, never stored. */
export const OPEN_CHARGE_STATUSES: readonly ChargeStatus[] = ['open', 'partially_paid']

/** The longest reason of a cancellation or a reversal, and the longest payment title. */
export const MAX_REASON_LENGTH = 500
export const MAX_REFERENCE_LENGTH = 200

/** The amount due of a charge in grosz: its amount less its discount. */
export function amountDueOf(charge: { amount: number; discountAmount: number }): number {
  return charge.amount - charge.discountAmount
}

/** What was paid on a charge: the sum of its payments, reversing entries (negative) included. */
export function paidTotal(payments: readonly { amount: number }[]): number {
  return payments.reduce((sum, payment) => sum + payment.amount, 0)
}

/** What remains to pay, never below zero. */
export function remainingOf(amountDue: number, paid: number): number {
  return Math.max(0, amountDue - paid)
}

/**
 * The status a charge derives from what was paid on it: `paid` once the amount due is covered, `partially_paid` with
 * anything paid, `open` otherwise. A cancelled or forfeited charge keeps its status.
 */
export function settledStatus(current: ChargeStatus, amountDue: number, paid: number): ChargeStatus {
  if (current === 'cancelled' || current === 'forfeited') return current
  if (paid >= amountDue && amountDue > 0) return 'paid'
  return paid > 0 ? 'partially_paid' : 'open'
}

/** True for a charge still to pay whose due date has passed in the club's calendar. */
export function isOverdue(charge: { status: string | null; dueDate: string | null }, today: CalendarDate): boolean {
  return (
    OPEN_CHARGE_STATUSES.includes(charge.status as ChargeStatus) && charge.dueDate !== null && charge.dueDate < today
  )
}

export type PaymentRefusal = 'charge_not_payable' | 'payment_exceeds_remaining' | 'payment_date_in_future'

/**
 * Why a manual payment is refused, or null: a cancelled or forfeited charge takes none (409), the amount may not
 * exceed what remains (422 "The amount exceeds the remaining 50 zł"), and money cannot arrive in the future (422).
 */
export function paymentRefusal(input: {
  status: ChargeStatus
  remaining: number
  amount: number
  paidOn: CalendarDate
  today: CalendarDate
}): PaymentRefusal | null {
  if (input.status === 'cancelled' || input.status === 'forfeited') return 'charge_not_payable'
  if (input.amount > input.remaining) return 'payment_exceeds_remaining'
  if (input.paidOn > input.today) return 'payment_date_in_future'
  return null
}

export type CancelRefusal = 'charge_not_cancellable' | 'charge_has_payments'

/** Why a cancellation is refused, or null: only an `open` charge with nothing paid on it can be cancelled (409). */
export function cancelRefusal(input: { status: ChargeStatus; paid: number }): CancelRefusal | null {
  if (input.status === 'partially_paid' || input.status === 'paid' || input.paid !== 0) return 'charge_has_payments'
  if (input.status !== 'open') return 'charge_not_cancellable'
  return null
}

export type ReverseRefusal = 'payment_not_reversible' | 'payment_already_reversed'

/**
 * Why a reversal is refused, or null (409): only a manual (`cash`, `transfer`) payment that is not itself a reversing
 * entry can be reversed, and only once; an online payment is refunded instead (DD-42).
 */
export function reverseRefusal(payment: {
  method: string
  reversesPaymentId: string | null
  reversed: boolean
}): ReverseRefusal | null {
  if (payment.reversesPaymentId !== null || !(MANUAL_PAYMENT_METHODS as readonly string[]).includes(payment.method)) {
    return 'payment_not_reversible'
  }
  return payment.reversed ? 'payment_already_reversed' : null
}

/** Grosz as złoty the way the club writes them (`5000` → `50 zł`, `123456` → `1 234,56 zł`), in every locale. */
export function formatZloty(grosz: number): string {
  const sign = grosz < 0 ? '-' : ''
  const absolute = Math.abs(grosz)
  const whole = String(Math.floor(absolute / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
  const cents = absolute % 100
  return `${sign}${whole}${cents === 0 ? '' : ',' + String(cents).padStart(2, '0')} zł`
}

// --- B-21 perspectives ---

/**
 * The perspectives of the charge list in the mockup's order (payments parity Q-C02, #292): membership fees (the
 * default), overdue, orders, without payer, rentals — only when DD-C02 allows (#291) —, cash payments and all.
 */
export const CHARGE_PERSPECTIVES = ['fees', 'overdue', 'orders', 'payer_missing', 'rentals', 'cash', 'all'] as const
export type ChargePerspective = (typeof CHARGE_PERSPECTIVES)[number]

export const DEFAULT_CHARGE_PERSPECTIVE: ChargePerspective = 'fees'

/** The charge-list query filters of a perspective. */
export function perspectiveQuery(perspective: ChargePerspective): Record<string, string> {
  switch (perspective) {
    case 'fees':
      return { sourceType: 'fee' }
    case 'overdue':
      return { overdue: '1' }
    case 'payer_missing':
      return { payerMissing: '1' }
    case 'cash':
      return { paymentMethod: 'cash' }
    case 'orders':
      return { sourceType: 'order' }
    case 'rentals':
      return { sourceType: 'rental' }
    case 'all':
      return {}
  }
}

/** The B-21 list opened in a perspective (`?perspective=…`, the B-01 widgets' links, #111); the default needs none. */
export function chargesPerspectiveHref(path: string, perspective: ChargePerspective): string {
  return perspective === DEFAULT_CHARGE_PERSPECTIVE ? path : `${path}?perspective=${perspective}`
}

/** The perspective a `?perspective=` value names among those shown, or the default. */
export function chargePerspectiveOf(value: string | null, shown: readonly ChargePerspective[]): ChargePerspective {
  return shown.find((perspective) => perspective === value) ?? DEFAULT_CHARGE_PERSPECTIVE
}

/** The perspectives shown: "Rentals (municipality)" only when the list response says so (DD-C02). */
export function visiblePerspectives(rentalsShown: boolean): ChargePerspective[] {
  return CHARGE_PERSPECTIVES.filter((perspective) => perspective !== 'rentals' || rentalsShown)
}

/** The B-21 list's state as its URL carries it (payments parity REQ-C03, #292; precedent DD-U03). */
export type ChargeListUrlState = {
  perspective: ChargePerspective
  period: string
  payee: Payee | ''
  search: string
  page: number
}

/**
 * The B-21 state from the URL's query: any known perspective (a link may open "Rentals (municipality)" before the
 * list says whether it is shown), the period, a known payee, the search and the page; unknown or blank values fall
 * back to the defaults.
 */
export function readChargeListUrl(get: (key: string) => string | null): ChargeListUrlState {
  const payee = get('payee') ?? ''
  const page = Number(get('page'))
  return {
    perspective: chargePerspectiveOf(get('perspective'), CHARGE_PERSPECTIVES),
    period: get('period')?.trim() ?? '',
    payee: (PAYEES as readonly string[]).includes(payee) ? (payee as Payee) : '',
    search: get('search') ?? '',
    page: Number.isInteger(page) && page > 1 ? page : 1,
  }
}

/** The URL query of a B-21 state without the defaults; `?perspective=` keeps the B-01 widgets' links working. */
export function chargeListUrlParams(state: ChargeListUrlState): Record<string, string> {
  const params: Record<string, string> = {}
  if (state.perspective !== DEFAULT_CHARGE_PERSPECTIVE) params.perspective = state.perspective
  if (state.period.trim()) params.period = state.period.trim()
  if (state.payee) params.payee = state.payee
  if (state.search.trim()) params.search = state.search
  if (state.page > 1) params.page = String(state.page)
  return params
}

/** Statuses whose remaining amount B-21 shows as "—": nothing is left to pay or nothing is owed any more. */
export const SETTLED_CHARGE_STATUSES = ['paid', 'cancelled', 'forfeited'] as const

/** Whether B-21 shows the remaining amount of a charge in this status (REQ-C03); "—" otherwise. */
export function remainingShown(status: string | null | undefined): boolean {
  return !(SETTLED_CHARGE_STATUSES as readonly string[]).includes(status ?? '')
}

/** Where a payment came from (payments parity API table, `source`; B-22 "Received by", #292). */
export type PaymentSource = 'manual' | 'bank_statement' | 'cash' | 'online'

/**
 * The source of a payment: a booked transfer of an imported statement, an online payment, cash, or a transfer
 * recorded by hand. The statement's Undo carries its transaction, so its reversing entry reads "bank statement" too.
 */
export function paymentSourceOf(payment: { method: string; bankTransactionId?: string | null }): PaymentSource {
  if (payment.bankTransactionId) return 'bank_statement'
  if (payment.method === 'online') return 'online'
  if (payment.method === 'cash') return 'cash'
  return 'manual'
}

/**
 * DD-C02 (payments parity spec, #291): "Rentals (municipality)" is shown when `facilities` registers its occupancy
 * service in this deployment, or when the club has at least one live rental charge — so old charges stay reachable
 * after `facilities` is disabled.
 */
export function rentalsPerspectiveShown(input: { facilitiesRegistered: boolean; liveRentalCharges: number }): boolean {
  return input.facilitiesRegistered || input.liveRentalCharges > 0
}

// --- Charges of another module's source: the rental charge (facilities DD-19; payments parity DD-C01, #291) ---

/** The largest rental charge in grosz: the largest rental amount `facilities` accepts (PLN 1 000 000). */
export const MAX_SOURCE_CHARGE_AMOUNT = 100_000_000

/** The longest typed-in renter's name stored as a payer label. */
export const MAX_PAYER_LABEL_LENGTH = 200

export type SourcePayer = {
  payerInstitutionId: string | null
  payerPersonId: string | null
  payerLabel: string | null
}

/**
 * The payer of a rental charge: the first that is present of the renter institution, the renter person and the
 * typed-in name (trimmed, at most 200 characters). Only the chosen one is stored. Null when there is none — the
 * service answers 422 `charge_payer_required`.
 */
export function sourcePayerOf(input: {
  payerInstitutionId?: string | null
  payerPersonId?: string | null
  payerDisplayName?: string | null
}): SourcePayer | null {
  if (input.payerInstitutionId) {
    return { payerInstitutionId: input.payerInstitutionId, payerPersonId: null, payerLabel: null }
  }
  if (input.payerPersonId) return { payerInstitutionId: null, payerPersonId: input.payerPersonId, payerLabel: null }
  const label = input.payerDisplayName?.trim().slice(0, MAX_PAYER_LABEL_LENGTH).trim()
  return label ? { payerInstitutionId: null, payerPersonId: null, payerLabel: label } : null
}

/** A rental charge's amount: whole grosz from 0 (a free rental) to `MAX_SOURCE_CHARGE_AMOUNT`. */
export function sourceAmountValid(amount: number): boolean {
  return Number.isSafeInteger(amount) && amount >= 0 && amount <= MAX_SOURCE_CHARGE_AMOUNT
}

/** A free rental has nothing to pay: its charge is born `paid`, every other one `open`. */
export function sourceChargeStatus(amount: number): ChargeStatus {
  return amount === 0 ? 'paid' : 'open'
}

/**
 * What cancelling a rental (`cancelForSource`) does to its live charge: nothing when it is already cancelled or
 * forfeited; the warning `charge_paid` (the charge stays as it is) when any payment was recorded on it, reversed or
 * not; otherwise it is cancelled or forfeited. A free rental's charge (born `paid`, no payment) is cancelled too.
 */
export function sourceCancelDecision(input: {
  status: ChargeStatus
  hasPayments: boolean
}): 'cancel' | 'charge_paid' | 'none' {
  if (input.status === 'cancelled' || input.status === 'forfeited') return 'none'
  return input.hasPayments || input.status === 'partially_paid' ? 'charge_paid' : 'cancel'
}

type NamedPayer = { firstName: string; lastName: string }

/**
 * The payer a charge shows, in the display order of a rental charge: the institution, then the person, then the
 * typed-in name; null when none is known.
 */
export function payerDisplayName(charge: {
  payerInstitution?: { name: string } | null
  payer?: NamedPayer | null
  payerLabel?: string | null
}): string | null {
  if (charge.payerInstitution?.name) return charge.payerInstitution.name
  const person = [charge.payer?.firstName, charge.payer?.lastName].filter(Boolean).join(' ')
  if (person) return person
  return charge.payerLabel || null
}

// --- CSV export ---

/**
 * One CSV cell: quoted when it holds the separator, a quote or a line break; a cell that a spreadsheet would read as a
 * formula (`=`, `+`, `-`, `@`, tab, carriage return) is prefixed with `'` (CSV injection).
 */
export function csvCell(value: string | number | null | undefined, separator = ';'): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number') return String(value)
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return safe.includes(separator) || /["\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

/** Rows as CSV with `;` (what a Polish spreadsheet opens) and CRLF line ends. */
export function toCsv(rows: readonly (readonly (string | number | null | undefined)[])[], separator = ';'): string {
  return rows.map((row) => row.map((cell) => csvCell(cell, separator)).join(separator)).join('\r\n')
}
