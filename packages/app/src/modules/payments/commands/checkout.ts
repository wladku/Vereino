// The online checkout commands of phase 4 step 4 (payments spec API table → `payments.checkout.create`,
// `payments.payments.refund`; DD-42, REQ-012, R13, Q-050; issue #110 E07-S03):
//
// - `payments.checkout.create`: the payer's selected open charges (403 someone else's, 422 `payer_missing`, 409
//   `charge_not_open`; 403 `payments_minor` for a minor, R10) become a checkout with the `payer_pays` surcharge; the
//   charges are row-locked while it is written, then the gateway session is created outside the transaction, with the
//   checkout id as the gateway `paymentId` and the checkout's own idempotency key. A gateway failure marks the
//   checkout `failed` and answers 502 `gateway_unavailable`.
// - `payments.payments.refund`: the club administrator refunds an online payment (in full or in part, an overpayment
//   "to refund" too) through `paymentGatewayService.refundPayment`; the result is a reversing entry with the provider
//   refund id. The reversing entry's id derives from the payment and the operation id, so a retry with the same
//   operation id returns the same refund (S10.4). Refunds start only in Vereino (Q-050).
//
// Neither command is undoable: money moved at the provider.
import { createHash, randomUUID } from 'node:crypto'
import { LockMode } from '@mikro-orm/core'
import type { EntityManager } from '@mikro-orm/postgresql'
import { registerCommand, type CommandHandler } from '@open-mercato/shared/lib/commands'
import type { CreateSessionResult } from '@open-mercato/shared/modules/payment_gateways/types'
import type { ActingRole } from '@vereino/core'
import { authorizeScoped } from '@/modules/foundation'
import { paymentsErrors } from '../api/errors'
import { Charge, Checkout, Payment } from '../data/entities'
import { checkoutSchema, paymentRefundSchema } from '../data/validators'
import { checkoutProviderKey } from '../di'
import { amountDueOf, paidTotal, settledStatus } from '../lib/charge-ledger'
import { refundRefusal, toGatewayAmount, type CheckoutTotals } from '../lib/checkout-rules'
import { callGateway, checkedCharges, gatewayService, payerOf } from '../services/checkout'
import { clubClock } from '../services/directory'
import { CHARGE_RESOURCE_KIND, PAYMENT_RESOURCE_KIND, ledgerOf } from './ledger'
import {
  PAYMENTS_WRITE_KINDS,
  clubTarget,
  emitAfterCommit,
  inWriteTransaction,
  paymentsLog,
  trustedTenantId,
  type PaymentsCommandResult,
} from './shared'

export const CHECKOUT_RESOURCE_KIND = 'payments.checkout'

/** The club's enabled online methods (DD-42: default card; BLIK and P24 wait for the sandbox run, Q-016). */
const PAYMENT_TYPES = ['card']

export type CheckoutCreateResult = PaymentsCommandResult<Checkout, null> & {
  totals: CheckoutTotals
  providerKey: string
  clientSession: CreateSessionResult['clientSession'] | null
}

function checkoutSnapshot(row: Checkout) {
  return {
    id: row.id,
    tenantId: row.tenantId,
    organizationId: row.organizationId,
    payerPersonId: row.payerPersonId,
    chargeIds: row.chargeIds,
    amount: row.amount,
    feeAmount: row.feeAmount,
    status: row.status,
  }
}

const createCheckoutCommand: CommandHandler<Record<string, unknown>, CheckoutCreateResult> = {
  id: 'payments.checkout.create',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const parsed = checkoutSchema.parse(rawInput)
    const payer = await payerOf(ctx)
    const box: { actingRole?: ActingRole } = {}
    const checkout = await inWriteTransaction(ctx, 'payments.checkout.create', async (em) => {
      const { charges, totals } = await checkedCharges(em, ctx.container, payer, parsed.chargeIds, true)
      box.actingRole = charges.every((charge) => charge.personId === payer.personId) ? 'self' : 'guardian'
      const now = new Date()
      const id = randomUUID()
      const row = em.create(Checkout, {
        id,
        ...payer.scope,
        payerPersonId: payer.personId,
        chargeIds: parsed.chargeIds,
        amount: totals.amount,
        feeAmount: totals.feeAmount,
        idempotencyKey: `payments-checkout-${id}`,
        createdAt: now,
        updatedAt: now,
      })
      em.persist(row)
      await em.flush()
      return row
    })
    const totals = {
      amount: checkout.amount,
      feeAmount: checkout.feeAmount,
      total: checkout.amount + checkout.feeAmount,
    }
    const providerKey = checkoutProviderKey()
    const em = ctx.container.resolve<EntityManager>('em').fork()
    let created: Awaited<ReturnType<ReturnType<typeof gatewayService>['createPaymentSession']>>
    try {
      created = await callGateway('createPaymentSession', () =>
        gatewayService(ctx.container).createPaymentSession({
          providerKey,
          paymentId: checkout.id,
          idempotencyKey: checkout.idempotencyKey,
          amount: toGatewayAmount(totals.total),
          currencyCode: 'PLN',
          captureMethod: 'automatic',
          paymentTypes: PAYMENT_TYPES,
          ...payer.scope,
        }),
      )
    } catch (error) {
      await em.nativeUpdate(Checkout, { id: checkout.id, ...payer.scope }, { status: 'failed', updatedAt: new Date() })
      throw error
    }
    checkout.gatewayTransactionId = created.transaction.id
    checkout.updatedAt = new Date()
    await em.nativeUpdate(
      Checkout,
      { id: checkout.id, ...payer.scope },
      { gatewayTransactionId: checkout.gatewayTransactionId, updatedAt: checkout.updatedAt },
    )
    await emitAfterCommit('payments.checkout.created', payer.scope, {
      id: checkout.id,
      chargeIds: checkout.chargeIds,
    })
    return {
      entity: checkout,
      actingRole: box.actingRole ?? 'self',
      before: null,
      totals,
      providerKey,
      clientSession: created.session.clientSession ?? null,
    }
  },
  buildLog: ({ result }) =>
    paymentsLog({
      result,
      resourceKind: CHECKOUT_RESOURCE_KIND,
      labelKey: 'payments.audit.checkout.create',
      fallback: 'Start an online payment',
      after: checkoutSnapshot(result.entity),
    }),
}

/** The reversing entry's id of a refund: one per payment and operation id, so a retry finds it (S10.4). */
export function refundEntryId(paymentId: string, operationId: string): string {
  const hex = createHash('sha256').update(`payments-refund:${paymentId}:${operationId}`).digest('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

export type RefundCommandResult = PaymentsCommandResult<Payment, null> & {
  charge: Charge
  refunded: number
  reason: string
  replayed: boolean
}

type RefundPreparation =
  | { kind: 'replay'; entry: Payment; charge: Charge; actingRole: ActingRole }
  | {
      kind: 'refund'
      original: Payment
      charge: Charge
      amount: number
      reason: string
      operationId: string
      entryId: string
      actingRole: ActingRole
      recordedByPersonId: string | null
    }

const refundPaymentCommand: CommandHandler<Record<string, unknown>, RefundCommandResult> = {
  id: 'payments.payments.refund',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const prepared = await inWriteTransaction<RefundPreparation>(ctx, 'payments.payments.refund', async (em) => {
      const box: { original?: Payment } = {}
      const authorized = await authorizeScoped(
        {
          input: paymentRefundSchema,
          resourceKind: CHARGE_RESOURCE_KIND,
          allowedKinds: PAYMENTS_WRITE_KINDS,
          // The target is the payment's charge, as for a reversal: row-locked, its lock token checked.
          loadTarget: async (parsed, txEm, lock) => {
            const tenantId = trustedTenantId(ctx)
            if (!tenantId) return null
            const original = await txEm.findOne(Payment, { id: parsed.id, tenantId, deletedAt: null })
            if (!original) return null
            box.original = original
            return txEm.findOne(
              Charge,
              { id: original.chargeId, tenantId, organizationId: original.organizationId, deletedAt: null },
              lock,
            )
          },
          resolveTarget: (_parsed, entity) => clubTarget(entity as Charge),
        },
        rawInput,
        ctx,
        em,
      )
      const charge = authorized.entity as Charge
      const original = box.original as Payment
      const { parsed } = authorized
      const entryId = refundEntryId(original.id, parsed.operationId)
      const existing = await em.findOne(Payment, { id: entryId, deletedAt: null })
      if (existing) return { kind: 'replay', entry: existing, charge, actingRole: authorized.actingRole }
      const refunds = await em.find(Payment, { reversesPaymentId: original.id, deletedAt: null })
      const refundable = original.amount + paidTotal(refunds)
      const amount = parsed.amount ?? refundable
      const refusal = refundRefusal({
        method: original.method,
        reversesPaymentId: original.reversesPaymentId ?? null,
        amount,
        refundable,
      })
      if (refusal === 'refund_exceeds_remaining') {
        await paymentsErrors.throw(refusal, { refundableAmount: refundable })
      } else if (refusal || !original.gatewayTransactionId || amount <= 0) {
        await paymentsErrors.throw('payment_not_refundable')
      }
      const self = authorized.scope.find((grant) => grant.kind === 'self')?.ids?.[0] ?? null
      // A new lock token before the provider call: a second refund sent with the same token waits for this row lock
      // and then answers 409, so two concurrent refunds can never both pass the check above (#212 review).
      charge.updatedAt = new Date()
      await em.flush()
      return {
        kind: 'refund',
        original,
        charge,
        amount,
        reason: parsed.reason,
        operationId: parsed.operationId,
        entryId,
        actingRole: authorized.actingRole,
        recordedByPersonId: self,
      }
    })
    if (prepared.kind === 'replay') {
      return {
        entity: prepared.entry,
        actingRole: prepared.actingRole,
        before: null,
        charge: prepared.charge,
        refunded: -prepared.entry.amount,
        reason: prepared.entry.reference ?? '',
        replayed: true,
      }
    }
    const { original } = prepared
    const scope = { tenantId: original.tenantId, organizationId: original.organizationId }
    const transactionId = original.gatewayTransactionId as string
    // The provider call runs outside the transaction; the gateway keys it by the operation id, so a retry is collapsed.
    const result = await callGateway('refundPayment', () =>
      gatewayService(ctx.container).refundPayment(
        transactionId,
        toGatewayAmount(prepared.amount),
        prepared.reason,
        scope,
        prepared.operationId,
      ),
    )
    const { today } = await clubClock(ctx.container, scope)
    const booked = await inWriteTransaction(ctx, 'payments.payments.refund.book', async (em) => {
      const charge = (await em.findOne(
        Charge,
        { id: original.chargeId, ...scope, deletedAt: null },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      )) as Charge
      const already =
        (await em.findOne(Payment, { id: prepared.entryId, deletedAt: null })) ??
        (await em.findOne(Payment, { gatewayRefundId: result.refundId, deletedAt: null }))
      if (already) return { entry: already, charge }
      // Read what was paid before the entry is persisted: the find would auto-flush it into the sum (#212 review).
      const paidBefore = original.isOverpayment ? 0 : paidTotal(await ledgerOf(em, charge))
      const now = new Date()
      const entry = em.create(Payment, {
        id: prepared.entryId,
        ...scope,
        chargeId: charge.id,
        amount: -prepared.amount,
        method: 'online',
        paidOn: today,
        reference: prepared.reason,
        recordedByPersonId: prepared.recordedByPersonId,
        recordedByUserId: ctx.auth?.sub ?? null,
        reversesPaymentId: original.id,
        gatewayTransactionId: original.gatewayTransactionId,
        gatewayRefundId: result.refundId,
        isOverpayment: original.isOverpayment,
        createdAt: now,
        updatedAt: now,
      })
      em.persist(entry)
      if (!original.isOverpayment) {
        charge.status = settledStatus(charge.status, amountDueOf(charge), paidBefore - prepared.amount)
        charge.updatedAt = now
      }
      await em.flush()
      return { entry, charge }
    })
    await emitAfterCommit('payments.payment.refunded', scope, {
      id: booked.entry.id,
      chargeId: booked.charge.id,
      reversesPaymentId: original.id,
    })
    return {
      entity: booked.entry,
      actingRole: prepared.actingRole,
      before: null,
      charge: booked.charge,
      refunded: prepared.amount,
      reason: prepared.reason,
      replayed: false,
    }
  },
  buildLog: ({ result }) =>
    paymentsLog({
      result,
      resourceKind: PAYMENT_RESOURCE_KIND,
      labelKey: 'payments.audit.payments.refund',
      fallback: 'Refund an online payment',
      after: {
        id: result.entity.id,
        chargeId: result.charge.id,
        amount: result.entity.amount,
        reversesPaymentId: result.entity.reversesPaymentId ?? null,
        gatewayRefundId: result.entity.gatewayRefundId ?? null,
        chargeStatus: result.charge.status,
      },
      context: { reason: result.reason, replayed: result.replayed },
    }),
}

registerCommand(createCheckoutCommand)
registerCommand(refundPaymentCommand)
