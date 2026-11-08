// Pure rules of phase 4 step 5 (payments spec *Domain Vocabulary* → Payer code; REQ-012, REQ-030; issue #111 E07-S04):
// the payer code `GW-XXXX`, the payer's Today tile (open total and nearest due date, "Everything is paid", or "The
// guardian pays" for an adult participant whose charges someone else pays), and the B-01 "Overdue" summary (the
// remaining total and the number of families, a family being one payer). Randomness and today are parameters
// (engineering standards S3.5); nothing here reads the database.
import type { CalendarDate } from '@vereino/core'
import { OPEN_CHARGE_STATUSES } from './charge-ledger'
import type { ChargeStatus } from './payments-rules'

export const PAYER_CODE_PREFIX = 'GW-'

/** Upper-case letters and digits without the look-alikes 0/O and 1/I, so a code survives being typed from a screen. */
export const PAYER_CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'

export const PAYER_CODE_LENGTH = 4

/** How many paid charges M-08 lists after the open ones. */
export const PAYMENT_HISTORY_LIMIT = 6

const PAYER_CODE_PATTERN = new RegExp(`^${PAYER_CODE_PREFIX}[${PAYER_CODE_ALPHABET}]{${String(PAYER_CODE_LENGTH)}}$`)

/** A new payer code; `random` returns a number in [0, 1) like `Math.random`. */
export function generatePayerCode(random: () => number): string {
  let code = PAYER_CODE_PREFIX
  for (let index = 0; index < PAYER_CODE_LENGTH; index += 1) {
    const position = Math.min(PAYER_CODE_ALPHABET.length - 1, Math.floor(random() * PAYER_CODE_ALPHABET.length))
    code += PAYER_CODE_ALPHABET[position]
  }
  return code
}

/** True for a well-formed payer code (upper case, as issued). */
export function isPayerCode(value: string): boolean {
  return PAYER_CODE_PATTERN.test(value)
}

export type OwnCharge = {
  status: ChargeStatus
  dueDate: CalendarDate
  /** What remains to pay in grosz. */
  remaining: number
  payerPersonId: string | null
  personId: string | null
}

/**
 * The Today tile: `due` with the open total and the nearest due date; `paid` when nothing is open; `guardian_pays`
 * when the caller pays nothing while someone else pays their own charges (an adult participant whose guardian pays).
 */
export type OwnPaymentsSummary =
  | { state: 'due'; openTotal: number; openCount: number; nearestDueDate: CalendarDate; overdue: boolean }
  | { state: 'paid' }
  | { state: 'guardian_pays' }

/**
 * The caller's summary from the live charges they pay or that are their own; `personId` is the caller's person.
 * A charge without a payer is not counted: it cannot be paid online until the club assigns one.
 */
export function ownPaymentsSummary(
  personId: string,
  charges: readonly OwnCharge[],
  today: CalendarDate,
): OwnPaymentsSummary {
  const paying = charges.filter((charge) => charge.payerPersonId === personId)
  if (paying.length === 0) {
    const paidByOthers = charges.some(
      (charge) => charge.personId === personId && charge.payerPersonId !== null && charge.payerPersonId !== personId,
    )
    return paidByOthers ? { state: 'guardian_pays' } : { state: 'paid' }
  }
  const open = paying.filter((charge) => OPEN_CHARGE_STATUSES.includes(charge.status) && charge.remaining > 0)
  if (open.length === 0) return { state: 'paid' }
  const nearestDueDate = open.map((charge) => charge.dueDate).reduce((min, date) => (date < min ? date : min))
  return {
    state: 'due',
    openTotal: open.reduce((sum, charge) => sum + charge.remaining, 0),
    openCount: open.length,
    nearestDueDate,
    overdue: nearestDueDate < today,
  }
}

/** The B-01 "Overdue" widget: what remains on overdue charges, how many charges and how many families (payers). */
export function overdueSummary(charges: readonly { payerPersonId: string | null; remaining: number }[]): {
  total: number
  charges: number
  families: number
} {
  const families = new Set(charges.flatMap((charge) => (charge.payerPersonId ? [charge.payerPersonId] : [])))
  return {
    total: charges.reduce((sum, charge) => sum + charge.remaining, 0),
    charges: charges.length,
    families: families.size,
  }
}
