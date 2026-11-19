// Reads of B-33 "Cash to settle" (payments spec REQ-033, TEST-046; issue #118 E07-S11; foundation spec REQ-F16:
// routes reach the ORM only through services): the cash each collector still holds — their live cash payments with a
// `KP` receipt that are in no handover — and the club's handover history, newest first.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { CashHandover, Payment } from '../data/entities'
import { custodyByCollector, type CollectorCustody } from '../lib/cash-handovers'
import { receiptCharges } from './cash'
import { findPersons, type PaymentsScope } from './directory'

type PersonName = { firstName: string; lastName: string }

function freshEm(container: AwilixContainer): EntityManager {
  return container.resolve<EntityManager>('em').fork()
}

function calendarDate(value: unknown): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10)
}

export type CustodyPayment = {
  paymentId: string
  receiptNumber: string
  paidOn: string
  amount: number
  chargeId: string
  description: string
  payerPersonId: string | null
  payer: PersonName | null
}

export type CustodyCollector = Omit<CollectorCustody, 'payments'> & {
  collector: PersonName | null
  payments: CustodyPayment[]
}

/**
 * The cash held by collectors (B-33): per collector their live, unsettled cash payments with the receipt, the day, the
 * charge and its payer, the oldest day and the total; the collectors holding the oldest cash first.
 */
export async function cashCustody(
  container: AwilixContainer,
  scope: PaymentsScope,
): Promise<{ items: CustodyCollector[]; total: number }> {
  const em = freshEm(container)
  const payments = await em.find(
    Payment,
    {
      ...scope,
      deletedAt: null,
      method: 'cash',
      collectedByPersonId: { $ne: null },
      receiptNumber: { $ne: null },
      reversesPaymentId: null,
      cashHandoverId: null,
    },
    { orderBy: { paidOn: 'asc', createdAt: 'asc', id: 'asc' } },
  )
  if (payments.length === 0) return { items: [], total: 0 }
  const reversals = await em.find(
    Payment,
    { ...scope, deletedAt: null, reversesPaymentId: { $in: payments.map((row) => row.id) } },
    { fields: ['id', 'reversesPaymentId'] },
  )
  const custody = custodyByCollector(
    payments.map((row) => ({
      id: row.id,
      collectorPersonId: row.collectedByPersonId as string,
      receiptNumber: row.receiptNumber as string,
      chargeId: row.chargeId,
      paidOn: calendarDate(row.paidOn),
      amount: row.amount,
      createdAt: row.createdAt.toISOString(),
    })),
    new Set(reversals.map((row) => row.reversesPaymentId as string)),
  )
  const charges = await receiptCharges(
    container,
    scope,
    custody.items.flatMap((item) => item.payments.map((payment) => payment.chargeId)),
  )
  const persons = await findPersons(
    container,
    scope,
    [
      ...custody.items.map((item) => item.collectorPersonId),
      ...[...charges.values()].flatMap((charge) => (charge.payerPersonId ? [charge.payerPersonId] : [])),
    ],
    em,
  )
  const nameOf = (personId: string | null): PersonName | null => {
    const person = personId ? persons.get(personId) : undefined
    return person ? { firstName: person.firstName, lastName: person.lastName } : null
  }
  return {
    items: custody.items.map((item) => ({
      ...item,
      collector: nameOf(item.collectorPersonId),
      payments: item.payments.map((payment) => {
        const charge = charges.get(payment.chargeId)
        const payerPersonId = charge?.payerPersonId ?? null
        return {
          paymentId: payment.id,
          receiptNumber: payment.receiptNumber,
          paidOn: payment.paidOn,
          amount: payment.amount,
          chargeId: payment.chargeId,
          description: charge?.description ?? '',
          payerPersonId,
          payer: nameOf(payerPersonId),
        }
      }),
    })),
    total: custody.total,
  }
}

export type HandoverRow = {
  id: string
  number: string
  collectorPersonId: string
  collector: PersonName | null
  receivedBy: PersonName | null
  amount: number
  paymentCount: number
  receiptNumbers: string[]
  createdAt: string
}

/** The club's cash handovers, newest first, with who handed over and who received, and the receipts they settled. */
export async function cashHandoverHistory(
  container: AwilixContainer,
  scope: PaymentsScope,
  page: number,
  pageSize: number,
): Promise<{ items: HandoverRow[]; total: number; page: number; pageSize: number; totalPages: number }> {
  const em = freshEm(container)
  const [rows, total] = await em.findAndCount(
    CashHandover,
    { ...scope, deletedAt: null },
    { orderBy: { createdAt: 'desc', id: 'desc' }, limit: pageSize, offset: (page - 1) * pageSize },
  )
  const payments = rows.length
    ? await em.find(
        Payment,
        { ...scope, cashHandoverId: { $in: rows.map((row) => row.id) } },
        { fields: ['id', 'cashHandoverId', 'receiptNumber'], orderBy: { receiptNumber: 'asc' } },
      )
    : []
  const persons = await findPersons(
    container,
    scope,
    rows.flatMap((row) => [row.collectorPersonId, ...(row.receivedByPersonId ? [row.receivedByPersonId] : [])]),
    em,
  )
  const nameOf = (personId: string | null | undefined): PersonName | null => {
    const person = personId ? persons.get(personId) : undefined
    return person ? { firstName: person.firstName, lastName: person.lastName } : null
  }
  return {
    items: rows.map((row) => ({
      id: row.id,
      number: row.number,
      collectorPersonId: row.collectorPersonId,
      collector: nameOf(row.collectorPersonId),
      receivedBy: nameOf(row.receivedByPersonId),
      amount: row.amount,
      paymentCount: row.paymentIds.length,
      receiptNumbers: [
        ...new Set(
          payments
            .filter((payment) => payment.cashHandoverId === row.id)
            .map((payment) => payment.receiptNumber as string),
        ),
      ],
      createdAt: row.createdAt.toISOString(),
    })),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  }
}
