// Reads of the charge ledger for the `payments` routes (issue #109; foundation spec REQ-F16: routes reach the ORM only
// through services): one charge with its description decrypted, its payments with their titles decrypted, the paid
// totals of listed charges and the charges with an unreversed payment of a method.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { Charge, Payment } from '../data/entities'
import { chargeIdsWithPayment } from '../data/queries'
import type { PaymentsScope } from './directory'

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

/** What was paid on each of `chargeIds` (reversing entries included); charges without payments are absent. */
export async function paidTotals(
  container: AwilixContainer,
  scope: PaymentsScope,
  chargeIds: readonly string[],
): Promise<Map<string, number>> {
  const unique = [...new Set(chargeIds)]
  const totals = new Map<string, number>()
  if (unique.length === 0) return totals
  const rows = await freshEm(container).find(
    Payment,
    { ...scope, chargeId: { $in: unique }, deletedAt: null },
    { fields: ['id', 'chargeId', 'amount'] },
  )
  for (const row of rows) totals.set(row.chargeId, (totals.get(row.chargeId) ?? 0) + row.amount)
  return totals
}

/** The club's charges with a live, unreversed payment of `method`. */
export function chargesPaidBy(container: AwilixContainer, scope: PaymentsScope, method: string): Promise<string[]> {
  return chargeIdsWithPayment(freshEm(container), scope, method)
}
