// Pure rules of the manual charge and of assigning a payer (payments parity spec *Domain Vocabulary* → Manual charge,
// Assigning a payer, Automatic payer assignment; REQ-C06, DD-C12; issue #295 E12-S05): the description and due-date
// bounds of a manual charge, its payer by the base spec's *Payer* rule, who may pay a charge (an active guardian of the
// debtor, or the debtor when adult) and when a payer may be assigned. Time is a parameter; nothing here reads the
// database.
import { isAdultOn, type CalendarDate } from '@vereino/core'
import type { ChargeStatus } from './payments-rules'

/** A manual charge's description: 3–200 characters. */
export const MIN_MANUAL_DESCRIPTION_LENGTH = 3
export const MAX_MANUAL_DESCRIPTION_LENGTH = 200

/** A manual charge is due from 12 months before to 12 months after the club's today. */
export const MANUAL_DUE_MONTHS = 12

/** `date` moved by `months` whole months; a day the target month lacks becomes its last day (31 Jan + 1 → 28/29 Feb). */
export function shiftMonths(date: CalendarDate, months: number): CalendarDate {
  const year = Number(date.slice(0, 4))
  const month = Number(date.slice(5, 7)) - 1 + months
  const targetYear = year + Math.floor(month / 12)
  const targetMonth = ((month % 12) + 12) % 12
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate()
  const day = Math.min(Number(date.slice(8, 10)), lastDay)
  return `${String(targetYear).padStart(4, '0')}-${String(targetMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

/** The earliest and latest due date a manual charge may have on `today`, both inclusive. */
export function manualDueRange(today: CalendarDate): { from: CalendarDate; to: CalendarDate } {
  return { from: shiftMonths(today, -MANUAL_DUE_MONTHS), to: shiftMonths(today, MANUAL_DUE_MONTHS) }
}

export function manualDueDateInRange(dueDate: CalendarDate, today: CalendarDate): boolean {
  const { from, to } = manualDueRange(today)
  return dueDate >= from && dueDate <= to
}

/** What `payer_person_id` is compared against: the debtor's active guardians and the debtor's birth date. */
export type PayerFacts = {
  debtorId: string
  /** The debtor's guardians whose guardianship is active today. */
  guardianIds: readonly string[]
  /** The debtor's active primary-payer guardian, when there is one. */
  primaryPayerId: string | null
  debtorBirthDate: CalendarDate | null
  today: CalendarDate
}

function debtorIsAdult(facts: PayerFacts): boolean {
  return facts.debtorBirthDate !== null && isAdultOn(facts.debtorBirthDate, facts.today)
}

/** Who may pay the debtor's charge: their active guardians, then the debtor when adult; each once, in that order. */
export function payerOptionIds(facts: PayerFacts): string[] {
  const options = [...new Set(facts.guardianIds)]
  if (debtorIsAdult(facts) && !options.includes(facts.debtorId)) options.push(facts.debtorId)
  return options
}

/** Whether `payerId` may pay the debtor's charge (422 `charge_payer_not_eligible` otherwise). */
export function payerEligible(payerId: string, facts: PayerFacts): boolean {
  return payerOptionIds(facts).includes(payerId)
}

/** The payer of a new manual charge by the *Payer* rule: the primary payer, else the adult debtor, else nobody. */
export function manualPayerOf(facts: PayerFacts): string | null {
  if (facts.primaryPayerId) return facts.primaryPayerId
  return debtorIsAdult(facts) ? facts.debtorId : null
}

export type AssignPayerRefusal = 'charge_not_payable' | 'charge_payer_already_set'

/** A payer is assigned only to an `open` or `partially_paid` charge that has none. */
export function assignPayerRefusal(charge: { status: ChargeStatus; payerMissing: boolean }): AssignPayerRefusal | null {
  if (charge.status !== 'open' && charge.status !== 'partially_paid') return 'charge_not_payable'
  return charge.payerMissing ? null : 'charge_payer_already_set'
}
