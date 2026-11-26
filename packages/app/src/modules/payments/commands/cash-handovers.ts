// The cash handover (payments spec REQ-033, REQ-033a, DD-31, DD-31a, TEST-046, TEST-089; issues #118 E07-S11 and
// #791 D-042; J-010 step 4, J-010a):
// - `payments.cash_handovers.send` — the collector (a coach or coordinator holding cash, `self` grant) sends the
//   selected cash payments they hold: a pending handover with its `RG/YYYY/MM/NNN` number (the month it was sent, the
//   club's calendar, under the club's advisory lock) that reserves the payments (`pending_cash_handover_id`);
// - `payments.cash_handovers.withdraw` — the collector withdraws their pending handover; the payments are free again;
// - `payments.cash_handovers.confirm` / `.reject` — the treasurer or the club administrator (`payments.cash.settle`)
//   accepts the whole handover (the payments carry it, the cash is the club's) or rejects it with a reason;
// - `payments.cash_handovers.accept` — the one-sided fallback of B-33: the club receives the selected payments of one
//   collector without the collector's step, under one number, `confirmed` at once.
//
// Refusals: 422 `cash_handover_payments_invalid` (a payment unknown in the club, not cash with a receipt, a reversing
// entry, or collected by someone else — one handover is one collector), 409 `cash_already_settled` (a payment already
// in a handover), 409 `cash_handover_payment_pending` (a payment of a pending handover), 409 `cash_payment_reversed`,
// 409 `cash_handover_not_pending` (a decided handover), 404 for a handover outside the caller's reach. The payments
// are row-locked in id order, so two handovers of the same payment never both succeed; a decision row-locks the
// handover. Money is never edited: no command is undoable, and a payment reversed after its confirmation keeps its
// handover (the owner's defaults C and D on #118). The notices go out after the commit
// (`services/cash-handover-notices.ts`); each step is audited by its command log.
import { randomUUID } from 'node:crypto'
import { LockMode } from '@mikro-orm/core'
import type { EntityManager } from '@mikro-orm/postgresql'
import { registerCommand, type CommandHandler, type CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { authorizeScoped, prefetchSessionScope } from '@/modules/foundation'
import { paymentsErrors } from '../api/errors'
import { CashHandover, Payment } from '../data/entities'
import { lastHandoverNumber, lockHandoverNumbering } from '../data/queries'
import { cashHandoverAcceptSchema, cashHandoverDecisionSchema, cashHandoverSendSchema } from '../data/validators'
import {
  confirmRefusal,
  handoverDecisionRefusal,
  handoverPrefix,
  handoverRefusal,
  handoverSequence,
  nextHandoverNumber,
  type CashHandoverStatus,
  type HandoverCandidate,
  type HandoverDecision,
} from '../lib/cash-handovers'
import {
  notifyHandoverOutcome,
  notifyHandoverSent,
  type HandoverNoticeSubject,
} from '../services/cash-handover-notices'
import { clubClock, type PaymentsScope } from '../services/directory'
import { selfPersonId } from './cash'
import {
  PAYMENTS_WRITE_KINDS,
  clubTarget,
  emitAfterCommit,
  inWriteTransaction,
  paymentsLog,
  type PaymentsCommandResult,
} from './shared'

export const CASH_HANDOVER_RESOURCE_KIND = 'payments.cash_handover'

export type CashHandoverResult = PaymentsCommandResult<CashHandover, null> & {
  number: string
  collectorPersonId: string
  amount: number
  paymentIds: string[]
  status: CashHandoverStatus
  /** Who received the cash (a fallback), or confirmed, rejected or withdrew the handover. */
  deciderPersonId: string | null
}

export type CashHandoverDecisionResult = CashHandoverResult & { reason: string | null }

/** The payments of `paymentIds` row-locked in id order, as the handover rules check them. */
async function lockCandidates(
  em: EntityManager,
  scope: PaymentsScope,
  paymentIds: readonly string[],
): Promise<{ payments: Payment[]; candidates: HandoverCandidate[] }> {
  // Row locks in id order, so two handovers that share payments never deadlock and never both take one.
  const payments = await em.find(
    Payment,
    { id: { $in: [...paymentIds] }, ...scope, deletedAt: null },
    { lockMode: LockMode.PESSIMISTIC_WRITE, orderBy: { id: 'asc' } },
  )
  const reversals = await em.find(
    Payment,
    { ...scope, deletedAt: null, reversesPaymentId: { $in: [...paymentIds] } },
    { fields: ['id', 'reversesPaymentId'] },
  )
  const reversed = new Set(reversals.map((row) => row.reversesPaymentId as string))
  return {
    payments,
    candidates: payments.map((payment) => ({
      id: payment.id,
      method: payment.method,
      receiptNumber: payment.receiptNumber ?? null,
      collectedByPersonId: payment.collectedByPersonId ?? null,
      reversesPaymentId: payment.reversesPaymentId ?? null,
      cashHandoverId: payment.cashHandoverId ?? null,
      pendingCashHandoverId: payment.pendingCashHandoverId ?? null,
      reversed: reversed.has(payment.id),
    })),
  }
}

/** The next `RG/YYYY/MM/NNN` of the club's month, under the club's advisory lock (held until the commit). */
async function issueNumber(ctx: CommandRuntimeContext, em: EntityManager, scope: PaymentsScope): Promise<string> {
  const { today } = await clubClock(ctx.container, scope, undefined, em)
  await lockHandoverNumbering(em, scope.organizationId)
  const last = await lastHandoverNumber(em, scope, handoverPrefix(today))
  return nextHandoverNumber(today, (last && handoverSequence(last)) || 0)
}

/** The trusted club of a handover row: never spread the row itself into a filter or an event payload. */
function scopeOf(row: CashHandover): PaymentsScope {
  return { tenantId: row.tenantId, organizationId: row.organizationId }
}

function noticeSubject(result: CashHandoverResult): HandoverNoticeSubject {
  return {
    id: result.entity.id,
    number: result.number,
    amount: result.amount,
    paymentCount: result.paymentIds.length,
    collectorPersonId: result.collectorPersonId,
  }
}

function handoverLog(result: CashHandoverResult | CashHandoverDecisionResult, labelKey: string, fallback: string) {
  return paymentsLog({
    result,
    resourceKind: CASH_HANDOVER_RESOURCE_KIND,
    labelKey,
    fallback,
    after: {
      number: result.number,
      status: result.status,
      collectorPersonId: result.collectorPersonId,
      amount: result.amount,
      paymentIds: result.paymentIds,
    },
    context: { number: result.number },
  })
}

const acceptHandoverCommand: CommandHandler<Record<string, unknown>, CashHandoverResult> = {
  id: 'payments.cash_handovers.accept',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const handoverId = randomUUID()
    const result = await inWriteTransaction(ctx, 'payments.cash_handovers.accept', async (em) => {
      const authorized = await authorizeScoped(
        {
          input: cashHandoverAcceptSchema,
          resourceKind: CASH_HANDOVER_RESOURCE_KIND,
          allowedKinds: PAYMENTS_WRITE_KINDS,
          resolveTarget: (_parsed, _entity, scope) => clubTarget({ id: handoverId, ...scope }),
        },
        rawInput,
        ctx,
        em,
      )
      const { parsed, tenantId, organizationId } = authorized
      const scope = { tenantId, organizationId }
      const { payments, candidates } = await lockCandidates(em, scope, parsed.paymentIds)
      const refusal = handoverRefusal({
        collectorPersonId: parsed.collectorPersonId,
        paymentIds: parsed.paymentIds,
        payments: candidates,
      })
      if (refusal) await paymentsErrors.throw(refusal)

      const number = await issueNumber(ctx, em, scope)
      const now = new Date()
      const paymentIds = payments.map((payment) => payment.id)
      const amount = payments.reduce((sum, payment) => sum + payment.amount, 0)
      const receiverPersonId = selfPersonId(authorized.scope)
      const handover = em.create(CashHandover, {
        id: handoverId,
        ...scope,
        number,
        collectorPersonId: parsed.collectorPersonId,
        receivedByPersonId: receiverPersonId,
        receivedByUserId: ctx.auth?.sub ?? null,
        amount,
        paymentIds,
        status: 'confirmed',
        decidedAt: now,
        decidedByPersonId: receiverPersonId,
        decidedByUserId: ctx.auth?.sub ?? null,
        createdAt: now,
        updatedAt: now,
      })
      em.persist(handover)
      for (const payment of payments) {
        payment.cashHandoverId = handoverId
        payment.updatedAt = now
      }
      await em.flush()
      return {
        entity: handover,
        actingRole: authorized.actingRole,
        before: null,
        number,
        collectorPersonId: parsed.collectorPersonId,
        amount,
        paymentIds,
        status: 'confirmed' as const,
        deciderPersonId: receiverPersonId,
      }
    })
    await emitAfterCommit('payments.cash_handover.created', scopeOf(result.entity), { id: result.entity.id })
    // The collector is told the club settled their cash without them (D-042).
    await notifyHandoverOutcome(ctx.container, scopeOf(result.entity), noticeSubject(result), 'settled', {
      deciderPersonId: result.deciderPersonId,
      reason: null,
    })
    return result
  },
  buildLog: ({ result }) => handoverLog(result, 'payments.audit.cashHandover.accept', 'Accept cash handover'),
}

// --- payments.cash_handovers.send (D-042) ---

const sendHandoverCommand: CommandHandler<Record<string, unknown>, CashHandoverResult> = {
  id: 'payments.cash_handovers.send',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const handoverId = randomUUID()
    // The collector is the caller: their `self` grant names them (read before the transaction, #549).
    const sessionScope = await prefetchSessionScope(ctx)
    const collectorPersonId = sessionScope ? selfPersonId(sessionScope.scope) : null
    const result = await inWriteTransaction(ctx, 'payments.cash_handovers.send', async (em) => {
      const authorized = await authorizeScoped(
        {
          input: cashHandoverSendSchema,
          resourceKind: CASH_HANDOVER_RESOURCE_KIND,
          allowedKinds: ['self'],
          resolveTarget: (_parsed, _entity, scope) => ({ id: handoverId, ...scope, personId: collectorPersonId }),
        },
        rawInput,
        ctx,
        em,
        { sessionScope },
      )
      const { parsed, tenantId, organizationId } = authorized
      const scope = { tenantId, organizationId }
      const collector = selfPersonId(authorized.scope) as string
      const { payments, candidates } = await lockCandidates(em, scope, parsed.paymentIds)
      const refusal = handoverRefusal({
        collectorPersonId: collector,
        paymentIds: parsed.paymentIds,
        payments: candidates,
      })
      if (refusal) await paymentsErrors.throw(refusal)

      const number = await issueNumber(ctx, em, scope)
      const now = new Date()
      const paymentIds = payments.map((payment) => payment.id)
      const amount = payments.reduce((sum, payment) => sum + payment.amount, 0)
      const handover = em.create(CashHandover, {
        id: handoverId,
        ...scope,
        number,
        collectorPersonId: collector,
        amount,
        paymentIds,
        status: 'pending',
        startedByPersonId: collector,
        startedByUserId: ctx.auth?.sub ?? null,
        sentAt: now,
        createdAt: now,
        updatedAt: now,
      })
      em.persist(handover)
      for (const payment of payments) {
        payment.pendingCashHandoverId = handoverId
        payment.updatedAt = now
      }
      await em.flush()
      return {
        entity: handover,
        actingRole: authorized.actingRole,
        before: null,
        number,
        collectorPersonId: collector,
        amount,
        paymentIds,
        status: 'pending' as const,
        deciderPersonId: null,
      }
    })
    await emitAfterCommit('payments.cash_handover.sent', scopeOf(result.entity), { id: result.entity.id })
    await notifyHandoverSent(ctx.container, scopeOf(result.entity), noticeSubject(result))
    return result
  },
  buildLog: ({ result }) => handoverLog(result, 'payments.audit.cashHandover.send', 'Send cash handover'),
}

// --- payments.cash_handovers.withdraw | confirm | reject (D-042) ---

type DecisionSpec = {
  id: string
  decision: HandoverDecision
  event: 'payments.cash_handover.withdrawn' | 'payments.cash_handover.confirmed' | 'payments.cash_handover.rejected'
}

/**
 * One decision on a pending handover. The collector's withdrawal finds only the caller's own handover (`self`; any
 * other answers 404); the confirmers' decisions are club-wide (`payments.cash.settle` through the treasurer's or the
 * administrator's grant). The handover row is locked, so two decisions never both land (409 for the second).
 */
async function decide(
  spec: DecisionSpec,
  rawInput: Record<string, unknown>,
  ctx: CommandRuntimeContext,
): Promise<CashHandoverDecisionResult> {
  const byCollector = spec.decision === 'withdrawn'
  const sessionScope = await prefetchSessionScope(ctx)
  const self = sessionScope ? selfPersonId(sessionScope.scope) : null
  return inWriteTransaction(ctx, spec.id, async (em) => {
    const authorized = await authorizeScoped(
      {
        input: cashHandoverDecisionSchema,
        resourceKind: CASH_HANDOVER_RESOURCE_KIND,
        allowedKinds: byCollector ? ['self'] : PAYMENTS_WRITE_KINDS,
        loadTarget: async (parsed, lockEm, lock) => {
          const tenantId = sessionScope?.tenantId
          const organizationId = sessionScope?.organizationId
          if (!tenantId || !organizationId || (byCollector && !self)) return null
          return lockEm.findOne(
            CashHandover,
            {
              id: parsed.id,
              tenantId,
              organizationId,
              deletedAt: null,
              ...(byCollector ? { collectorPersonId: self as string } : {}),
            },
            lock,
          )
        },
        resolveTarget: (_parsed, entity, scope) => {
          const row = entity as CashHandover
          return { ...clubTarget({ id: row.id, ...scope }), personId: row.collectorPersonId }
        },
        // A state transition, not an edit of a versioned record: the status guards it (409 when decided).
        lock: 'none',
      },
      rawInput,
      ctx,
      em,
      { sessionScope },
    )
    const handover = authorized.entity as CashHandover
    const { parsed, tenantId, organizationId } = authorized
    const scope = { tenantId, organizationId }
    const notPending = handoverDecisionRefusal(handover.status)
    if (notPending) await paymentsErrors.throw(notPending)
    const reason = spec.decision === 'rejected' ? (parsed.reason ?? null) : null

    const { payments, candidates } = await lockCandidates(em, scope, handover.paymentIds)
    if (spec.decision === 'confirmed') {
      const refusal = confirmRefusal({ handoverId: handover.id, paymentIds: handover.paymentIds, payments: candidates })
      if (refusal) await paymentsErrors.throw(refusal)
    }
    const now = new Date()
    const deciderPersonId = selfPersonId(authorized.scope)
    for (const payment of payments) {
      // Only the payments this handover still reserves (a reversed payment keeps nothing else).
      if (payment.pendingCashHandoverId !== handover.id) continue
      payment.pendingCashHandoverId = null
      if (spec.decision === 'confirmed') payment.cashHandoverId = handover.id
      payment.updatedAt = now
    }
    handover.status = spec.decision
    handover.decidedAt = now
    handover.decidedByPersonId = deciderPersonId
    handover.decidedByUserId = ctx.auth?.sub ?? null
    if (spec.decision === 'confirmed') {
      handover.receivedByPersonId = deciderPersonId
      handover.receivedByUserId = ctx.auth?.sub ?? null
    }
    handover.rejectionReason = reason
    handover.updatedAt = now
    await em.flush()
    return {
      entity: handover,
      actingRole: authorized.actingRole,
      before: null,
      number: handover.number,
      collectorPersonId: handover.collectorPersonId,
      amount: handover.amount,
      paymentIds: [...handover.paymentIds],
      status: spec.decision,
      deciderPersonId,
      reason,
    }
  })
}

function decisionCommand(
  spec: DecisionSpec,
  log: { labelKey: string; fallback: string },
): CommandHandler<Record<string, unknown>, CashHandoverDecisionResult> {
  return {
    id: spec.id,
    isUndoable: false,
    async execute(rawInput, ctx) {
      // A rejection names the difference: without a reason the input is invalid (400), before anything is locked.
      if (spec.decision === 'rejected') cashHandoverDecisionSchema.required({ reason: true }).parse(rawInput)
      const result = await decide(spec, rawInput, ctx)
      await emitAfterCommit(spec.event, scopeOf(result.entity), { id: result.entity.id })
      if (spec.decision !== 'withdrawn') {
        await notifyHandoverOutcome(ctx.container, scopeOf(result.entity), noticeSubject(result), spec.decision, {
          deciderPersonId: result.deciderPersonId,
          reason: result.reason,
        })
      }
      return result
    },
    // The reason stays out of the log's context; the encrypted snapshot carries it.
    buildLog: ({ result }) => handoverLog(result, log.labelKey, log.fallback),
  }
}

registerCommand(acceptHandoverCommand)
registerCommand(sendHandoverCommand)
registerCommand(
  decisionCommand(
    { id: 'payments.cash_handovers.withdraw', decision: 'withdrawn', event: 'payments.cash_handover.withdrawn' },
    { labelKey: 'payments.audit.cashHandover.withdraw', fallback: 'Withdraw cash handover' },
  ),
)
registerCommand(
  decisionCommand(
    { id: 'payments.cash_handovers.confirm', decision: 'confirmed', event: 'payments.cash_handover.confirmed' },
    { labelKey: 'payments.audit.cashHandover.confirm', fallback: 'Confirm cash handover' },
  ),
)
registerCommand(
  decisionCommand(
    { id: 'payments.cash_handovers.reject', decision: 'rejected', event: 'payments.cash_handover.rejected' },
    { labelKey: 'payments.audit.cashHandover.reject', fallback: 'Reject cash handover' },
  ),
)
