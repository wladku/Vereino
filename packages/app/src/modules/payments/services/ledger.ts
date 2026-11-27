// Reads of the charge ledger for the `payments` routes (issue #109; foundation spec REQ-F16: routes reach the ORM only
// through services): one charge with its description decrypted, its payments with their titles decrypted, the paid
// totals of listed charges, the charges with an unreversed payment of a method, the charges with an online overpayment
// still to refund (DD-C10, #296) and whether the rentals perspective is shown (DD-C02, #291).
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { Charge, Payment } from '../data/entities'
import { chargeIdsToRefund, chargeIdsWithPayment } from '../data/queries'
import { rentalsPerspectiveShown } from '../lib/charge-ledger'
import type { PaymentsScope } from './directory'

/** `facilities`' occupancy service: registered whenever `facilities` is enabled (`facilities/di.ts`). */
const FACILITIES_OCCUPANCY_SERVICE = 'facilities.occupancyService'

function freshEm(container: AwilixContainer): EntityManager {
  return container.resolve<EntityManager>('em').fork()
}

/** One live charge of the club, its description decrypted; null when unknown. */
export async function findCharge(container: AwilixContainer, scope: PaymentsScope, id: string): Promise<Charge | null> {
  const rows = await findWithDecryption(freshEm(container), Charge, { id, ...scope, deletedAt: null }, {}, scope)
  return rows[0] ?? null
}

/** The live payments of a charge, oldest first, their titles decrypted. */
export function chargePayments(container: AwilixContainer, scope: PaymentsScope, chargeId: string): Promise<Payment[]> {
  return findWithDecryption(
    freshEm(container),
    Payment,
    { chargeId, ...scope, deletedAt: null },
    { orderBy: { paidOn: 'asc', createdAt: 'asc' } },
    scope,
  )
}

/**
 * What was paid on each of `chargeIds` (reversing entries included, online overpayments "to refund" excluded — they
 * are not payments of the charge, Q-049); charges without payments are absent.
 */
export async function paidTotals(
  container: AwilixContainer,
  scope: PaymentsScope,
  chargeIds: readonly string[],
  em?: EntityManager,
): Promise<Map<string, number>> {
  const unique = [...new Set(chargeIds)]
  const totals = new Map<string, number>()
  if (unique.length === 0) return totals
  const rows = await (em ?? freshEm(container)).find(
    Payment,
    { ...scope, chargeId: { $in: unique }, isOverpayment: false, deletedAt: null },
    { fields: ['id', 'chargeId', 'amount'] },
  )
  for (const row of rows) totals.set(row.chargeId, (totals.get(row.chargeId) ?? 0) + row.amount)
  return totals
}

/** The club's charges with a live, unreversed payment of `method`. */
export function chargesPaidBy(container: AwilixContainer, scope: PaymentsScope, method: string): Promise<string[]> {
  return chargeIdsWithPayment(freshEm(container), scope, method)
}

/** The club's charges holding an online overpayment still to refund (B-21 "To refund", DD-C10, #296). */
export function chargesToRefund(container: AwilixContainer, scope: PaymentsScope): Promise<string[]> {
  return chargeIdsToRefund(freshEm(container), scope)
}

/** The descriptions of live charges of the club, decrypted (the cash confirmation e-mail, #114). */
export async function chargeDescriptions(
  container: AwilixContainer,
  scope: PaymentsScope,
  chargeIds: readonly string[],
  em?: EntityManager,
): Promise<Map<string, string>> {
  if (chargeIds.length === 0) return new Map()
  // Decrypted on a fork with its own identity map; given `em`, on its transaction's connection (#836).
  const rows = await findWithDecryption(
    em ? em.fork({ keepTransactionContext: true }) : freshEm(container),
    Charge,
    { id: { $in: [...chargeIds] }, ...scope, deletedAt: null },
    { fields: ['id', 'description'] },
    scope,
  )
  return new Map(rows.map((row) => [row.id, row.description]))
}

/** The payers of the club's live charges among `chargeIds` (each once); a charge without a payer adds none. */
export async function chargePayers(
  container: AwilixContainer,
  scope: PaymentsScope,
  chargeIds: readonly string[],
): Promise<string[]> {
  if (chargeIds.length === 0) return []
  const rows = await freshEm(container).find(
    Charge,
    { id: { $in: [...chargeIds] }, ...scope, deletedAt: null },
    { fields: ['id', 'payerPersonId'] },
  )
  return [...new Set(rows.flatMap((row) => (row.payerPersonId ? [row.payerPersonId] : [])))]
}

/**
 * DD-C02: whether B-21 shows "Rentals (municipality)" — `facilities` is enabled in this deployment, or the club has a
 * live rental charge (one count, only when `facilities` is not registered).
 */
export async function rentalsPerspective(container: AwilixContainer, scope: PaymentsScope): Promise<boolean> {
  const facilitiesRegistered = container.hasRegistration(FACILITIES_OCCUPANCY_SERVICE)
  const liveRentalCharges = facilitiesRegistered
    ? 0
    : await freshEm(container).count(Charge, {
        ...scope,
        sourceType: 'rental',
        status: { $ne: 'cancelled' as const },
        deletedAt: null,
      })
  return rentalsPerspectiveShown({ facilitiesRegistered, liveRentalCharges })
}
