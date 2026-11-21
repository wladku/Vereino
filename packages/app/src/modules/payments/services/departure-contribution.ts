// The `payments` departure contributor (people life-cycle spec REQ-L04, DD-L04, DD-L07, Q-L05, the `payments` row of
// the contributor table; phase L5, #307): `people` declares the contract (`people/services/departure.ts`) and reads it
// with `hasRegistration`; `payments` registers it in `di.ts` under `people.departure.payments`.
// - preview: the cash a leaving person still holds (their live cash payments with a receipt in no handover, as B-33
//   "Cash to settle" counts them) is a blocker with the amount — it clears only when the cash is accepted on B-33, with
//   no "settled outside" override (Q-L05); the open charges naming them as debtor or payer are a warning;
// - apply and undo change nothing; after the commit nothing is emitted;
// - `retentionHoldUntil` gives phase L6 the last day a name must be kept for a booked payment (DD-L07);
// - `erase` (S9.6, #528), in the anonymisation's transaction: the orders the person placed lose the contact e-mail,
//   phone and notes, the orders for them as participant lose the print name and notes, and the charges naming them
//   as debtor or payer lose a typed payer label. Amounts, payments, receipts and payer reference codes stay: they are
//   accounting records (retention schedule R1).
// Reads use the caller's EntityManager, one query at a time (it may be the departure's transaction).
import type { EntityManager } from '@mikro-orm/postgresql'
import type { DepartureContributor, DepartureNotice } from '../../people/services/departure'
import { Charge, Order, Payment } from '../data/entities'
import { custodyByCollector } from '../lib/cash-handovers'
import { OPEN_CHARGE_STATUSES } from '../lib/charge-ledger'
import { openChargesByPerson, retentionHoldUntil } from '../lib/departure'

/** The token `people` reads (`departureContributorToken('payments')` in `people/services/departure.ts`). */
export const PAYMENTS_DEPARTURE_CONTRIBUTOR = 'people.departure.payments'

type Scope = { tenantId: string; organizationId: string }

function calendarDate(value: unknown): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10)
}

/** The cash each of `personIds` still holds (B-33's rule: live, unreversed cash with a receipt and no handover). */
async function cashHeld(em: EntityManager, scope: Scope, personIds: readonly string[]) {
  const payments = await em.find(Payment, {
    ...scope,
    deletedAt: null,
    method: 'cash',
    collectedByPersonId: { $in: [...personIds] },
    receiptNumber: { $ne: null },
    reversesPaymentId: null,
    cashHandoverId: null,
  })
  if (payments.length === 0) return []
  const reversals = await em.find(
    Payment,
    { ...scope, deletedAt: null, reversesPaymentId: { $in: payments.map((row) => row.id) } },
    { fields: ['id', 'reversesPaymentId'] },
  )
  return custodyByCollector(
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
  ).items
}

/** The accounting records an anonymisation keeps (retention schedule R1); they hold the person id, never contacts. */
export const PAYMENTS_KEPT_ON_ERASURE = {
  category: 'accounting_records',
  basis: 'GDPR art. 6(1)(c); Accounting Act (ustawa o rachunkowości) art. 74; Tax Ordinance art. 86',
  retention: 'R1',
  tables: [
    'payments_charges',
    'payments_payments',
    'payments_cash_handovers',
    'payments_payer_refs',
    'payments_checkouts',
    'payments_bank_transactions',
    'payments_orders',
  ],
}

export const departureContribution: DepartureContributor = {
  async preview(em, subject) {
    const scope = { tenantId: subject.tenantId, organizationId: subject.organizationId }
    const blockers: DepartureNotice[] = (await cashHeld(em, scope, subject.personIds)).map((held) => ({
      module: 'payments',
      code: 'cash_held',
      personId: held.collectorPersonId,
      params: { amount: held.total, payments: held.payments.length, oldestPaidOn: held.oldestPaidOn },
    }))
    const charges = await em.find(
      Charge,
      {
        ...scope,
        deletedAt: null,
        status: { $in: [...OPEN_CHARGE_STATUSES] },
        $or: [{ personId: { $in: [...subject.personIds] } }, { payerPersonId: { $in: [...subject.personIds] } }],
      },
      { fields: ['id', 'personId', 'payerPersonId'], orderBy: { createdAt: 'asc' } },
    )
    const facts = charges.map((row) => ({
      id: row.id,
      personId: row.personId ?? null,
      payerPersonId: row.payerPersonId ?? null,
    }))
    // `recordId` is the person's oldest open charge: the erasure's refusal links to it (phase L6, #308).
    const warnings: DepartureNotice[] = [...openChargesByPerson(facts, subject.personIds).entries()].map(
      ([personId, count]) => ({
        module: 'payments',
        code: 'open_charges',
        personId,
        recordId: facts.find((charge) => charge.personId === personId || charge.payerPersonId === personId)?.id,
        params: { count },
      }),
    )
    return { items: [], warnings, blockers }
  },

  apply() {
    return Promise.resolve({ snapshot: null, changes: [] })
  },

  undo() {
    return Promise.resolve([])
  },

  async afterCommit() {},

  async hasHistory(em, subject) {
    const scope = { tenantId: subject.tenantId, organizationId: subject.organizationId }
    const charges = await em.count(Charge, {
      ...scope,
      $or: [{ personId: subject.personId }, { payerPersonId: subject.personId }],
    })
    if (charges > 0) return true
    const payments = await em.count(Payment, {
      ...scope,
      $or: [{ collectedByPersonId: subject.personId }, { recordedByPersonId: subject.personId }],
    })
    return payments > 0
  },

  async retentionHoldUntil(em, subject) {
    const scope = { tenantId: subject.tenantId, organizationId: subject.organizationId }
    const charges = await em.find(
      Charge,
      { ...scope, $or: [{ personId: subject.personId }, { payerPersonId: subject.personId }] },
      { fields: ['id'] },
    )
    if (charges.length === 0) return null
    const latest = await em.find(
      Payment,
      { ...scope, deletedAt: null, chargeId: { $in: charges.map((row) => row.id) } },
      { fields: ['id', 'paidOn'], orderBy: { paidOn: 'desc' }, limit: 1 },
    )
    return retentionHoldUntil(latest[0] ? calendarDate(latest[0].paidOn) : null)
  },

  async erase(em, subject) {
    const scope = { tenantId: subject.tenantId, organizationId: subject.organizationId }
    const now = new Date()
    const idsOf = async (where: Record<string, unknown>) =>
      (await em.find(Order, { ...scope, ...where }, { fields: ['id'] })).map((row) => row.id)
    // An order the person placed for themself is in both lists; the audit counts it once.
    const placed = await idsOf({
      orderedByPersonId: subject.personId,
      $or: [{ contactEmail: { $ne: null } }, { contactPhone: { $ne: null } }, { notes: { $ne: null } }],
    })
    const forThem = await idsOf({
      participantPersonId: subject.personId,
      $or: [{ printName: { $ne: null } }, { notes: { $ne: null } }],
    })
    if (placed.length > 0) {
      await em.nativeUpdate(
        Order,
        { ...scope, id: { $in: placed } },
        { contactEmail: null, contactPhone: null, notes: null, updatedAt: now },
      )
    }
    if (forThem.length > 0) {
      await em.nativeUpdate(Order, { ...scope, id: { $in: forThem } }, { printName: null, notes: null, updatedAt: now })
    }
    const labelled = await em.nativeUpdate(
      Charge,
      {
        ...scope,
        payerLabel: { $ne: null },
        $or: [{ personId: subject.personId }, { payerPersonId: subject.personId }],
      },
      { payerLabel: null, updatedAt: now },
    )
    return {
      touched: [
        { table: 'payments_orders', rows: new Set([...placed, ...forThem]).size },
        { table: 'payments_charges', rows: labelled },
      ],
      kept: [PAYMENTS_KEPT_ON_ERASURE],
    }
  },
}
