// The "Paid on time" leading indicator of the pilot (club spec *Overview and Success Measures*; product brief Goals,
// D21; E27-S03, #820): of the `fee` and `order` charges that fall due in a period, how many were fully paid by their
// due date. Pure: `services/pilot-indicators.ts` reads the charges and their payments, and this file counts them.
//
// - Only `fee` and `order` charges count (rental and manual charges are left out); a cancelled charge never counts.
// - Paid on time = the payments dated on or before the due date (`paid_on`, club calendar; reversing entries
//   included, overpayments never) cover the amount due. A charge only partly paid by then is not on time.
// - A charge whose due date has not passed yet counts only once it is paid on time: until then it cannot be late.
// - A charge with nothing to pay (a full discount) is left out.
import type { CalendarDate } from '@vereino/core'
import { amountDueOf } from './charge-ledger'
import type { ChargeSourceType, ChargeStatus } from './payments-rules'

/** The charge sources the indicator counts. */
export const ON_TIME_SOURCE_TYPES: readonly ChargeSourceType[] = ['fee', 'order']

export type OnTimeCharge = {
  sourceType: ChargeSourceType
  status: ChargeStatus
  amount: number
  discountAmount: number
  dueDate: CalendarDate
  payments: readonly { amount: number; paidOn: CalendarDate; isOverpayment: boolean }[]
}

export type OnTimeCounts = { count: number; total: number }

/** Whether the payments dated on or before the due date cover the amount due. */
export function paidByDueDate(charge: OnTimeCharge): boolean {
  const paid = charge.payments
    .filter((payment) => !payment.isOverpayment && payment.paidOn <= charge.dueDate)
    .reduce((sum, payment) => sum + payment.amount, 0)
  return paid >= amountDueOf(charge)
}

/** Whether the charge belongs in the indicator's denominator on `today` (see the file comment). */
export function countsForOnTime(charge: OnTimeCharge, today: CalendarDate): boolean {
  if (!ON_TIME_SOURCE_TYPES.includes(charge.sourceType) || charge.status === 'cancelled') return false
  if (amountDueOf(charge) <= 0) return false
  return charge.dueDate < today || paidByDueDate(charge)
}

/** The count over a list of charges. */
export function countPaidOnTime(charges: readonly OnTimeCharge[], today: CalendarDate): OnTimeCounts {
  let count = 0
  let total = 0
  for (const charge of charges) {
    if (!countsForOnTime(charge, today)) continue
    total += 1
    if (paidByDueDate(charge)) count += 1
  }
  return { count, total }
}
