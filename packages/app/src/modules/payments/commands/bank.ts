// Bank statement reconciliation, phase 4 step 7 (payments spec API table → `payments.bank_imports.create`,
// `/bank-transactions/{id}/confirm|assign|ignore|undo`; REQ-030, TEST-042; issue #113 E07-S06; B-29):
//
// - `payments.bank_imports.create` reads the statement (CSV with a column mapping, or MT940; `lib/bank-statement.ts`),
//   stores the file in the private `attachments` partition and, in the same transaction, stores every fresh incoming
//   transfer with its match (`lib/bank-matching.ts`). A confident match is recorded at once — `transfer` payments of
//   the payer's charges, oldest first — when the club's "Automatically record confident matches" is on. Debits and
//   transfers imported before are skipped and not stored. Refusals: 422 `bank_statement_missing`,
//   `bank_statement_unsupported`, `bank_statement_columns_missing` (naming the required columns),
//   `bank_statement_unreadable`; 413 `bank_statement_too_large`, `bank_statement_too_many`.
// - `payments.bank_transactions.confirm|assign|ignore|restore|undo` decide on one transfer: Confirm records the
//   proposed payer's charges, Assign records another payer's (422 `bank_payer_no_open_charges`), Skip marks a donation,
//   a grant, a refund or other, Restore returns a skipped transfer to "Unmatched" (Q1 on #113), Undo writes reversing
//   entries (S10.4) for the transfer's payments, reopens the charges and returns it to "To confirm". Each checks the
//   transfer's lock token (409 `optimistic_lock_conflict`) and its status (409 `bank_transaction_status_changed`).
//
// The import and every decision that moves money take the club's statement lock, then row-lock the charges, so two of
// them never spread one charge's remaining amount twice. Like every `payments` write of phase 4 they need the club
// administrator's grant (D-030). Money is never edited or deleted: none of these commands is undoable through the
// audit log; Undo and Restore are the corrections.
import { randomUUID } from 'node:crypto'
import { LockMode } from '@mikro-orm/core'
import type { EntityManager } from '@mikro-orm/postgresql'
import { registerCommand, type CommandHandler, type CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { CrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import type { AttachmentService } from '@open-mercato/core/modules/attachments'
import type { z } from 'zod'
import type { Scope } from '@vereino/core'
import { authorizeScoped, trustedScopeOf, type AuthorizeScopedSpec } from '@/modules/foundation'
import { paymentsErrors } from '../api/errors'
import { BankImport, BankTransaction, Charge, PaymentsSettings, Payment } from '../data/entities'
import { lockBankStatements } from '../data/queries'
import {
  bankImportCreateSchema,
  bankTransactionActionSchema,
  bankTransactionAssignSchema,
  bankTransactionIgnoreSchema,
} from '../data/validators'
import {
  REQUIRED_STATEMENT_COLUMNS,
  parseStatement,
  type StatementEntry,
  type StatementProblem,
} from '../lib/bank-statement'
import {
  actionAllowed,
  afterAllocation,
  allocateTransfer,
  importCounts,
  matchTransfer,
  planImport,
  transferHash,
  type BankAction,
  type BankTransactionStatus,
  type ImportCounts,
  type MatchResult,
  type OpenCharge,
} from '../lib/bank-matching'
import type { CashAllocation } from '../lib/cash'
import { MAX_REFERENCE_LENGTH, amountDueOf, paidTotal, settledStatus } from '../lib/charge-ledger'
import type { PaymentsErrorCode } from '../lib/error-codes'
import { livePaymentsOf, payerCandidates, payerOpenCharges, storedHashes } from '../services/bank'
import { clubClock } from '../services/directory'
import {
  PAYMENTS_WRITE_KINDS,
  clubTarget,
  emitAfterCommit,
  inWriteTransaction,
  paymentsLog,
  trustedTenantId,
  type PaymentsCommandResult,
} from './shared'

export const BANK_IMPORT_RESOURCE_KIND = 'payments.bank_import'
export const BANK_TRANSACTION_RESOURCE_KIND = 'payments.bank_transaction'

/** The `attachments` partition, owner and assignment of a statement file (read only with `payments.bank.import`). */
export const BANK_STATEMENT_PARTITION = 'privateAttachments'
export const BANK_STATEMENT_OWNER_ENTITY = 'payments:bank_import'
export const BANK_STATEMENT_ASSIGNMENT = 'payments:bank_statement'

// --- The uploaded file (never part of the stored command input) ---

const STATEMENT_UPLOAD = Symbol.for('vereino.payments.statementUpload')

export type StatementUpload = { buffer: Buffer; fileName: string; mimeType: string }

type UploadContext = CommandRuntimeContext & { [STATEMENT_UPLOAD]?: StatementUpload }

/** The command context carrying the uploaded statement. */
export function withStatement(ctx: CommandRuntimeContext, upload: StatementUpload): CommandRuntimeContext {
  return Object.assign(ctx, { [STATEMENT_UPLOAD]: upload })
}

function statementOf(ctx: CommandRuntimeContext): StatementUpload | null {
  const upload = (ctx as UploadContext)[STATEMENT_UPLOAD]
  return upload && Buffer.isBuffer(upload.buffer) ? upload : null
}

function attachmentServiceOf(ctx: CommandRuntimeContext): AttachmentService {
  if (!ctx.container.hasRegistration('attachmentService')) {
    throw new CrudHttpError(503, { error: 'Attachment service is unavailable' })
  }
  return ctx.container.resolve<AttachmentService>('attachmentService')
}

const PROBLEM_CODES: Record<StatementProblem, PaymentsErrorCode> = {
  empty: 'bank_statement_missing',
  too_large: 'bank_statement_too_large',
  format_unsupported: 'bank_statement_unsupported',
  columns_missing: 'bank_statement_columns_missing',
  too_many_entries: 'bank_statement_too_many',
  nothing_readable: 'bank_statement_unreadable',
}

// --- Shared ---

/** The caller's own person (the `self` grant): who imported or decided. */
function selfPersonId(scope: Scope): string | null {
  return scope.find((grant) => grant.kind === 'self')?.ids?.[0] ?? null
}

type Actor = { personId: string | null; userId: string | null }

type RecordedLine = { paymentId: string; chargeId: string; amount: number }

/**
 * Records `allocation` as `transfer` payments of the transfer, paid on its booking day, and settles each charge again.
 * `open` holds what remained on the charges before; `charges` the row-locked charges by id.
 */
function recordTransfer(
  em: EntityManager,
  input: {
    transfer: BankTransaction
    allocation: readonly CashAllocation[]
    charges: ReadonlyMap<string, Charge>
    open: readonly OpenCharge[]
    actor: Actor
    now: Date
  },
): RecordedLine[] {
  const lines: RecordedLine[] = []
  for (const line of input.allocation) {
    const charge = input.charges.get(line.chargeId) as Charge
    const before = input.open.find((row) => row.id === line.chargeId) as OpenCharge
    const amountDue = amountDueOf(charge)
    const payment = em.create(Payment, {
      id: randomUUID(),
      tenantId: input.transfer.tenantId,
      organizationId: input.transfer.organizationId,
      chargeId: charge.id,
      amount: line.amount,
      method: 'transfer',
      paidOn: input.transfer.bookedOn,
      reference: input.transfer.title.slice(0, MAX_REFERENCE_LENGTH) || null,
      recordedByPersonId: input.actor.personId,
      recordedByUserId: input.actor.userId,
      bankTransactionId: input.transfer.id,
      createdAt: input.now,
      updatedAt: input.now,
    })
    em.persist(payment)
    charge.status = settledStatus(charge.status, amountDue, amountDue - before.remaining + line.amount)
    charge.updatedAt = input.now
    lines.push({ paymentId: payment.id, chargeId: charge.id, amount: line.amount })
  }
  return lines
}

async function emitRecorded(scope: { tenantId: string; organizationId: string }, lines: readonly RecordedLine[]) {
  for (const line of lines) {
    await emitAfterCommit('payments.payment.recorded', scope, {
      id: line.paymentId,
      chargeId: line.chargeId,
      method: 'transfer',
    })
  }
}

// --- Import ---

export type BankImportResult = PaymentsCommandResult<BankImport, null> &
  ImportCounts & {
    debits: number
    duplicates: number
    unreadable: number[]
    recorded: RecordedLine[]
  }

function entryHashes(organizationId: string, entries: readonly StatementEntry[]): string[] {
  return entries.map((entry) => transferHash(organizationId, entry))
}

const createImportCommand: CommandHandler<Record<string, unknown>, BankImportResult> = {
  id: 'payments.bank_imports.create',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const upload = statementOf(ctx)
    if (!upload) return paymentsErrors.throw('bank_statement_missing', { field: 'file' })
    const fields = bankImportCreateSchema.parse(rawInput)
    const statement = parseStatement(upload.buffer, { format: fields.format, columnProfile: fields.columnProfile })
    if (!statement.ok) {
      return paymentsErrors.throw(PROBLEM_CODES[statement.problem], {
        field: 'file',
        required: REQUIRED_STATEMENT_COLUMNS.join(', '),
        ...(statement.missing ? { missing: statement.missing.join(', '), missingColumns: statement.missing } : {}),
      })
    }
    const importId = randomUUID()
    const spec: AuthorizeScopedSpec<typeof bankImportCreateSchema, never> = {
      input: bankImportCreateSchema,
      resourceKind: BANK_IMPORT_RESOURCE_KIND,
      allowedKinds: PAYMENTS_WRITE_KINDS,
      resolveTarget: (_parsed, _entity, scope) => clubTarget({ id: importId, ...scope }),
    }
    // Refuse a caller without the grant before the file is stored; the check repeats in the upload transaction.
    await inWriteTransaction(ctx, 'payments.bank_imports.create.check', async (em) => {
      await authorizeScoped(spec, fields, ctx, em)
      return true
    })
    const trusted = trustedScopeOf(ctx)
    if (!trusted) throw new Error('[internal] statement import without a trusted scope')
    const box: { result?: BankImportResult } = {}
    await attachmentServiceOf(ctx).createScoped({
      tenantId: trusted.tenantId,
      organizationId: trusted.organizationId,
      entityId: BANK_STATEMENT_OWNER_ENTITY,
      recordId: importId,
      partitionCode: BANK_STATEMENT_PARTITION,
      fileName: upload.fileName,
      declaredMimeType: upload.mimeType,
      buffer: upload.buffer,
      assignments: [{ type: BANK_STATEMENT_ASSIGNMENT, id: importId }],
      persistLink: async (tx: EntityManager, attachmentId: string) => {
        const authorized = await authorizeScoped(spec, fields, ctx, tx)
        const scope = { tenantId: authorized.tenantId, organizationId: authorized.organizationId }
        await lockBankStatements(tx, scope.organizationId)
        const settings = await tx.findOne(PaymentsSettings, { ...scope, deletedAt: null })
        const autoBook = settings?.autoBookBankMatches ?? true
        const known = await storedHashes(tx, scope, entryHashes(scope.organizationId, statement.entries))
        const plan = planImport(scope.organizationId, statement.entries, known)
        const { payers, charges } = await payerCandidates(ctx.container, tx, scope)
        let candidates = payers
        const actor: Actor = { personId: selfPersonId(authorized.scope), userId: ctx.auth?.sub ?? null }
        const now = new Date()
        const statuses: MatchResult['status'][] = []
        const recorded: RecordedLine[] = []
        for (const entry of plan.fresh) {
          const match = matchTransfer({
            amount: entry.amount,
            counterpartyName: entry.counterpartyName,
            title: entry.title,
            payers: candidates,
            autoBook,
          })
          const transfer = tx.create(BankTransaction, {
            id: randomUUID(),
            ...scope,
            importId,
            line: entry.line,
            bookedOn: entry.bookedOn,
            amount: entry.amount,
            counterpartyName: entry.counterpartyName || null,
            counterpartyAccount: entry.counterpartyAccount || null,
            title: entry.title,
            txHash: entry.hash,
            status: match.status,
            payerPersonId: match.payerPersonId,
            allocation: match.allocation,
            matchReason: match.reason,
            autoBooked: match.autoBooked,
            decidedAt: match.autoBooked ? now : null,
            createdAt: now,
            updatedAt: now,
          })
          tx.persist(transfer)
          statuses.push(match.status)
          if (match.status !== 'booked') continue
          const payer = candidates.find((candidate) => candidate.personId === match.payerPersonId)
          const open = payer?.charges ?? []
          recorded.push(...recordTransfer(tx, { transfer, allocation: match.allocation, charges, open, actor, now }))
          // Later transfers of the same statement see what this one paid.
          candidates = candidates.map((candidate) =>
            candidate === payer
              ? { ...candidate, charges: afterAllocation(candidate.charges, match.allocation) }
              : candidate,
          )
        }
        const counts = importCounts(statuses, plan.debits + plan.duplicates)
        const row = tx.create(BankImport, {
          id: importId,
          ...scope,
          attachmentId,
          fileName: upload.fileName,
          format: statement.format,
          columnProfile: statement.columnProfile,
          importedByPersonId: actor.personId,
          importedByUserId: actor.userId,
          ...counts,
          createdAt: now,
          updatedAt: now,
        })
        tx.persist(row)
        await tx.flush()
        box.result = {
          entity: row,
          actingRole: authorized.actingRole,
          before: null,
          ...counts,
          debits: plan.debits,
          duplicates: plan.duplicates,
          unreadable: statement.unreadable,
          recorded,
        }
      },
    })
    const result = box.result
    if (!result) throw new Error('[internal] the statement import produced no result')
    const scope = { tenantId: result.entity.tenantId, organizationId: result.entity.organizationId }
    await emitAfterCommit('payments.bank_import.completed', scope, {
      id: result.entity.id,
      total: result.total,
      booked: result.booked,
      suggested: result.suggested,
      unmatched: result.unmatched,
      skipped: result.skipped,
    })
    await emitRecorded(scope, result.recorded)
    return result
  },
  buildLog: ({ result }) =>
    paymentsLog({
      result,
      resourceKind: BANK_IMPORT_RESOURCE_KIND,
      labelKey: 'payments.audit.bank.import',
      fallback: 'Import a bank statement',
      after: {
        id: result.entity.id,
        format: result.entity.format,
        total: result.total,
        booked: result.booked,
        suggested: result.suggested,
        unmatched: result.unmatched,
        skipped: result.skipped,
        payments: result.recorded,
      },
    }),
}

// --- Decisions on one transfer ---

export type BankDecisionResult = PaymentsCommandResult<BankTransaction, { status: BankTransactionStatus }> & {
  action: BankAction
  recorded: RecordedLine[]
  reversed: RecordedLine[]
}

function transferSpec<TSchema extends z.ZodType<{ id: string }>>(
  input: TSchema,
  ctx: CommandRuntimeContext,
): AuthorizeScopedSpec<TSchema, BankTransaction> {
  return {
    input,
    resourceKind: BANK_TRANSACTION_RESOURCE_KIND,
    allowedKinds: PAYMENTS_WRITE_KINDS,
    loadTarget: (parsed, em, lock) => {
      const tenantId = trustedTenantId(ctx)
      if (!tenantId) return Promise.resolve(null)
      return em.findOne(BankTransaction, { id: parsed.id, tenantId, deletedAt: null }, lock)
    },
    resolveTarget: (_parsed, entity) => clubTarget(entity as BankTransaction),
  }
}

type DecisionStep = (input: {
  em: EntityManager
  transfer: BankTransaction
  parsed: Record<string, unknown>
  actor: Actor
  now: Date
  ctx: CommandRuntimeContext
}) => Promise<{ recorded?: RecordedLine[]; reversed?: RecordedLine[] }>

/** Records the transfer against `payerPersonId`'s open charges, oldest first (Confirm and Assign). */
async function bookFor(
  input: Parameters<DecisionStep>[0],
  payerPersonId: string,
): Promise<{ recorded: RecordedLine[] }> {
  const { em, transfer, actor, now } = input
  const scope = { tenantId: transfer.tenantId, organizationId: transfer.organizationId }
  await lockBankStatements(em, scope.organizationId)
  const { charges, open } = await payerOpenCharges(em, scope, payerPersonId)
  if (open.length === 0) return paymentsErrors.throw('bank_payer_no_open_charges')
  const { allocation } = allocateTransfer(open, transfer.amount)
  const recorded = recordTransfer(em, {
    transfer,
    allocation,
    charges: new Map(charges.map((charge) => [charge.id, charge])),
    open,
    actor,
    now,
  })
  transfer.status = 'booked'
  transfer.payerPersonId = payerPersonId
  transfer.allocation = allocation
  transfer.autoBooked = false
  return { recorded }
}

const STEPS: Record<BankAction, DecisionStep> = {
  confirm: async (input) => {
    if (!input.transfer.payerPersonId) return paymentsErrors.throw('bank_transaction_status_changed')
    return bookFor(input, input.transfer.payerPersonId)
  },
  assign: async (input) => {
    const result = await bookFor(input, String(input.parsed.payerPersonId))
    input.transfer.matchReason = 'assigned'
    return result
  },
  ignore: ({ transfer, parsed }) => {
    transfer.status = 'ignored'
    transfer.skipReason = parsed.reason as BankTransaction['skipReason']
    transfer.skipNote = (parsed.note as string | null | undefined) || null
    return Promise.resolve({})
  },
  restore: ({ transfer }) => {
    transfer.status = 'unmatched'
    transfer.payerPersonId = null
    transfer.allocation = []
    transfer.matchReason = 'no_match'
    transfer.skipReason = null
    transfer.skipNote = null
    return Promise.resolve({})
  },
  undo: async ({ em, transfer, actor, now, ctx }) => {
    const scope = { tenantId: transfer.tenantId, organizationId: transfer.organizationId }
    await lockBankStatements(em, scope.organizationId)
    const payments = await livePaymentsOf(em, transfer)
    const charges = await em.find(
      Charge,
      { ...scope, id: { $in: [...new Set(payments.map((row) => row.chargeId))] }, deletedAt: null },
      { lockMode: LockMode.PESSIMISTIC_WRITE, orderBy: { id: 'asc' } },
    )
    const { today } = await clubClock(ctx.container, scope)
    const reversed: RecordedLine[] = []
    for (const original of payments) {
      const reversal = em.create(Payment, {
        id: randomUUID(),
        ...scope,
        chargeId: original.chargeId,
        amount: -original.amount,
        method: 'transfer',
        paidOn: today,
        reference: null,
        recordedByPersonId: actor.personId,
        recordedByUserId: actor.userId,
        reversesPaymentId: original.id,
        bankTransactionId: transfer.id,
        createdAt: now,
        updatedAt: now,
      })
      em.persist(reversal)
      reversed.push({ paymentId: reversal.id, chargeId: original.chargeId, amount: -original.amount })
    }
    await em.flush()
    for (const charge of charges) {
      const ledger = await em.find(Payment, { ...scope, chargeId: charge.id, isOverpayment: false, deletedAt: null })
      charge.status = settledStatus(charge.status, amountDueOf(charge), paidTotal(ledger))
      charge.updatedAt = now
    }
    transfer.status = 'suggested'
    transfer.autoBooked = false
    return { reversed }
  },
}

const SCHEMAS: Record<BankAction, z.ZodType<{ id: string }>> = {
  confirm: bankTransactionActionSchema,
  assign: bankTransactionAssignSchema,
  ignore: bankTransactionIgnoreSchema,
  restore: bankTransactionActionSchema,
  undo: bankTransactionActionSchema,
}

const LABELS: Record<BankAction, string> = {
  confirm: 'Confirm a statement transfer',
  assign: 'Assign a payer to a statement transfer',
  ignore: 'Skip a statement transfer',
  restore: 'Restore a skipped statement transfer',
  undo: 'Undo a recorded statement transfer',
}

function decisionCommand(action: BankAction): CommandHandler<Record<string, unknown>, BankDecisionResult> {
  return {
    id: `payments.bank_transactions.${action}`,
    isUndoable: false,
    async execute(rawInput, ctx) {
      const result = await inWriteTransaction(ctx, `payments.bank_transactions.${action}`, async (em) => {
        const authorized = await authorizeScoped(transferSpec(SCHEMAS[action], ctx), rawInput, ctx, em)
        const transfer = authorized.entity as BankTransaction
        if (!actionAllowed(action, transfer.status)) await paymentsErrors.throw('bank_transaction_status_changed')
        const before = { status: transfer.status }
        const now = new Date()
        const actor: Actor = { personId: selfPersonId(authorized.scope), userId: ctx.auth?.sub ?? null }
        const outcome = await STEPS[action]({
          em,
          transfer,
          parsed: authorized.parsed,
          actor,
          now,
          ctx,
        })
        transfer.decidedByPersonId = actor.personId
        transfer.decidedByUserId = actor.userId
        transfer.decidedAt = now
        transfer.updatedAt = now
        await em.flush()
        return {
          entity: transfer,
          actingRole: authorized.actingRole,
          before,
          action,
          recorded: outcome.recorded ?? [],
          reversed: outcome.reversed ?? [],
        }
      })
      const scope = { tenantId: result.entity.tenantId, organizationId: result.entity.organizationId }
      await emitAfterCommit('payments.bank_transaction.decided', scope, {
        id: result.entity.id,
        action,
        status: result.entity.status,
      })
      await emitRecorded(scope, result.recorded)
      for (const line of result.reversed) {
        await emitAfterCommit('payments.payment.reversed', scope, { id: line.paymentId, chargeId: line.chargeId })
      }
      return result
    },
    buildLog: ({ result }) =>
      paymentsLog({
        result,
        resourceKind: BANK_TRANSACTION_RESOURCE_KIND,
        labelKey: `payments.audit.bank.${action}`,
        fallback: LABELS[action],
        after: {
          id: result.entity.id,
          status: result.entity.status,
          payerPersonId: result.entity.payerPersonId ?? null,
          allocation: result.entity.allocation,
          skipReason: result.entity.skipReason ?? null,
          payments: result.recorded,
          reversals: result.reversed,
        },
      }),
  }
}

registerCommand(createImportCommand)
for (const action of ['confirm', 'assign', 'ignore', 'restore', 'undo'] as const)
  registerCommand(decisionCommand(action))
