// Reads of "Accept cash" for the `payments` routes (issue #114; foundation spec REQ-F16: routes reach the ORM only
// through services): the club's charges still to pay, optionally of one payer, their descriptions decrypted and what was
// paid on them; the payers with something to pay (also the statement's Assign, #113); and the cash one user accepted on
// a day, with the reversals that cancel some of it.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { Charge, Payment } from '../data/entities'
import { payerSummaries } from '../lib/cash'
import { OPEN_CHARGE_STATUSES, amountDueOf, remainingOf } from '../lib/charge-ledger'
import { findPersons, searchPersonIds, type PaymentsScope } from './directory'
import { paidTotals } from './ledger'

function freshEm(container: AwilixContainer): EntityManager {
  return container.resolve<EntityManager>('em').fork()
}

/** The club's charges with a payer that are still to pay (`open`, `partially_paid`), oldest first; optionally one payer's. */
export function openPayableCharges(
  container: AwilixContainer,
  scope: PaymentsScope,
  payerPersonId?: string,
): Promise<Charge[]> {
  return findWithDecryption(
    freshEm(container),
    Charge,
    {
      ...scope,
      deletedAt: null,
      status: { $in: [...OPEN_CHARGE_STATUSES] },
      payerPersonId: payerPersonId ?? { $ne: null },
    },
    { orderBy: { dueDate: 'asc', createdAt: 'asc', id: 'asc' } },
    scope,
  )
}

/**
 * The live cash payments a user accepted ("Accept cash") on `paidOn`, oldest first, and the ids of those a reversing
 * entry cancelled.
 */
export async function cashAcceptedBy(
  container: AwilixContainer,
  scope: PaymentsScope,
  userId: string,
  paidOn: string,
): Promise<{ payments: Payment[]; reversed: Set<string> }> {
  const em = freshEm(container)
  const payments = await em.find(
    Payment,
    {
      ...scope,
      deletedAt: null,
      method: 'cash',
      recordedByUserId: userId,
      receiptNumber: { $ne: null },
      reversesPaymentId: null,
      paidOn,
    },
    { orderBy: { createdAt: 'asc', id: 'asc' } },
  )
  if (payments.length === 0) return { payments, reversed: new Set() }
  const reversals = await em.find(
    Payment,
    { ...scope, deletedAt: null, reversesPaymentId: { $in: payments.map((row) => row.id) } },
    { fields: ['id', 'reversesPaymentId'] },
  )
  return { payments, reversed: new Set(reversals.map((row) => row.reversesPaymentId as string)) }
}

/** The payers of the given charges, by charge id (for the receipts list). */
export async function chargePayers(
  container: AwilixContainer,
  scope: PaymentsScope,
  chargeIds: readonly string[],
): Promise<Map<string, string | null>> {
  if (chargeIds.length === 0) return new Map()
  const rows = await freshEm(container).find(
    Charge,
    { ...scope, id: { $in: [...new Set(chargeIds)] } },
    { fields: ['id', 'payerPersonId'] },
  )
  return new Map(rows.map((row) => [row.id, row.payerPersonId ?? null]))
}

export type PayerWithDue = {
  payerPersonId: string
  firstName: string
  lastName: string
  wards: { personId: string; firstName: string; lastName: string }[]
  totalDue: number
  chargeCount: number
}

/**
 * The payers with charges still to pay, each with the wards the charges are for and the total due, sorted by surname;
 * `search` (three letters or more) matches the payer's or a ward's name. The payer select of "Accept cash" (#114) and
 * of the statement's Assign (#113).
 */
export async function payersWithDue(
  container: AwilixContainer,
  scope: PaymentsScope,
  search?: string,
): Promise<PayerWithDue[]> {
  const charges = await openPayableCharges(container, scope)
  const paid = await paidTotals(
    container,
    scope,
    charges.map((charge) => charge.id),
  )
  const summaries = payerSummaries(
    charges.map((charge) => ({
      payerPersonId: charge.payerPersonId as string,
      personId: charge.personId ?? null,
      remaining: remainingOf(amountDueOf(charge), paid.get(charge.id) ?? 0),
    })),
  )
  const matching = search ? await searchPersonIds(container, scope, search) : null
  const filtered = matching
    ? summaries.filter(
        (summary) => matching.has(summary.payerPersonId) || summary.wardIds.some((id) => matching.has(id)),
      )
    : summaries
  const persons = await findPersons(
    container,
    scope,
    filtered.flatMap((summary) => [summary.payerPersonId, ...summary.wardIds]),
  )
  return filtered
    .flatMap((summary) => {
      const payer = persons.get(summary.payerPersonId)
      if (!payer) return []
      return [
        {
          payerPersonId: summary.payerPersonId,
          firstName: payer.firstName,
          lastName: payer.lastName,
          wards: summary.wardIds.flatMap((personId) => {
            const ward = persons.get(personId)
            return ward ? [{ personId, firstName: ward.firstName, lastName: ward.lastName }] : []
          }),
          totalDue: summary.totalDue,
          chargeCount: summary.chargeCount,
        },
      ]
    })
    .sort(
      (a, b) =>
        a.lastName.localeCompare(b.lastName, 'pl') ||
        a.firstName.localeCompare(b.firstName, 'pl') ||
        a.payerPersonId.localeCompare(b.payerPersonId),
    )
}
