// The online checkout of a payer's charges, phase 4 step 4 (payments spec DD-42; REQ-012, REQ-002, R10, R13; TEST-019,
// TEST-021, TEST-055, TEST-057; issue #110 E07-S03):
//
// - who pays: the caller's own person, behind `people.paymentsGate` (403 `payments_minor` for a minor, R10), and the
//   charges they see — the ones they pay, and their own or their wards' charges without a payer (shown disabled);
// - the quote: the charges' amounts due and the `payer_pays` surcharge from the club settings (R13);
// - the fulfilment `payments.checkouts.fulfil`: reads the provider state through `paymentGatewayService`, books the
//   captured checkout once (row lock + the unique gateway index), from `failed` or `expired` too (late capture);
// - the failure of an attempt (`payment_gateways.payment.failed|cancelled`) and the sweep `payments:reconcile-checkouts`.
//
// `payment_gateways` is reached only through its DI service (never its entities or the staff-only session route).
import { randomUUID } from 'node:crypto'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { LockMode } from '@mikro-orm/core'
import type { CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import type {
  CancelResult,
  CreateSessionResult,
  GatewayPaymentStatus,
  PaymentGatewayPresentationRequest,
  RefundResult,
} from '@open-mercato/shared/modules/payment_gateways/types'
import { createLogger } from '@open-mercato/shared/lib/logger'
import type { CalendarDate } from '@vereino/core'
import { scopeContract, trustedScopeOf } from '@/modules/foundation'
import type { ClubCoreSettingsService } from '../../club_core/services/settings'
import type { PaymentsGate } from '../../people/services/payments-gate'
import { paymentsErrors } from '../api/errors'
import { Charge, Checkout, Payment } from '../data/entities'
import { amountDueOf, paidTotal, remainingOf, settledStatus } from '../lib/charge-ledger'
import {
  RECONCILE_WINDOW_MS,
  checkoutRefusal,
  checkoutTotals,
  fromGatewayAmount,
  fulfilmentPlan,
  isExpirable,
  providerOutcome,
  type CheckoutStatus,
  type CheckoutTotals,
  type OnlineFeeSettings,
} from '../lib/checkout-rules'
import { emitAfterCommit } from '../commands/shared'
import { clubClock, type PaymentsScope } from './directory'

const logger = createLogger('payments').child({ component: 'checkout' })

const PAYMENTS_GATE = 'people.paymentsGate'
const CLUB_CORE_SETTINGS = 'clubCoreSettings'
const PAYMENT_GATEWAY_SERVICE = 'paymentGatewayService'

/** The subset of the installed 0.9.0 `paymentGatewayService` the checkout uses (DD-42). */
export type GatewayService = {
  createPaymentSession(input: {
    providerKey: string
    paymentId: string
    idempotencyKey?: string
    amount: number
    currencyCode: string
    captureMethod?: 'automatic' | 'manual'
    paymentTypes?: string[]
    description?: string
    presentation?: PaymentGatewayPresentationRequest
    organizationId: string
    tenantId: string
  }): Promise<{ transaction: { id: string }; session: CreateSessionResult }>
  getPaymentStatus(transactionId: string, scope: PaymentsScope): Promise<GatewayPaymentStatus>
  refundPayment(
    transactionId: string,
    amount: number | undefined,
    reason: string | undefined,
    scope: PaymentsScope,
    operationId: string,
  ): Promise<RefundResult>
  cancelPayment(
    transactionId: string,
    reason: string | undefined,
    scope: PaymentsScope,
    operationId: string,
  ): Promise<CancelResult>
}

export function gatewayService(container: AwilixContainer): GatewayService {
  if (!container.hasRegistration(PAYMENT_GATEWAY_SERVICE)) {
    throw new Error('[internal] payments requires the DI service ' + PAYMENT_GATEWAY_SERVICE)
  }
  return container.resolve<GatewayService>(PAYMENT_GATEWAY_SERVICE)
}

/** Runs a gateway call; any failure of the provider answers 502 `gateway_unavailable` (nothing is booked). */
export async function callGateway<T>(label: string, call: () => Promise<T>): Promise<T> {
  try {
    return await call()
  } catch (error) {
    logger.warn('Payment gateway call failed', { label, err: error })
    return paymentsErrors.throw('gateway_unavailable')
  }
}

/** The caller as a payer: the club, their own person (behind the R10 gate) and their wards. */
export type Payer = { scope: PaymentsScope; personId: string; wardIds: string[] }

/**
 * Resolves the session's payer, or throws: 401-equivalent `scope_unlinked`/`scope_denied` from the gate, 403
 * `payments_minor` for a minor (R10) — also when the feature was granted by hand.
 */
export async function payerOf(ctx: CommandRuntimeContext): Promise<Payer> {
  const scope = trustedScopeOf(ctx)
  const userId = ctx.auth?.sub
  if (!scope || !userId) throw new Error('[internal] payments: the payer routes run with a session')
  const gate = ctx.container.resolve<PaymentsGate>(PAYMENTS_GATE)
  const { personId } = await gate.assert({ ...scope, userId })
  const grants = await scopeContract.resolve(ctx)
  const wardIds = grants.filter((grant) => grant.kind === 'guardian').flatMap((grant) => grant.ids ?? [])
  return { scope, personId, wardIds }
}

/** True when the payer sees the charge: they pay it, or it is their own or their ward's charge without a payer. */
export function chargeVisibleTo(payer: Payer, charge: Pick<Charge, 'payerPersonId' | 'payerMissing' | 'personId'>) {
  if (charge.payerPersonId === payer.personId) return true
  return charge.payerMissing && !!charge.personId && [payer.personId, ...payer.wardIds].includes(charge.personId)
}

/** The club's `online_fee_*` settings (R13, owned by `club_core`). */
export async function onlineFeeSettings(container: AwilixContainer, scope: PaymentsScope): Promise<OnlineFeeSettings> {
  const settings = await container.resolve<ClubCoreSettingsService>(CLUB_CORE_SETTINGS).get(scope)
  const { onlineFeeMode, onlineFeePercent, onlineFeeFixed } = settings.values
  return { onlineFeeMode, onlineFeePercent, onlineFeeFixed }
}

/**
 * The selected charges checked for online payment, with their totals; throws 403 `checkout_charge_forbidden` (an
 * unknown charge is someone else's too, so nothing leaks), 422 `payer_missing`, 409 `charge_not_open`.
 */
export async function checkedCharges(
  em: EntityManager,
  container: AwilixContainer,
  payer: Payer,
  chargeIds: readonly string[],
  lock = false,
): Promise<{ charges: Charge[]; totals: CheckoutTotals }> {
  const charges = await em.find(
    Charge,
    { id: { $in: [...chargeIds] }, ...payer.scope, deletedAt: null },
    lock ? { lockMode: LockMode.PESSIMISTIC_WRITE, orderBy: { id: 'asc' } } : {},
  )
  const byId = new Map(charges.map((charge) => [charge.id, charge]))
  const refusal = checkoutRefusal(
    chargeIds.map((id) => {
      const charge = byId.get(id)
      return {
        status: charge?.status ?? 'open',
        payerMissing: charge?.payerMissing ?? false,
        visible: !!charge && chargeVisibleTo(payer, charge),
      }
    }),
  )
  if (refusal) await paymentsErrors.throw(refusal)
  const totals = checkoutTotals(
    charges.map((charge) => amountDueOf(charge)),
    await onlineFeeSettings(container, payer.scope),
  )
  return { charges, totals }
}

/** The quote of `POST /api/payments/checkout/quote`: the totals and the club's fee mode; saves nothing. */
export async function quoteCheckout(
  container: AwilixContainer,
  payer: Payer,
  chargeIds: readonly string[],
): Promise<CheckoutTotals & { feeMode: OnlineFeeSettings['onlineFeeMode'] }> {
  const em = container.resolve<EntityManager>('em').fork()
  const [{ totals }, settings] = await Promise.all([
    checkedCharges(em, container, payer, chargeIds),
    onlineFeeSettings(container, payer.scope),
  ])
  return { ...totals, feeMode: settings.onlineFeeMode }
}

// --- Fulfilment (DD-42) ---

/** A `date` column as `YYYY-MM-DD`; the driver may hand back a string or a Date at midnight UTC. */
function calendarDateOf(value: unknown): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10)
}

export type FulfilmentResult = { status: CheckoutStatus; amountMismatch: boolean; paymentIds: string[] }

function resultOf(checkout: Checkout, paymentIds: string[] = []): FulfilmentResult {
  return { status: checkout.status, amountMismatch: checkout.amountMismatch, paymentIds }
}

function findCheckout(em: EntityManager, scope: PaymentsScope, id: string, lock = false): Promise<Checkout | null> {
  return em.findOne(Checkout, { id, ...scope, deletedAt: null }, lock ? { lockMode: LockMode.PESSIMISTIC_WRITE } : {})
}

/** Books a captured checkout in one transaction, unless it is booked already. */
async function bookCapture(
  container: AwilixContainer,
  scope: PaymentsScope,
  checkoutId: string,
  received: number,
  today: CalendarDate,
): Promise<FulfilmentResult> {
  const em = container.resolve<EntityManager>('em').fork()
  const booked: Payment[] = []
  const checkout = await em.transactional(async (tx) => {
    const row = await findCheckout(tx, scope, checkoutId, true)
    if (!row || row.status === 'completed' || !row.gatewayTransactionId) return row
    const charges = await tx.find(
      Charge,
      { id: { $in: row.chargeIds }, ...scope, deletedAt: null },
      { lockMode: LockMode.PESSIMISTIC_WRITE, orderBy: { id: 'asc' } },
    )
    const ledger = await tx.find(Payment, {
      chargeId: { $in: row.chargeIds },
      ...scope,
      isOverpayment: false,
      deletedAt: null,
    })
    const paidOf = (chargeId: string) => paidTotal(ledger.filter((payment) => payment.chargeId === chargeId))
    const plan = fulfilmentPlan({
      amount: row.amount,
      feeAmount: row.feeAmount,
      received,
      charges: charges.map((charge) => ({
        id: charge.id,
        dueDate: calendarDateOf(charge.dueDate),
        status: charge.status,
        amountDue: amountDueOf(charge),
        remaining: remainingOf(amountDueOf(charge), paidOf(charge.id)),
      })),
    })
    const now = new Date()
    row.lastCheckedAt = now
    row.updatedAt = now
    if (plan.kind === 'amount_mismatch') {
      row.amountMismatch = true
      return row
    }
    const byId = new Map(charges.map((charge) => [charge.id, charge]))
    for (const line of plan.lines) {
      const payment = tx.create(Payment, {
        id: randomUUID(),
        ...scope,
        chargeId: line.chargeId,
        amount: line.amount,
        method: 'online',
        paidOn: today,
        gatewayTransactionId: row.gatewayTransactionId,
        isOverpayment: line.overpayment,
        createdAt: now,
        updatedAt: now,
      })
      tx.persist(payment)
      booked.push(payment)
      const charge = byId.get(line.chargeId) as Charge
      if (!line.overpayment) {
        charge.status = settledStatus(charge.status, amountDueOf(charge), paidOf(charge.id) + line.amount)
        charge.updatedAt = now
      }
    }
    row.status = 'completed'
    row.amountMismatch = false
    await tx.flush()
    return row
  })
  if (!checkout) return { status: 'failed', amountMismatch: false, paymentIds: [] }
  for (const payment of booked) {
    await emitAfterCommit('payments.payment.recorded', scope, {
      id: payment.id,
      chargeId: payment.chargeId,
      method: payment.method,
    })
  }
  if (booked.length > 0) {
    await emitAfterCommit('payments.checkout.completed', scope, {
      id: checkout.id,
      paymentIds: booked.map((p) => p.id),
    })
  }
  return resultOf(
    checkout,
    booked.map((payment) => payment.id),
  )
}

/**
 * `payments.checkouts.fulfil` (DD-42): reads the provider state and books the checkout when the provider captured the
 * full total — once, also after the checkout was marked `failed` or `expired` (late capture). A provider that has not
 * captured leaves the checkout as it is (`failed` when the provider reports a terminal failure of a `created` one).
 * Runs from the capture subscriber, the M-09 refresh and the sweep. Gateway errors answer 502 `gateway_unavailable`.
 */
export async function fulfilCheckout(
  container: AwilixContainer,
  scope: PaymentsScope,
  checkoutId: string,
): Promise<FulfilmentResult | null> {
  const em = container.resolve<EntityManager>('em').fork()
  const checkout = await findCheckout(em, scope, checkoutId)
  if (!checkout) return null
  if (checkout.status === 'completed' || !checkout.gatewayTransactionId) return resultOf(checkout)
  const transactionId = checkout.gatewayTransactionId
  const status = await callGateway('getPaymentStatus', () =>
    gatewayService(container).getPaymentStatus(transactionId, scope),
  )
  const outcome = providerOutcome(status.status)
  if (outcome === 'captured') {
    const { today } = await clubClock(container, scope)
    return bookCapture(container, scope, checkout.id, fromGatewayAmount(status.amountReceived), today)
  }
  checkout.lastCheckedAt = new Date()
  if (outcome === 'failed' && checkout.status === 'created') {
    checkout.status = 'failed'
    checkout.updatedAt = checkout.lastCheckedAt
  }
  await em.flush()
  return resultOf(checkout)
}

/**
 * A failed or cancelled attempt (`payment_gateways.payment.failed|cancelled`): a `created` checkout becomes `failed`.
 * The charges stay open, and a later capture is still booked (DD-42).
 */
export async function markCheckoutFailed(container: AwilixContainer, scope: PaymentsScope, checkoutId: string) {
  const em = container.resolve<EntityManager>('em').fork()
  const now = new Date()
  await em.nativeUpdate(
    Checkout,
    { id: checkoutId, ...scope, status: 'created', deletedAt: null },
    { status: 'failed', updatedAt: now, lastCheckedAt: now },
  )
}

export type ReconcileSummary = { checked: number; completed: number; failed: number; expired: number; errors: number }

/**
 * `payments:reconcile-checkouts` (payments spec *Events* row): every checkout of the club that is not completed and
 * younger than 7 days is fulfilled again (late captures); a `created` one older than 24 hours without a capture is
 * cancelled at the provider when the gateway allows it, then `expired`. One failing checkout never stops the others.
 */
export async function reconcileCheckouts(
  container: AwilixContainer,
  scope: PaymentsScope,
  now: Date = new Date(),
): Promise<ReconcileSummary> {
  const em = container.resolve<EntityManager>('em').fork()
  const rows = await em.find(
    Checkout,
    {
      ...scope,
      status: { $ne: 'completed' },
      createdAt: { $gte: new Date(now.getTime() - RECONCILE_WINDOW_MS) },
      deletedAt: null,
    },
    { orderBy: { createdAt: 'asc' }, limit: 500 },
  )
  const summary: ReconcileSummary = { checked: rows.length, completed: 0, failed: 0, expired: 0, errors: 0 }
  for (const row of rows) {
    try {
      const result = await fulfilCheckout(container, scope, row.id)
      if (result?.status === 'completed') {
        summary.completed += 1
        continue
      }
      if (result?.status === 'failed') summary.failed += 1
      if (!isExpirable({ status: result?.status ?? row.status, createdAt: row.createdAt }, now)) continue
      if (row.gatewayTransactionId) {
        const transactionId = row.gatewayTransactionId
        // A gateway that no longer allows the cancel (already terminal) still lets the checkout expire.
        await gatewayService(container)
          .cancelPayment(transactionId, 'expired', scope, `payments-expire-${row.id}`)
          .catch(() => undefined)
      }
      const expired = await em.nativeUpdate(
        Checkout,
        { id: row.id, ...scope, status: 'created', deletedAt: null },
        { status: 'expired', updatedAt: now, lastCheckedAt: now },
      )
      summary.expired += expired
    } catch (error) {
      summary.errors += 1
      logger.warn('Checkout reconciliation failed', { checkoutId: row.id, err: error })
    }
  }
  return summary
}
