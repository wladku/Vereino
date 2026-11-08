// Pure rules of the statement reconciliation, phase 4 step 7 (payments spec *Domain Vocabulary* → Transfer matching;
// REQ-030, TEST-042; issue #113 E07-S06; B-29). Each incoming transfer of an imported statement is matched to a payer:
//
// 1. a payer code `GW-XXXX` in the title or the sender names the payer. An amount that pays whole open charges of
//    theirs, oldest first (all of them, or the oldest few), is recorded (`booked`) — automatically when the club's
//    "Automatically record confident matches" is on, otherwise it waits in "To confirm" (`suggested`). An overpayment
//    or an underpayment waits in "To confirm" with its reason;
// 2. without a known code, exactly one payer whose surname — or a ward's — appears as a whole word in the sender or
//    the title, with an amount that pays whole open charges of theirs, waits in "To confirm";
// 3. anything else is "Unmatched": the treasurer assigns a payer or skips it (a donation, a grant, a refund, other).
//
// A debit (money leaving the account) and a transfer already imported (the same date, amount, sender, title and
// account) are skipped and not stored. Undo of a recorded transfer returns it to "To confirm"; Restore returns a
// skipped one to "Unmatched" (Q1 on #113). Nothing here reads the database (engineering standards S3.5).
import { createHash } from 'node:crypto'
import { MAX_REASON_LENGTH } from './charge-ledger'
import { allocateCash, oldestFirst, selectedTotal, type CashAllocation, type CashCharge } from './cash'
import { PAYER_CODE_ALPHABET, PAYER_CODE_LENGTH, PAYER_CODE_PREFIX } from './payer-summary'
import { foldText, type StatementEntry } from './bank-statement'

export const BANK_TRANSACTION_STATUSES = ['booked', 'suggested', 'unmatched', 'ignored'] as const
export type BankTransactionStatus = (typeof BANK_TRANSACTION_STATUSES)[number]

/** The B-29 perspectives: To confirm (the default), Unmatched, Recorded, Skipped and All. */
export const BANK_PERSPECTIVES = ['suggested', 'unmatched', 'booked', 'ignored', 'all'] as const
export type BankPerspective = (typeof BANK_PERSPECTIVES)[number]
export const DEFAULT_BANK_PERSPECTIVE: BankPerspective = 'suggested'

/** Why the treasurer skips a transfer. */
export const BANK_SKIP_REASONS = ['donation', 'grant', 'refund', 'other'] as const
export type BankSkipReason = (typeof BANK_SKIP_REASONS)[number]

/** The longest note kept with a skip. */
export const MAX_SKIP_NOTE_LENGTH = MAX_REASON_LENGTH

export const MATCH_REASONS = [
  'code_exact',
  'code_overpayment',
  'code_underpayment',
  'code_no_open_charges',
  'code_ambiguous',
  'surname_amount',
  'no_match',
  'assigned',
] as const
export type MatchReason = (typeof MATCH_REASONS)[number]

export const BANK_ACTIONS = ['confirm', 'assign', 'ignore', 'restore', 'undo'] as const
export type BankAction = (typeof BANK_ACTIONS)[number]

/** The statuses each action starts from; any other status answers 409 (the item changed meanwhile). */
const ACTION_FROM: Record<BankAction, readonly BankTransactionStatus[]> = {
  confirm: ['suggested'],
  assign: ['suggested', 'unmatched'],
  ignore: ['suggested', 'unmatched'],
  restore: ['ignored'],
  undo: ['booked'],
}

/** True when `action` may be taken on a transfer in `status`. */
export function actionAllowed(action: BankAction, status: BankTransactionStatus): boolean {
  return ACTION_FROM[action].includes(status)
}

/** The actions B-29 offers on a transfer in `status` (Confirm only with a proposed payer). */
export function actionsFor(status: BankTransactionStatus, hasPayer: boolean): BankAction[] {
  return BANK_ACTIONS.filter((action) => actionAllowed(action, status) && (action !== 'confirm' || hasPayer))
}

/** The status filter of a perspective; null for All. */
export function perspectiveStatus(perspective: BankPerspective): BankTransactionStatus | null {
  return perspective === 'all' ? null : perspective
}

// --- Identity of a transfer ---

/**
 * The fingerprint of a transfer within the club: SHA-256 of the organization and the folded date, amount, sender,
 * title and account. The same line imported again (or the same statement twice) has the same fingerprint.
 */
export function transferHash(
  organizationId: string,
  entry: Pick<StatementEntry, 'bookedOn' | 'amount' | 'counterpartyName' | 'title' | 'counterpartyAccount'>,
): string {
  const parts = [
    organizationId,
    entry.bookedOn,
    String(entry.amount),
    foldText(entry.counterpartyName),
    foldText(entry.title),
    entry.counterpartyAccount.replace(/\D/g, ''),
  ]
  return createHash('sha256').update(parts.join('\u001f')).digest('hex')
}

export type ImportPlan<T> = {
  /** The entries to match and store, in file order. */
  fresh: (T & { hash: string })[]
  debits: number
  duplicates: number
}

/**
 * Splits the statement's entries: debits (zero or negative amounts) are skipped, then duplicates — a fingerprint
 * already stored for the club or met earlier in the same file; the rest are fresh.
 */
export function planImport<T extends Parameters<typeof transferHash>[1]>(
  organizationId: string,
  entries: readonly T[],
  known: ReadonlySet<string>,
): ImportPlan<T> {
  const seen = new Set(known)
  const plan: ImportPlan<T> = { fresh: [], debits: 0, duplicates: 0 }
  for (const entry of entries) {
    if (entry.amount <= 0) {
      plan.debits += 1
      continue
    }
    const hash = transferHash(organizationId, entry)
    if (seen.has(hash)) {
      plan.duplicates += 1
      continue
    }
    seen.add(hash)
    plan.fresh.push({ ...entry, hash })
  }
  return plan
}

// --- Words and codes ---

const CODE_PATTERN = new RegExp(
  `(?:^|[^A-Z0-9])${PAYER_CODE_PREFIX.replace('-', '')}[-\\s]?([${PAYER_CODE_ALPHABET}]{${String(PAYER_CODE_LENGTH)}})(?![A-Z0-9])`,
  'g',
)

/** The payer codes in a text (upper-cased; `gw-7k2m`, `GW 7K2M` and `GW7K2M` read as `GW-7K2M`), each once. */
export function findPayerCodes(text: string): string[] {
  const codes = new Set<string>()
  for (const match of text.toUpperCase().matchAll(CODE_PATTERN)) codes.add(`${PAYER_CODE_PREFIX}${match[1]}`)
  return [...codes]
}

/** True when every word of `phrase` appears, in order and adjacent, as whole words of `text` (folded). */
export function containsWords(text: string, phrase: string): boolean {
  const wanted = foldText(phrase)
  if (!wanted) return false
  return ` ${foldText(text)} `.includes(` ${wanted} `)
}

// --- Allocation ---

export type OpenCharge = CashCharge

/** True when `amount` pays exactly the oldest one or more of the charges (all of them included). */
export function paysWholeCharges(charges: readonly OpenCharge[], amount: number): boolean {
  let sum = 0
  for (const charge of oldestFirst(charges)) {
    sum += charge.remaining
    if (sum === amount) return true
    if (sum > amount) return false
  }
  return false
}

/** The amount spread over the charges oldest first, and what is left over once they are all paid. */
export function allocateTransfer(
  charges: readonly OpenCharge[],
  amount: number,
): { allocation: CashAllocation[]; unallocated: number } {
  const allocation = allocateCash(charges, amount)
  return { allocation, unallocated: Math.max(0, amount - selectedTotal(charges)) }
}

/** The charges after an allocation was recorded: what each took is no longer to pay; paid ones drop out. */
export function afterAllocation(charges: readonly OpenCharge[], allocation: readonly CashAllocation[]): OpenCharge[] {
  const taken = new Map(allocation.map((line) => [line.chargeId, line.amount]))
  return charges
    .map((charge) => ({ ...charge, remaining: charge.remaining - (taken.get(charge.id) ?? 0) }))
    .filter((charge) => charge.remaining > 0)
}

// --- Matching ---

export type PayerCandidate = {
  personId: string
  /** The payer's code, when one was ever assigned. */
  code: string | null
  /** The payer's surname and their wards' (the debtors of their charges). */
  surnames: readonly string[]
  /** Their charges still to pay. */
  charges: readonly OpenCharge[]
}

export type MatchResult = {
  status: Exclude<BankTransactionStatus, 'ignored'>
  payerPersonId: string | null
  allocation: CashAllocation[]
  reason: MatchReason
  autoBooked: boolean
}

const unmatched = (reason: MatchReason, payerPersonId: string | null = null): MatchResult => ({
  status: 'unmatched',
  payerPersonId,
  allocation: [],
  reason,
  autoBooked: false,
})

/** Matches one incoming transfer to a payer (see the header of this file for the rules). */
export function matchTransfer(input: {
  amount: number
  counterpartyName: string
  title: string
  payers: readonly PayerCandidate[]
  autoBook: boolean
}): MatchResult {
  const text = `${input.counterpartyName} ${input.title}`
  const codes = new Set(findPayerCodes(text))
  const coded = input.payers.filter((payer) => payer.code !== null && codes.has(payer.code))
  if (coded.length > 1) return unmatched('code_ambiguous')
  if (coded.length === 1) {
    const payer = coded[0]
    if (payer.charges.length === 0) return unmatched('code_no_open_charges', payer.personId)
    const { allocation, unallocated } = allocateTransfer(payer.charges, input.amount)
    if (paysWholeCharges(payer.charges, input.amount)) {
      return {
        status: input.autoBook ? 'booked' : 'suggested',
        payerPersonId: payer.personId,
        allocation,
        reason: 'code_exact',
        autoBooked: input.autoBook,
      }
    }
    return {
      status: 'suggested',
      payerPersonId: payer.personId,
      allocation,
      reason: unallocated > 0 ? 'code_overpayment' : 'code_underpayment',
      autoBooked: false,
    }
  }
  const named = input.payers.filter(
    (payer) => payer.charges.length > 0 && payer.surnames.some((surname) => containsWords(text, surname)),
  )
  if (named.length === 1 && paysWholeCharges(named[0].charges, input.amount)) {
    return {
      status: 'suggested',
      payerPersonId: named[0].personId,
      allocation: allocateTransfer(named[0].charges, input.amount).allocation,
      reason: 'surname_amount',
      autoBooked: false,
    }
  }
  return unmatched('no_match')
}

export type ImportCounts = { total: number; booked: number; suggested: number; unmatched: number; skipped: number }

/** The import summary: every entry of the file, by what happened to it (debits and duplicates are skipped). */
export function importCounts(statuses: readonly MatchResult['status'][], skipped: number): ImportCounts {
  const count = (status: MatchResult['status']) => statuses.filter((value) => value === status).length
  return {
    total: statuses.length + skipped,
    booked: count('booked'),
    suggested: count('suggested'),
    unmatched: count('unmatched'),
    skipped,
  }
}
