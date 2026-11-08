// The statement reconciliation's reads (issue #113 E07-S06; REQ-030, B-29; foundation spec REQ-F16: commands and
// routes reach the ORM only through services):
// - inside a write transaction (the club's statement lock held): the club's payers with charges still to pay, each
//   with their code, surnames and charges, the charges row-locked; one payer's open charges; the fingerprints already
//   stored; the payments a recorded transfer still holds;
// - for the routes: the transfers by status with their counts, payers, codes and charges; the import history.
import { LockMode } from '@mikro-orm/core'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { BankImport, BankTransaction, Charge, PayerRef, Payment } from '../data/entities'
import { OPEN_CHARGE_STATUSES, amountDueOf, paidTotal, remainingOf } from '../lib/charge-ledger'
import {
  BANK_TRANSACTION_STATUSES,
  type BankTransactionStatus,
  type OpenCharge,
  type PayerCandidate,
} from '../lib/bank-matching'
import { findPersons, type PaymentsScope } from './directory'
import { chargeDescriptions } from './ledger'

function freshEm(container: AwilixContainer): EntityManager {
  return container.resolve<EntityManager>('em').fork()
}

function calendarDate(value: unknown): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10)
}

/** Open charges as the allocation reads them, with what remains after the payments recorded on them. */
async function openChargesOf(
  em: EntityManager,
  scope: PaymentsScope,
  charges: readonly Charge[],
): Promise<OpenCharge[]> {
  if (charges.length === 0) return []
  const ledger = await em.find(
    Payment,
    { ...scope, chargeId: { $in: charges.map((charge) => charge.id) }, isOverpayment: false, deletedAt: null },
    { fields: ['id', 'chargeId', 'amount'] },
  )
  return charges
    .map((charge) => ({
      id: charge.id,
      status: charge.status,
      dueDate: calendarDate(charge.dueDate),
      createdAt: charge.createdAt.toISOString(),
      remaining: remainingOf(amountDueOf(charge), paidTotal(ledger.filter((row) => row.chargeId === charge.id))),
    }))
    .filter((charge) => charge.remaining > 0)
}

/** The club's live charges with a payer that are still to pay, row-locked in id order (one payer's when given). */
export function lockOpenCharges(em: EntityManager, scope: PaymentsScope, payerPersonId?: string): Promise<Charge[]> {
  return em.find(
    Charge,
    {
      ...scope,
      deletedAt: null,
      status: { $in: [...OPEN_CHARGE_STATUSES] },
      payerPersonId: payerPersonId ?? { $ne: null },
    },
    { lockMode: LockMode.PESSIMISTIC_WRITE, orderBy: { id: 'asc' } },
  )
}

/** One payer's charges still to pay (row-locked), as the allocation reads them. */
export async function payerOpenCharges(
  em: EntityManager,
  scope: PaymentsScope,
  payerPersonId: string,
): Promise<{ charges: Charge[]; open: OpenCharge[] }> {
  const charges = await lockOpenCharges(em, scope, payerPersonId)
  return { charges, open: await openChargesOf(em, scope, charges) }
}

/**
 * Every payer with charges still to pay: their code (when assigned), their surname and their wards' (the debtors of
 * their charges), and the charges — row-locked, so the import's allocation cannot race a payment.
 */
export async function payerCandidates(
  container: AwilixContainer,
  em: EntityManager,
  scope: PaymentsScope,
): Promise<{ payers: PayerCandidate[]; charges: Map<string, Charge> }> {
  const charges = await lockOpenCharges(em, scope)
  const open = await openChargesOf(em, scope, charges)
  const byId = new Map(charges.map((charge) => [charge.id, charge]))
  const payerIds = [...new Set(charges.map((charge) => charge.payerPersonId as string))]
  if (payerIds.length === 0) return { payers: [], charges: byId }
  const [refs, persons] = await Promise.all([
    em.find(
      PayerRef,
      { ...scope, personId: { $in: payerIds }, deletedAt: null },
      { fields: ['id', 'personId', 'code'] },
    ),
    findPersons(
      container,
      scope,
      [...new Set([...payerIds, ...charges.flatMap((charge) => (charge.personId ? [charge.personId] : []))])],
      em,
    ),
  ])
  const codes = new Map(refs.map((ref) => [ref.personId, ref.code]))
  const payers = payerIds.map((personId): PayerCandidate => {
    const own = charges.filter((charge) => charge.payerPersonId === personId)
    const surnames = new Set<string>()
    for (const id of [personId, ...own.map((charge) => charge.personId)]) {
      const surname = id ? persons.get(id)?.lastName : undefined
      if (surname) surnames.add(surname)
    }
    const ownIds = new Set(own.map((charge) => charge.id))
    return {
      personId,
      code: codes.get(personId) ?? null,
      surnames: [...surnames],
      charges: open.filter((charge) => ownIds.has(charge.id)),
    }
  })
  return { payers, charges: byId }
}

/** The fingerprints among `hashes` the club already stored. */
export async function storedHashes(
  em: EntityManager,
  scope: PaymentsScope,
  hashes: readonly string[],
): Promise<Set<string>> {
  if (hashes.length === 0) return new Set()
  const rows = await em.find(
    BankTransaction,
    { ...scope, txHash: { $in: [...new Set(hashes)] } },
    { fields: ['id', 'txHash'] },
  )
  return new Set(rows.map((row) => row.txHash))
}

/** The payments a recorded transfer still holds: its own, less those a reversing entry cancelled. */
export async function livePaymentsOf(em: EntityManager, transfer: BankTransaction): Promise<Payment[]> {
  const scope = { tenantId: transfer.tenantId, organizationId: transfer.organizationId }
  const rows = await em.find(Payment, { ...scope, bankTransactionId: transfer.id, deletedAt: null })
  const originals = rows.filter((row) => row.reversesPaymentId == null)
  if (originals.length === 0) return []
  const reversals = await em.find(
    Payment,
    { ...scope, reversesPaymentId: { $in: originals.map((row) => row.id) }, deletedAt: null },
    { fields: ['id', 'reversesPaymentId'] },
  )
  const reversed = new Set(reversals.map((row) => row.reversesPaymentId))
  return originals.filter((row) => !reversed.has(row.id))
}

// --- Route reads ---

type PersonName = { firstName: string; lastName: string }

export type BankTransactionItem = {
  id: string
  importId: string
  line: number
  bookedOn: string
  amount: number
  counterpartyName: string | null
  counterpartyAccount: string | null
  title: string
  status: BankTransactionStatus
  payerPersonId: string | null
  payer: PersonName | null
  payerCode: string | null
  allocation: { chargeId: string; amount: number; description: string | null }[]
  unallocated: number
  matchReason: string
  autoBooked: boolean
  skipReason: string | null
  skipNote: string | null
  decidedAt: string | null
  createdAt: string
  updatedAt: string
}

/** How many of the club's transfers are in each status (the perspectives' counts), and all of them. */
export async function transferCounts(
  container: AwilixContainer,
  scope: PaymentsScope,
): Promise<Record<BankTransactionStatus | 'all', number>> {
  const em = freshEm(container)
  const counts = { all: 0 } as Record<BankTransactionStatus | 'all', number>
  for (const status of BANK_TRANSACTION_STATUSES) {
    counts[status] = await em.count(BankTransaction, { ...scope, status, deletedAt: null })
    counts.all += counts[status]
  }
  return counts
}

/** The club's transfers, newest booking first, with payers, codes and the charges they pay. */
export async function listTransfers(
  container: AwilixContainer,
  scope: PaymentsScope,
  query: { status?: BankTransactionStatus; importId?: string; page: number; pageSize: number },
): Promise<{ items: BankTransactionItem[]; total: number }> {
  const em = freshEm(container)
  const where = {
    ...scope,
    deletedAt: null,
    ...(query.status ? { status: query.status } : {}),
    ...(query.importId ? { importId: query.importId } : {}),
  }
  const total = await em.count(BankTransaction, where)
  const rows = await findWithDecryption(
    em,
    BankTransaction,
    where,
    {
      orderBy: { bookedOn: 'desc', createdAt: 'desc', line: 'asc' },
      limit: query.pageSize,
      offset: (query.page - 1) * query.pageSize,
    },
    scope,
  )
  const payerIds = [...new Set(rows.flatMap((row) => (row.payerPersonId ? [row.payerPersonId] : [])))]
  const [persons, refs, descriptions] = await Promise.all([
    findPersons(container, scope, payerIds),
    payerIds.length
      ? em.find(
          PayerRef,
          { ...scope, personId: { $in: payerIds }, deletedAt: null },
          { fields: ['id', 'personId', 'code'] },
        )
      : Promise.resolve([] as PayerRef[]),
    chargeDescriptions(container, scope, [
      ...new Set(rows.flatMap((row) => row.allocation.map((line) => line.chargeId))),
    ]),
  ])
  const codes = new Map(refs.map((ref) => [ref.personId, ref.code]))
  const items = rows.map((row): BankTransactionItem => {
    const person = row.payerPersonId ? persons.get(row.payerPersonId) : undefined
    const allocated = row.allocation.reduce((sum, line) => sum + line.amount, 0)
    return {
      id: row.id,
      importId: row.importId,
      line: row.line,
      bookedOn: calendarDate(row.bookedOn),
      amount: row.amount,
      counterpartyName: row.counterpartyName ?? null,
      counterpartyAccount: row.counterpartyAccount ?? null,
      title: row.title,
      status: row.status,
      payerPersonId: row.payerPersonId ?? null,
      payer: person ? { firstName: person.firstName, lastName: person.lastName } : null,
      payerCode: row.payerPersonId ? (codes.get(row.payerPersonId) ?? null) : null,
      allocation: row.allocation.map((line) => ({ ...line, description: descriptions.get(line.chargeId) ?? null })),
      unallocated: row.allocation.length > 0 ? Math.max(0, row.amount - allocated) : 0,
      matchReason: row.matchReason,
      autoBooked: row.autoBooked,
      skipReason: row.skipReason ?? null,
      skipNote: row.skipNote ?? null,
      decidedAt: row.decidedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  })
  return { items, total }
}

export type BankImportItem = {
  id: string
  fileName: string
  format: string
  total: number
  booked: number
  suggested: number
  unmatched: number
  skipped: number
  importedBy: PersonName | null
  createdAt: string
}

/** The club's imports, newest first, with who imported each. */
export async function listImports(
  container: AwilixContainer,
  scope: PaymentsScope,
  query: { page: number; pageSize: number },
): Promise<{ items: BankImportItem[]; total: number }> {
  const em = freshEm(container)
  const where = { ...scope, deletedAt: null }
  const [rows, total] = await em.findAndCount(BankImport, where, {
    orderBy: { createdAt: 'desc', id: 'desc' },
    limit: query.pageSize,
    offset: (query.page - 1) * query.pageSize,
  })
  const persons = await findPersons(
    container,
    scope,
    rows.flatMap((row) => (row.importedByPersonId ? [row.importedByPersonId] : [])),
  )
  return {
    total,
    items: rows.map((row) => {
      const person = row.importedByPersonId ? persons.get(row.importedByPersonId) : undefined
      return {
        id: row.id,
        fileName: row.fileName,
        format: row.format,
        total: row.total,
        booked: row.booked,
        suggested: row.suggested,
        unmatched: row.unmatched,
        skipped: row.skipped,
        importedBy: person ? { firstName: person.firstName, lastName: person.lastName } : null,
        createdAt: row.createdAt.toISOString(),
      }
    }),
  }
}
