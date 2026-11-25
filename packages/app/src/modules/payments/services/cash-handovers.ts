// Reads of B-33 "Cash to settle" (payments spec REQ-033, TEST-046; issue #118 E07-S11; foundation spec REQ-F16:
// routes reach the ORM only through services): the cash each collector still holds — their live cash payments with a
// `KP` receipt that are in no handover — and the club's handover history, newest first. Since D-042 (REQ-033a,
// DD-31a, #791): a held payment names the pending handover that reserves it, the history filters by status (the
// pending ones oldest first, for the confirmers) and carries who sent and decided each handover, and the collector
// reads their own held payments and handovers.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { CashHandover, Payment } from '../data/entities'
import { custodyByCollector, type CashHandoverStatus, type CollectorCustody } from '../lib/cash-handovers'
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
  /** The pending handover that reserves it (D-042): not selectable in the one-sided acceptance. */
  pendingHandoverId: string | null
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
      pendingHandoverId: row.pendingCashHandoverId ?? null,
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
          pendingHandoverId: payment.pendingHandoverId ?? null,
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

export type HandoverPayment = { paymentId: string; receiptNumber: string; amount: number; payer: PersonName | null }

export type HandoverRow = {
  id: string
  number: string
  status: CashHandoverStatus
  collectorPersonId: string
  collector: PersonName | null
  receivedBy: PersonName | null
  /** Who confirmed, rejected or withdrew it. */
  decidedBy: PersonName | null
  /** False for cash the club settled without the collector's step (the fallback, and every handover before D-042). */
  sentByCollector: boolean
  amount: number
  paymentCount: number
  receiptNumbers: string[]
  payments: HandoverPayment[]
  rejectionReason: string | null
  sentAt: string | null
  decidedAt: string | null
  createdAt: string
}

/** The handover rows of `rows` with their receipts, payers and the names of who handed over and who decided. */
async function handoverRows(
  container: AwilixContainer,
  em: EntityManager,
  scope: PaymentsScope,
  rows: readonly CashHandover[],
): Promise<HandoverRow[]> {
  if (rows.length === 0) return []
  const payments = await em.find(
    Payment,
    { ...scope, id: { $in: [...new Set(rows.flatMap((row) => row.paymentIds))] } },
    { fields: ['id', 'chargeId', 'receiptNumber', 'amount'], orderBy: { receiptNumber: 'asc', id: 'asc' } },
  )
  const charges = await receiptCharges(
    container,
    scope,
    payments.map((payment) => payment.chargeId),
  )
  const persons = await findPersons(
    container,
    scope,
    [
      ...rows.flatMap((row) =>
        [row.collectorPersonId, row.receivedByPersonId, row.decidedByPersonId].flatMap((id) => (id ? [id] : [])),
      ),
      ...[...charges.values()].flatMap((charge) => (charge.payerPersonId ? [charge.payerPersonId] : [])),
    ],
    em,
  )
  const nameOf = (personId: string | null | undefined): PersonName | null => {
    const person = personId ? persons.get(personId) : undefined
    return person ? { firstName: person.firstName, lastName: person.lastName } : null
  }
  const byId = new Map(payments.map((payment) => [payment.id, payment]))
  return rows.map((row) => {
    const own = row.paymentIds.flatMap((id) => {
      const payment = byId.get(id)
      return payment ? [payment] : []
    })
    return {
      id: row.id,
      number: row.number,
      status: row.status,
      collectorPersonId: row.collectorPersonId,
      collector: nameOf(row.collectorPersonId),
      receivedBy: nameOf(row.receivedByPersonId),
      decidedBy: nameOf(row.decidedByPersonId),
      sentByCollector: Boolean(row.startedByPersonId),
      amount: row.amount,
      paymentCount: row.paymentIds.length,
      receiptNumbers: [...new Set(own.map((payment) => payment.receiptNumber as string))].sort(),
      payments: own.map((payment) => ({
        paymentId: payment.id,
        receiptNumber: payment.receiptNumber as string,
        amount: payment.amount,
        payer: nameOf(charges.get(payment.chargeId)?.payerPersonId ?? null),
      })),
      rejectionReason: row.rejectionReason ?? null,
      sentAt: row.sentAt ? row.sentAt.toISOString() : null,
      decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
    }
  })
}

/**
 * The club's cash handovers, newest first, with who handed over and who received, and the receipts they settled; with
 * `status`, only those (the pending ones oldest sent first: the confirmers' queue, D-042).
 */
export async function cashHandoverHistory(
  container: AwilixContainer,
  scope: PaymentsScope,
  page: number,
  pageSize: number,
  status?: CashHandoverStatus,
): Promise<{ items: HandoverRow[]; total: number; page: number; pageSize: number; totalPages: number }> {
  const em = freshEm(container)
  const where = { ...scope, deletedAt: null, ...(status ? { status } : {}) }
  // The rejection reason is encrypted at rest (`encryption.ts`), so the rows are read with decryption.
  const [rows, total] = await Promise.all([
    findWithDecryption(
      em,
      CashHandover,
      where,
      {
        orderBy: status === 'pending' ? { sentAt: 'asc', id: 'asc' } : { createdAt: 'desc', id: 'desc' },
        limit: pageSize,
        offset: (page - 1) * pageSize,
      },
      scope,
    ),
    em.count(CashHandover, where),
  ])
  return {
    items: await handoverRows(container, em, scope, rows),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  }
}

/** How many decided handovers the collector sees next to the pending ones. */
const RECENT_DECIDED = 5

export type HeldCashPayment = {
  paymentId: string
  receiptNumber: string
  paidOn: string
  amount: number
  description: string
  payer: PersonName | null
  /** The pending handover that reserves it, or null when it may be sent. */
  pendingHandoverId: string | null
}

/**
 * The collector's own cash (M-18 "Hand over cash", D-042): the live cash payments with a receipt they hold, oldest
 * first, each with the pending handover that reserves it; and their handovers — every pending one and the latest
 * decided ones (a rejection with its reason), newest first.
 */
export async function collectorHandovers(
  container: AwilixContainer,
  scope: PaymentsScope,
  personId: string | null,
): Promise<{ held: HeldCashPayment[]; total: number; handovers: HandoverRow[] }> {
  if (!personId) return { held: [], total: 0, handovers: [] }
  const em = freshEm(container)
  const payments = await em.find(
    Payment,
    {
      ...scope,
      deletedAt: null,
      method: 'cash',
      collectedByPersonId: personId,
      receiptNumber: { $ne: null },
      reversesPaymentId: null,
      cashHandoverId: null,
    },
    { orderBy: { paidOn: 'asc', createdAt: 'asc', id: 'asc' } },
  )
  const reversals = payments.length
    ? await em.find(
        Payment,
        { ...scope, deletedAt: null, reversesPaymentId: { $in: payments.map((row) => row.id) } },
        { fields: ['id', 'reversesPaymentId'] },
      )
    : []
  const reversed = new Set(reversals.map((row) => row.reversesPaymentId as string))
  const live = payments.filter((row) => !reversed.has(row.id))
  const charges = await receiptCharges(
    container,
    scope,
    live.map((row) => row.chargeId),
  )
  const persons = await findPersons(
    container,
    scope,
    [...charges.values()].flatMap((charge) => (charge.payerPersonId ? [charge.payerPersonId] : [])),
    em,
  )
  const [pending, decided] = await Promise.all([
    findWithDecryption(
      em,
      CashHandover,
      { ...scope, deletedAt: null, collectorPersonId: personId, status: 'pending' as const },
      { orderBy: { sentAt: 'desc', id: 'desc' } },
      scope,
    ),
    findWithDecryption(
      em,
      CashHandover,
      { ...scope, deletedAt: null, collectorPersonId: personId, status: { $ne: 'pending' as const } },
      { orderBy: { updatedAt: 'desc', id: 'desc' }, limit: RECENT_DECIDED },
      scope,
    ),
  ])
  return {
    held: live.map((row) => {
      const charge = charges.get(row.chargeId)
      const payer = charge?.payerPersonId ? persons.get(charge.payerPersonId) : undefined
      return {
        paymentId: row.id,
        receiptNumber: row.receiptNumber as string,
        paidOn: calendarDate(row.paidOn),
        amount: row.amount,
        description: charge?.description ?? '',
        payer: payer ? { firstName: payer.firstName, lastName: payer.lastName } : null,
        pendingHandoverId: row.pendingCashHandoverId ?? null,
      }
    }),
    total: live.reduce((sum, row) => sum + row.amount, 0),
    handovers: await handoverRows(container, em, scope, [...pending, ...decided]),
  }
}
