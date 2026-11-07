// Reads of the payer's own charges and checkouts (`GET /api/payments/my-charges`, M-08; `POST
// /api/payments/checkouts/{id}/refresh`, M-09; payments spec API table, REQ-012; #110). The payer sees the charges
// they pay, and their own or their wards' charges without a payer — shown, but not payable online ("no payer —
// contact the club"). Cancelled charges are not listed. Routes reach the ORM only through services (REQ-F16).
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { Charge, Checkout, Payment } from '../data/entities'
import { amountDueOf, isOverdue, paidTotal, remainingOf } from '../lib/charge-ledger'
import { returnState } from '../lib/checkout-rules'
import type { Payer } from './checkout'
import { clubClock, findPersons } from './directory'

/** The most recent checkouts returned with the list (the M-08 banner of a payment still in progress). */
const RECENT_CHECKOUTS = 10

function freshEm(container: AwilixContainer): EntityManager {
  return container.resolve<EntityManager>('em').fork()
}

function calendarDate(value: unknown): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10)
}

export type MyChargeItem = {
  id: string
  description: string
  personId: string | null
  person: { firstName: string; lastName: string } | null
  periodLabel: string | null
  dueDate: string
  amountDue: number
  paid: number
  remaining: number
  status: string
  overdue: boolean
  payerMissing: boolean
  /** True when the caller may select it for an online payment: an `open` charge they pay. */
  payable: boolean
}

export type CheckoutSummary = {
  id: string
  status: string
  state: string
  chargeIds: string[]
  amount: number
  feeAmount: number
  total: number
  amountMismatch: boolean
  createdAt: string
}

export function checkoutSummary(row: Checkout): CheckoutSummary {
  return {
    id: row.id,
    status: row.status,
    state: returnState(row.status),
    chargeIds: row.chargeIds,
    amount: row.amount,
    feeAmount: row.feeAmount,
    total: row.amount + row.feeAmount,
    amountMismatch: row.amountMismatch,
    createdAt: row.createdAt.toISOString(),
  }
}

function visibleWhere(payer: Payer) {
  return {
    ...payer.scope,
    deletedAt: null,
    status: { $ne: 'cancelled' as const },
    $or: [
      { payerPersonId: payer.personId },
      { payerMissing: true, personId: { $in: [payer.personId, ...payer.wardIds] } },
    ],
  }
}

/** The payer's charges as M-08 lists them, by due date (the page groups what is still to pay). */
export async function myCharges(
  container: AwilixContainer,
  payer: Payer,
  paging: { page: number; pageSize: number },
): Promise<{ items: MyChargeItem[]; total: number; checkouts: CheckoutSummary[] }> {
  const em = freshEm(container)
  const [rows, total] = await Promise.all([
    findWithDecryption(
      em,
      Charge,
      visibleWhere(payer),
      {
        orderBy: { dueDate: 'asc', id: 'asc' },
        limit: paging.pageSize,
        offset: (paging.page - 1) * paging.pageSize,
      },
      payer.scope,
    ),
    em.count(Charge, visibleWhere(payer)),
  ])
  const payments = rows.length
    ? await em.find(
        Payment,
        { ...payer.scope, chargeId: { $in: rows.map((row) => row.id) }, isOverpayment: false, deletedAt: null },
        { fields: ['id', 'chargeId', 'amount'] },
      )
    : []
  const [persons, clock, checkouts] = await Promise.all([
    findPersons(
      container,
      payer.scope,
      rows.flatMap((row) => (row.personId ? [row.personId] : [])),
    ),
    clubClock(container, payer.scope),
    em.find(
      Checkout,
      { ...payer.scope, payerPersonId: payer.personId, deletedAt: null },
      { orderBy: { createdAt: 'desc' }, limit: RECENT_CHECKOUTS },
    ),
  ])
  const items = rows.map((row): MyChargeItem => {
    const amountDue = amountDueOf(row)
    const paid = paidTotal(payments.filter((payment) => payment.chargeId === row.id))
    const dueDate = calendarDate(row.dueDate)
    const person = row.personId ? persons.get(row.personId) : undefined
    return {
      id: row.id,
      description: row.description,
      personId: row.personId ?? null,
      person: person ? { firstName: person.firstName, lastName: person.lastName } : null,
      periodLabel: row.periodLabel ?? null,
      dueDate,
      amountDue,
      paid,
      remaining: remainingOf(amountDue, paid),
      status: row.status,
      overdue: isOverdue({ status: row.status, dueDate }, clock.today),
      payerMissing: row.payerMissing,
      payable: row.status === 'open' && !row.payerMissing && row.payerPersonId === payer.personId,
    }
  })
  return { items, total, checkouts: checkouts.map(checkoutSummary) }
}

/** One checkout of the payer, or null when it is not theirs (or unknown). */
export async function myCheckout(container: AwilixContainer, payer: Payer, id: string): Promise<Checkout | null> {
  return freshEm(container).findOne(Checkout, {
    id,
    ...payer.scope,
    payerPersonId: payer.personId,
    deletedAt: null,
  })
}

/** The charges of a checkout with their current status (M-09 lists what was paid). */
export async function checkoutCharges(
  container: AwilixContainer,
  payer: Payer,
  checkout: Checkout,
): Promise<{ id: string; description: string; status: string; amountDue: number }[]> {
  const rows = await findWithDecryption(
    freshEm(container),
    Charge,
    { id: { $in: checkout.chargeIds }, ...payer.scope, deletedAt: null },
    { orderBy: { dueDate: 'asc', id: 'asc' } },
    payer.scope,
  )
  return rows.map((row) => ({
    id: row.id,
    description: row.description,
    status: row.status,
    amountDue: amountDueOf(row),
  }))
}
