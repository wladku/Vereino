// Phase 4 step 5 reads (payments spec *Domain Vocabulary* → Payer code; REQ-012, REQ-030; issue #111 E07-S04):
// - the payer code `GW-XXXX` from `payments_payer_refs`, assigned on first use under the two unique indexes (a
//   concurrent assignment for the same person wins and is read back; a code another payer holds is drawn again);
// - the payer's Today summary (open total, nearest due date, "Everything is paid", "The guardian pays", and since
//   #298 "{child}: paid by {first name}" when another guardian is a ward's primary payer, DD-C06);
// - the transfer instructions of M-08: the club's account (`club_core`'s settings) and name, and the payer code;
// - the B-01 widgets "Overdue" (remaining total, charges, families) and "Charges without a payer".
// Routes reach the ORM only through services (REQ-F16).
import type { EntityManager } from '@mikro-orm/postgresql'
import { UniqueConstraintViolationException } from '@mikro-orm/core'
import type { AwilixContainer } from 'awilix'
import type { ClubCoreSettingsService } from '../../club_core/services/settings'
import { Charge, PayerRef } from '../data/entities'
import { OPEN_CHARGE_STATUSES, amountDueOf, remainingOf } from '../lib/charge-ledger'
import {
  generatePayerCode,
  otherPayersOf,
  overdueSummary,
  ownPaymentsSummary,
  type OtherPayer,
  type OwnPaymentsSummary,
} from '../lib/payer-summary'
import type { Payer } from './checkout'
import { clubClock, findPersons, primaryPayers, type PaymentsScope } from './directory'
import { paidTotals } from './ledger'

/** Draws before giving up: 32⁴ codes per club make a second collision in a row practically impossible. */
const PAYER_CODE_ATTEMPTS = 8

const CLUB_CORE_SETTINGS = 'clubCoreSettings'

function freshEm(container: AwilixContainer): EntityManager {
  return container.resolve<EntityManager>('em').fork()
}

function calendarDate(value: unknown): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10)
}

function isUniqueViolation(error: unknown): boolean {
  if (error instanceof UniqueConstraintViolationException) return true
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === '23505'
}

async function storedPayerCode(container: AwilixContainer, scope: PaymentsScope, personId: string) {
  const row = await freshEm(container).findOne(
    PayerRef,
    { ...scope, personId, deletedAt: null },
    { fields: ['id', 'code'] },
  )
  return row?.code ?? null
}

/** The person's payer code, assigned now when they have none yet; it never changes afterwards. */
export async function ensurePayerCode(
  container: AwilixContainer,
  scope: PaymentsScope,
  personId: string,
  random: () => number = Math.random,
): Promise<string> {
  const existing = await storedPayerCode(container, scope, personId)
  if (existing) return existing
  for (let attempt = 0; attempt < PAYER_CODE_ATTEMPTS; attempt += 1) {
    const em = freshEm(container)
    const code = generatePayerCode(random)
    try {
      em.create(PayerRef, { ...scope, personId, code })
      await em.flush()
      return code
    } catch (error: unknown) {
      if (!isUniqueViolation(error)) throw error
      // Either a concurrent request assigned this person's code (read it back) or the code is taken (draw again).
      const assigned = await storedPayerCode(container, scope, personId)
      if (assigned) return assigned
    }
  }
  throw new Error('[internal] payments: no free payer code within the attempts')
}

/** The live charges the caller pays or owes themself, with what remains of each. */
async function ownCharges(container: AwilixContainer, payer: Payer) {
  const em = freshEm(container)
  const rows = await em.find(
    Charge,
    {
      ...payer.scope,
      deletedAt: null,
      // A rental charge is paid to the facility owner, not to the club (#291).
      sourceType: { $ne: 'rental' as const },
      status: { $ne: 'cancelled' as const },
      $or: [{ payerPersonId: payer.personId }, { personId: payer.personId }],
    },
    { fields: ['id', 'status', 'dueDate', 'amount', 'discountAmount', 'payerPersonId', 'personId'] },
  )
  const paid = await paidTotals(
    container,
    payer.scope,
    rows.map((row) => row.id),
  )
  return rows.map((row) => ({
    status: row.status,
    dueDate: calendarDate(row.dueDate),
    remaining: remainingOf(amountDueOf(row), paid.get(row.id) ?? 0),
    payerPersonId: row.payerPersonId ?? null,
    personId: row.personId ?? null,
  }))
}

/**
 * The caller's wards whose primary payer today is another person (DD-C06, `people.personDirectory.primaryPayers`):
 * first names only — the other guardian's amounts and discounts never reach this caller.
 */
export async function otherPayers(container: AwilixContainer, payer: Payer): Promise<OtherPayer[]> {
  if (payer.wardIds.length === 0) return []
  const { today } = await clubClock(container, payer.scope)
  const payers = await primaryPayers(container, payer.scope, payer.wardIds, today)
  const others = [...payers.entries()].filter(([, payerId]) => payerId !== payer.personId)
  if (others.length === 0) return []
  const persons = await findPersons(container, payer.scope, others.flat())
  const firstNames = new Map([...persons.entries()].map(([id, person]) => [id, person.firstName]))
  return otherPayersOf(payer.personId, payer.wardIds, payers, firstNames)
}

/**
 * The Today tile of `/club` (M-02): what the caller owes, or that everything is paid, or that the guardian pays, or
 * who pays a ward (DD-C06).
 */
export async function myPaymentsSummary(container: AwilixContainer, payer: Payer): Promise<OwnPaymentsSummary> {
  const [charges, clock, others] = await Promise.all([
    ownCharges(container, payer),
    clubClock(container, payer.scope),
    otherPayers(container, payer),
  ])
  return ownPaymentsSummary(payer.personId, charges, clock.today, others)
}

export type TransferInstructions = {
  /** The club's account (26 digits), or null while the club has not set one. */
  bankAccount: string | null
  recipient: string | null
  payerCode: string
}

/**
 * True when the caller pays at least one live charge to the club (only a payer gets a payer code and transfer
 * instructions); a rental charge goes to the facility owner and does not count (#291).
 */
export async function isPayer(container: AwilixContainer, payer: Payer): Promise<boolean> {
  const count = await freshEm(container).count(Charge, {
    ...payer.scope,
    deletedAt: null,
    sourceType: { $ne: 'rental' as const },
    status: { $ne: 'cancelled' as const },
    payerPersonId: payer.personId,
  })
  return count > 0
}

/** M-08's transfer instructions; null for someone who pays no charge. */
export async function transferInstructions(
  container: AwilixContainer,
  payer: Payer,
): Promise<TransferInstructions | null> {
  if (!(await isPayer(container, payer))) return null
  const settings = container.resolve<ClubCoreSettingsService>(CLUB_CORE_SETTINGS)
  const [payerCode, snapshot, clubName] = await Promise.all([
    ensurePayerCode(container, payer.scope, payer.personId),
    settings.get(payer.scope),
    settings.organizationName(payer.scope),
  ])
  return {
    bankAccount: snapshot.publicSettings.bankAccount,
    recipient: snapshot.values.shortName ?? clubName,
    payerCode,
  }
}

export type PaymentsDashboard = {
  overdue: { total: number; charges: number; families: number }
  withoutPayer: { charges: number }
}

/** The B-01 widgets "Overdue" and "Charges without a payer" for the club. */
export async function paymentsDashboard(container: AwilixContainer, scope: PaymentsScope): Promise<PaymentsDashboard> {
  const em = freshEm(container)
  const { today } = await clubClock(container, scope)
  const open = { ...scope, deletedAt: null, status: { $in: [...OPEN_CHARGE_STATUSES] } }
  const [overdueRows, withoutPayer] = await Promise.all([
    em.find(
      Charge,
      { ...open, dueDate: { $lt: today } },
      { fields: ['id', 'amount', 'discountAmount', 'payerPersonId'] },
    ),
    em.count(Charge, { ...open, payerMissing: true }),
  ])
  const paid = await paidTotals(
    container,
    scope,
    overdueRows.map((row) => row.id),
  )
  return {
    overdue: overdueSummary(
      overdueRows.map((row) => ({
        payerPersonId: row.payerPersonId ?? null,
        remaining: remainingOf(amountDueOf(row), paid.get(row.id) ?? 0),
      })),
    ),
    withoutPayer: { charges: withoutPayer },
  }
}
