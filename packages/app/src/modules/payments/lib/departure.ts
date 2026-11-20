// What `payments` reports when a person leaves the club (people life-cycle spec REQ-L04, DD-L04, DD-L07, the `payments`
// row of the contributor table; phase L5, #307): the open charges per leaving person as debtor or payer (a warning),
// and the retention hold — the last day the name of a person with a booked payment must be kept. Pure.
import type { CalendarDate } from '@vereino/core'

/** Accounting evidence is kept for five calendar years after the year of the payment (DD-L07). */
export const RETENTION_YEARS = 5

/**
 * The retention hold for the latest payment booked on a charge whose debtor or payer is the person (*Retention hold*):
 * 31 December of the fifth year after the payment's year; null without a payment.
 */
export function retentionHoldUntil(latestPaidOn: CalendarDate | null): CalendarDate | null {
  if (!latestPaidOn) return null
  return `${String(Number(latestPaidOn.slice(0, 4)) + RETENTION_YEARS)}-12-31`
}

export type OpenChargeFacts = { id: string; personId: string | null; payerPersonId: string | null }

/** Per leaving person, how many open charges name them as debtor or payer (a charge counts once per person). */
export function openChargesByPerson(
  charges: readonly OpenChargeFacts[],
  personIds: readonly string[],
): Map<string, number> {
  const counts = new Map<string, number>()
  for (const personId of personIds) {
    const count = charges.filter((charge) => charge.personId === personId || charge.payerPersonId === personId).length
    if (count > 0) counts.set(personId, count)
  }
  return counts
}
