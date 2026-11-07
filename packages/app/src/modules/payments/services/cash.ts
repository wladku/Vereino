// Reads of "Accept cash" for the `payments` routes (issue #114; foundation spec REQ-F16: routes reach the ORM only
// through services): the club's charges still to pay, optionally of one payer, their descriptions decrypted and what was
// paid on them; and the cash one user accepted on a day, with the reversals that cancel some of it.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { Charge, Payment } from '../data/entities'
import { OPEN_CHARGE_STATUSES } from '../lib/charge-ledger'
import type { PaymentsScope } from './directory'

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
