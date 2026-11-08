// `payments.orders.place|update|cancel` (payments spec API row `payments.orders.place`, *Domain Vocabulary* → Order;
// REQ-032, REQ-002, DD-30; issue #116, M-17, M-19). A guardian orders kit for a child of the campaign's groups — or an
// adult participant for themself — in the app (the session, behind the R10 gate: a minor gets 403 `payments_minor`) or
// from a personal link (`token` in the input: the command redeems the link in its own transaction and checks the
// child against the link guardian's current grants, the `{ token }` scope source). The campaign row is locked while an
// order is written, so the one order per child and the print number unique in its group hold under concurrent orders.
//
// - place: the lines of the answers (the set at its set price), the print, the contact, and an `order` charge in the
//   same transaction (payer = the person ordering, due on the payment deadline, the price captured now);
// - update: the whole order again with its lock token; the charge follows the new total, but never below what was
//   paid (409 `order_below_paid`);
// - cancel: only without payments (409 `order_cancel_paid`); the charge is cancelled with the order.
//
// After the deadline or once the campaign is closed every write answers 409 `campaign_closed`; a child outside the
// campaign's groups 403 `order_child_not_in_campaign`; another family's child 403 `scope_denied`. A copy of a placed
// or changed order goes to the contact address after the commit. None is undoable — an undo would have to reverse a
// charge somebody may already be paying — and each is audited (a link's raw token never reaches the audit log).
import { randomUUID } from 'node:crypto'
import { LockMode } from '@mikro-orm/core'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { z } from 'zod'
import { registerCommand, type CommandHandler, type CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import { createLogger } from '@open-mercato/shared/lib/logger'
import type { ActingRole, GrantKind, ScopeTarget } from '@vereino/core'
import { authorizeScoped, contactResolver, type DispatchService } from '@/modules/foundation'
import { paymentsErrors } from '../api/errors'
import { Charge, Checkout, Order, OrderCampaign, OrderLine, type OrderProduct } from '../data/entities'
import { orderCancelSchema, orderPlaceSchema, orderUpdateSchema } from '../data/validators'
import type { OrderCopyParams } from '../emails/templates'
import { paidTotal, settledStatus } from '../lib/charge-ledger'
import type { PaymentsErrorCode } from '../lib/error-codes'
import {
  belowPaid,
  normalizePrintName,
  numberHolder,
  orderLines,
  ordersOpen,
  type OrderLineDraft,
  type OrderLinesError,
} from '../lib/orders'
import { payerOf } from '../services/checkout'
import { clubClock, findGroups, findPersons, type PaymentsScope } from '../services/directory'
import { orderLinkService } from '../services/order-links'
import { campaignParticipants, campaignProducts, submittedOrders } from '../services/order-campaigns'
import { ensurePayerCode } from '../services/payer-overview'
import { ledgerOf } from './ledger'
import { emitAfterCommit, inWriteTransaction, paymentsLog, trustedTenantId, type PaymentsCommandResult } from './shared'

const logger = createLogger('payments').child({ component: 'orders' })

export const ORDER_RESOURCE_KIND = 'payments.order'

/** A guardian orders for their wards, an adult participant for themself — never as staff. */
export const ORDER_KINDS: readonly GrantKind[] = ['self', 'guardian']

/** The reason stored on the charge of a cancelled order. */
const CANCEL_REASON = 'Order cancelled by the guardian'

type Via = 'app' | 'email_link'

/** Who writes: the session's payer, or the guardian of a redeemed personal link. */
type Actor = {
  scope: PaymentsScope
  personId: string
  via: Via
  /** The campaign of a link; a link orders only in its own campaign. */
  linkCampaignId: string | null
}

export type OrderSnapshot = {
  id: string
  campaignId: string
  participantPersonId: string
  orderedByPersonId: string
  status: string
  printName: string | null
  printNumber: number | null
  chargeId: string
  total: number
  submittedVia: Via
}

export type OrderCommandResult = PaymentsCommandResult<Order, OrderSnapshot> & {
  after: OrderSnapshot
  charge: Charge
  total: number
  via: Via
  /** The copy e-mail to send after the commit; null for a cancellation. */
  copy: { params: Omit<OrderCopyParams, 'payerCode'>; email: string } | null
}

function calendarDate(value: unknown): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10)
}

function snapshotOf(order: Order, total: number): OrderSnapshot {
  return {
    id: order.id,
    campaignId: order.campaignId,
    participantPersonId: order.participantPersonId,
    orderedByPersonId: order.orderedByPersonId,
    status: order.status,
    printName: order.printName ?? null,
    printNumber: order.printNumber ?? null,
    chargeId: order.chargeId,
    total,
    submittedVia: order.submittedVia,
  }
}

/** A coded error with the field it belongs to, so the form shows it next to the field. */
async function throwFieldError(code: PaymentsErrorCode, field: string, details?: Record<string, unknown>) {
  const error = await paymentsErrors.create(code, details)
  if (isCrudHttpError(error)) {
    const body = error.body as Record<string, unknown>
    body.fieldErrors = { [field]: body.error }
  }
  throw error
}

/** The writer of a command: the payer of the session, or — with a `token` — the redeemed link's guardian. */
async function actorOf(ctx: CommandRuntimeContext, em: EntityManager, token: string | undefined): Promise<Actor> {
  if (token === undefined) {
    const payer = await payerOf(ctx)
    return { scope: payer.scope, personId: payer.personId, via: 'app', linkCampaignId: null }
  }
  const view = await orderLinkService(ctx.container).redeem(em, token)
  if (!view) return paymentsErrors.throw('order_link_not_found')
  return {
    scope: { tenantId: view.tenantId, organizationId: view.organizationId },
    personId: view.link.guardianPersonId,
    via: 'email_link',
    linkCampaignId: view.link.campaignId,
  }
}

function scopeSourceOf(actor: Actor) {
  return actor.via === 'email_link' ? { token: { personId: actor.personId, ...actor.scope } } : undefined
}

function orderTarget(row: { id: string; tenantId: string; organizationId: string }, personId: string): ScopeTarget {
  return { id: row.id, tenantId: row.tenantId, organizationId: row.organizationId, personId }
}

/** The campaign, row-locked for the rest of the transaction; 404 for a draft or another campaign than the link's. */
async function lockedCampaign(em: EntityManager, actor: Actor, id: string): Promise<OrderCampaign> {
  if (actor.linkCampaignId !== null && actor.linkCampaignId !== id) {
    return paymentsErrors.throw('order_campaign_not_found')
  }
  const campaign = await em.findOne(
    OrderCampaign,
    { id, ...actor.scope, deletedAt: null, status: { $ne: 'draft' } },
    { lockMode: LockMode.PESSIMISTIC_WRITE },
  )
  if (!campaign) return paymentsErrors.throw('order_campaign_not_found')
  return campaign
}

type OrderInput = z.output<typeof orderUpdateSchema>

const LINE_ERROR_FIELDS: Record<OrderLinesError, string> = {
  order_answer_missing: 'choices',
  order_answer_invalid: 'choices',
  order_set_size_missing: 'choices',
  order_empty: 'choices',
}

type CheckedOrder = {
  lines: OrderLineDraft[]
  total: number
  printName: string | null
  printNumber: number | null
  groupId: string
  products: OrderProduct[]
}

/**
 * The checks every write of an order runs under the campaign lock: the window (409 `campaign_closed`), the child in
 * the campaign's groups (403), the lines of the answers (422 with the product) and the print number free in the
 * child's group (422 naming who has it).
 */
async function checkOrder(
  ctx: CommandRuntimeContext,
  em: EntityManager,
  campaign: OrderCampaign,
  participantPersonId: string,
  input: Omit<OrderInput, 'id'>,
): Promise<CheckedOrder> {
  const scope = { tenantId: campaign.tenantId, organizationId: campaign.organizationId }
  const { today } = await clubClock(ctx.container, scope)
  if (!ordersOpen({ status: campaign.status, closesOn: calendarDate(campaign.closesOn) }, today)) {
    await paymentsErrors.throw('campaign_closed')
  }
  const participants = await campaignParticipants(ctx.container, scope, campaign.groupIds, today, em)
  const groupId = participants.get(participantPersonId)
  if (!groupId) return paymentsErrors.throw('order_child_not_in_campaign')
  const products = await campaignProducts(em, scope, [campaign.id])
  const lines = orderLines(
    products.map((product) => ({
      id: product.id,
      kind: product.kind,
      componentProductIds: product.componentProductIds,
      sizesChild: product.sizesChild,
      sizesAdult: product.sizesAdult,
      priceChild: product.priceChild,
      priceAdult: product.priceAdult ?? null,
      requiredAnswer: product.requiredAnswer,
    })),
    { setSelected: input.setSelected, choices: input.choices },
  )
  if (!lines.ok) {
    const product = products.find((entry) => entry.id === lines.productId)
    await throwFieldError(lines.error, LINE_ERROR_FIELDS[lines.error], {
      productId: lines.productId,
      product: product?.name ?? '',
    })
  }
  const printName = campaign.askPrintName ? normalizePrintName(input.printName) : null
  const printNumber = campaign.askPrintNumber ? (input.printNumber ?? null) : null
  if (printNumber !== null) {
    const orders = await submittedOrders(em, scope, [campaign.id])
    const holder = numberHolder(
      orders.map((order) => ({
        participantPersonId: order.participantPersonId,
        printNumber: order.printNumber ?? null,
        groupId: participants.get(order.participantPersonId) ?? null,
      })),
      groupId,
      printNumber,
      participantPersonId,
    )
    if (holder) {
      const [persons, groups] = await Promise.all([
        findPersons(ctx.container, scope, [holder.participantPersonId], em),
        findGroups(ctx.container, scope, [groupId], em),
      ])
      await throwFieldError('order_print_number_taken', 'printNumber', {
        number: printNumber,
        child: persons.get(holder.participantPersonId)?.firstName ?? '',
        group: groups.get(groupId)?.name ?? '',
      })
    }
  }
  const { lines: drafts, total } = lines as Extract<typeof lines, { ok: true }>
  return { lines: drafts, total, printName, printNumber, groupId, products }
}

/**
 * 409 `order_payment_in_progress` while an online payment of the charge is still open (a checkout `created` for it):
 * a change or a cancellation now would let the provider book the old amount on a changed or cancelled charge.
 */
async function assertNoPaymentInProgress(em: EntityManager, charge: Charge): Promise<void> {
  if (!charge.payerPersonId) return
  const open = await em.find(
    Checkout,
    {
      tenantId: charge.tenantId,
      organizationId: charge.organizationId,
      payerPersonId: charge.payerPersonId,
      status: 'created',
      deletedAt: null,
    },
    { fields: ['id', 'chargeIds'] },
  )
  if (open.some((checkout) => checkout.chargeIds.includes(charge.id))) {
    await paymentsErrors.throw('order_payment_in_progress')
  }
}

function writeLines(em: EntityManager, order: Order, lines: readonly OrderLineDraft[], now: Date): void {
  for (const line of lines) {
    em.persist(
      em.create(OrderLine, {
        id: randomUUID(),
        tenantId: order.tenantId,
        organizationId: order.organizationId,
        orderId: order.id,
        productId: line.productId,
        size: line.size,
        componentSizes: line.componentSizes,
        unitPrice: line.unitPrice,
        createdAt: now,
        updatedAt: now,
      }),
    )
  }
}

/** The copy e-mail's lines: a product with its size, or the set with its products' sizes. */
function copyLines(products: readonly OrderProduct[], lines: readonly OrderLineDraft[]): OrderCopyParams['lines'] {
  const name = new Map(products.map((product) => [product.id, product.name]))
  return lines.map((line) => {
    const sizes = line.componentSizes
      ? Object.entries(line.componentSizes).map(([id, size]) => `${name.get(id) ?? ''} ${size}`)
      : line.size
        ? [line.size]
        : []
    const label = name.get(line.productId) ?? ''
    return { text: sizes.length > 0 ? `${label} (${sizes.join(', ')})` : label, amount: line.unitPrice }
  })
}

function copyOf(
  campaign: OrderCampaign,
  checked: CheckedOrder,
  childName: string,
  changed: boolean,
  email: string,
): NonNullable<OrderCommandResult['copy']> {
  // The address as entered: the order's own field may hold its encrypted value after the flush.
  return {
    email,
    params: {
      campaignId: campaign.id,
      campaignName: campaign.name,
      childName,
      lines: copyLines(checked.products, checked.lines),
      total: checked.total,
      printName: checked.printName,
      printNumber: checked.printNumber,
      closesOn: calendarDate(campaign.closesOn),
      paymentDueOn: calendarDate(campaign.paymentDueOn),
      changed,
    },
  }
}

/** Sends the copy of an order after the commit; a failure is logged, the order stands. */
async function sendCopy(ctx: CommandRuntimeContext, result: OrderCommandResult): Promise<void> {
  if (!result.copy) return
  const scope = { tenantId: result.entity.tenantId, organizationId: result.entity.organizationId }
  const personId = result.entity.orderedByPersonId
  try {
    const em = ctx.container.resolve<EntityManager>('em').fork()
    const [payerCode, contacts] = await Promise.all([
      ensurePayerCode(ctx.container, scope, personId),
      contactResolver(ctx.container).contacts([personId], { container: ctx.container, ...scope, scope: [], em }),
    ])
    const copy = result.copy
    const dispatch = ctx.container.resolve<DispatchService>('foundationDispatch')
    const { dispatchId } = await em.transactional((tx) =>
      dispatch.enqueue(
        tx,
        {
          template: 'payments.order_copy',
          params: { ...copy.params, payerCode } satisfies OrderCopyParams,
          recipients: [
            {
              personId,
              userId: null,
              email: copy.email,
              locale: contacts[0]?.locale ?? 'pl',
              reasons: ['direct'],
              channels: ['email'],
            },
          ],
          source: { module: 'payments', type: 'payments:order', id: result.entity.id },
          idempotencyKey: `payments:order-copy:${result.entity.id}:${result.entity.updatedAt.toISOString()}`,
          actor: { userId: ctx.auth?.sub ?? null, actingRole: result.actingRole },
        },
        { ...scope, scope: [], em: tx },
      ),
    )
    await dispatch.publish(dispatchId, scope)
  } catch (error: unknown) {
    logger.warn('The copy of a kit order could not be sent', { ...scope, orderId: result.entity.id, err: error })
  }
}

async function emitOrderEvent(
  eventId: 'payments.order.submitted' | 'payments.order.updated' | 'payments.order.cancelled',
  result: OrderCommandResult,
): Promise<void> {
  await emitAfterCommit(
    eventId,
    { tenantId: result.entity.tenantId, organizationId: result.entity.organizationId },
    { id: result.entity.id, campaignId: result.entity.campaignId, chargeId: result.charge.id },
  )
}

async function orderLog(result: OrderCommandResult, labelKey: string, fallback: string) {
  return {
    ...(await paymentsLog({
      result,
      resourceKind: ORDER_RESOURCE_KIND,
      labelKey,
      fallback,
      after: result.after,
      context: { via: result.via, chargeId: result.charge.id },
    })),
    // A link's input carries the raw token: keep it out of `action_logs`.
    replayable: false,
  }
}

type WithToken = { token?: string }

function tokenOf(rawInput: Record<string, unknown>): { token: string | undefined; input: Record<string, unknown> } {
  const { token, ...input } = rawInput as Record<string, unknown> & WithToken
  return { token: typeof token === 'string' ? token : undefined, input }
}

/** The submitted order behind `id` for the actor, row-locked; 404 for another campaign than the link's. */
function orderLoader(ctx: CommandRuntimeContext, actor: Actor) {
  return async (em: EntityManager, id: string, lock: { lockMode: LockMode.PESSIMISTIC_WRITE }) => {
    const tenantId = actor.via === 'app' ? trustedTenantId(ctx) : actor.scope.tenantId
    if (!tenantId) return null
    const order = await em.findOne(
      Order,
      { id, tenantId, organizationId: actor.scope.organizationId, status: 'submitted', deletedAt: null },
      lock,
    )
    if (!order || (actor.linkCampaignId !== null && order.campaignId !== actor.linkCampaignId)) return null
    return order
  }
}

const placeOrderCommand: CommandHandler<Record<string, unknown>, OrderCommandResult> = {
  id: 'payments.orders.place',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const { token, input } = tokenOf(rawInput)
    const result = await inWriteTransaction(ctx, 'payments.orders.place', async (em) => {
      const actor = await actorOf(ctx, em, token)
      const box: { actingRole?: ActingRole } = {}
      const authorized = await authorizeScoped(
        {
          input: orderPlaceSchema,
          resourceKind: ORDER_RESOURCE_KIND,
          allowedKinds: ORDER_KINDS,
          resolveTarget: (parsed) => orderTarget({ id: parsed.campaignId, ...actor.scope }, parsed.participantPersonId),
          lock: 'none',
          scopeSource: scopeSourceOf(actor),
        },
        actor.linkCampaignId ? { ...input, campaignId: actor.linkCampaignId } : input,
        ctx,
        em,
      )
      box.actingRole = authorized.actingRole
      const parsed = authorized.parsed
      const campaign = await lockedCampaign(em, actor, parsed.campaignId)
      const checked = await checkOrder(ctx, em, campaign, parsed.participantPersonId, parsed)
      const existing = await em.count(Order, {
        ...actor.scope,
        campaignId: campaign.id,
        participantPersonId: parsed.participantPersonId,
        status: 'submitted',
        deletedAt: null,
      })
      if (existing > 0) await paymentsErrors.throw('order_exists')
      const persons = await findPersons(ctx.container, actor.scope, [parsed.participantPersonId], em)
      const childName = persons.get(parsed.participantPersonId)?.firstName ?? ''
      const now = new Date()
      const orderId = randomUUID()
      const charge = em.create(Charge, {
        id: randomUUID(),
        ...actor.scope,
        sourceType: 'order',
        sourceId: orderId,
        personId: parsed.participantPersonId,
        payerPersonId: actor.personId,
        description: childName ? `${campaign.name} — ${childName}` : campaign.name,
        amount: checked.total,
        dueDate: calendarDate(campaign.paymentDueOn),
        createdAt: now,
        updatedAt: now,
      })
      em.persist(charge)
      const order = em.create(Order, {
        id: orderId,
        ...actor.scope,
        campaignId: campaign.id,
        participantPersonId: parsed.participantPersonId,
        orderedByPersonId: actor.personId,
        contactEmail: parsed.contactEmail,
        contactPhone: parsed.contactPhone,
        printName: checked.printName,
        printNumber: checked.printNumber,
        notes: campaign.notesLabel ? parsed.notes || null : null,
        chargeId: charge.id,
        submittedVia: actor.via,
        createdAt: now,
        updatedAt: now,
      })
      em.persist(order)
      writeLines(em, order, checked.lines, now)
      await em.flush()
      return {
        entity: order,
        actingRole: box.actingRole,
        before: null,
        after: snapshotOf(order, checked.total),
        charge,
        total: checked.total,
        via: actor.via,
        copy: copyOf(campaign, checked, childName, false, parsed.contactEmail),
      }
    })
    await emitAfterCommit(
      'payments.charge.created',
      { tenantId: result.entity.tenantId, organizationId: result.entity.organizationId },
      { chargeIds: [result.charge.id], sourceType: 'order' },
    )
    await emitOrderEvent('payments.order.submitted', result)
    await sendCopy(ctx, result)
    return result
  },
  buildLog: ({ result }) => orderLog(result, 'payments.audit.orders.place', 'Place a kit order'),
}

const updateOrderCommand: CommandHandler<Record<string, unknown>, OrderCommandResult> = {
  id: 'payments.orders.update',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const { token, input } = tokenOf(rawInput)
    const result = await inWriteTransaction(ctx, 'payments.orders.update', async (em) => {
      const actor = await actorOf(ctx, em, token)
      const authorized = await authorizeScoped(
        {
          input: orderUpdateSchema,
          resourceKind: ORDER_RESOURCE_KIND,
          allowedKinds: ORDER_KINDS,
          loadTarget: (parsed, lockEm, lock) => orderLoader(ctx, actor)(lockEm, parsed.id, lock),
          resolveTarget: (_parsed, entity) => orderTarget(entity as Order, (entity as Order).participantPersonId),
          scopeSource: scopeSourceOf(actor),
        },
        input,
        ctx,
        em,
      )
      const order = authorized.entity as Order
      const parsed = authorized.parsed
      const campaign = await lockedCampaign(em, actor, order.campaignId)
      const charge = (await em.findOne(
        Charge,
        { id: order.chargeId, ...actor.scope, deletedAt: null },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      )) as Charge
      const lines = await em.find(OrderLine, { ...actor.scope, orderId: order.id, deletedAt: null })
      const before = snapshotOf(order, charge.amount)
      const checked = await checkOrder(ctx, em, campaign, order.participantPersonId, parsed)
      await assertNoPaymentInProgress(em, charge)
      const paid = paidTotal(await ledgerOf(em, charge))
      if (belowPaid(checked.total, paid)) {
        await paymentsErrors.throw('order_below_paid', { paid, total: checked.total })
      }
      const now = new Date()
      order.printName = checked.printName
      order.printNumber = checked.printNumber
      order.contactEmail = parsed.contactEmail
      order.contactPhone = parsed.contactPhone
      order.notes = campaign.notesLabel ? parsed.notes || null : null
      order.updatedAt = now
      for (const line of lines) {
        line.deletedAt = now
        line.updatedAt = now
      }
      writeLines(em, order, checked.lines, now)
      charge.amount = checked.total
      charge.discountAmount = 0
      charge.status = settledStatus(charge.status, checked.total, paid)
      charge.updatedAt = now
      await em.flush()
      const persons = await findPersons(ctx.container, actor.scope, [order.participantPersonId], em)
      return {
        entity: order,
        actingRole: authorized.actingRole,
        before,
        after: snapshotOf(order, checked.total),
        charge,
        total: checked.total,
        via: actor.via,
        copy: copyOf(
          campaign,
          checked,
          persons.get(order.participantPersonId)?.firstName ?? '',
          true,
          parsed.contactEmail,
        ),
      }
    })
    await emitOrderEvent('payments.order.updated', result)
    await sendCopy(ctx, result)
    return result
  },
  buildLog: ({ result }) => orderLog(result, 'payments.audit.orders.update', 'Change a kit order'),
}

const cancelOrderCommand: CommandHandler<Record<string, unknown>, OrderCommandResult> = {
  id: 'payments.orders.cancel',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const { token, input } = tokenOf(rawInput)
    const result = await inWriteTransaction(ctx, 'payments.orders.cancel', async (em) => {
      const actor = await actorOf(ctx, em, token)
      const authorized = await authorizeScoped(
        {
          input: orderCancelSchema,
          resourceKind: ORDER_RESOURCE_KIND,
          allowedKinds: ORDER_KINDS,
          loadTarget: (parsed, lockEm, lock) => orderLoader(ctx, actor)(lockEm, parsed.id, lock),
          resolveTarget: (_parsed, entity) => orderTarget(entity as Order, (entity as Order).participantPersonId),
          scopeSource: scopeSourceOf(actor),
        },
        input,
        ctx,
        em,
      )
      const order = authorized.entity as Order
      const campaign = await lockedCampaign(em, actor, order.campaignId)
      const { today } = await clubClock(ctx.container, actor.scope)
      if (!ordersOpen({ status: campaign.status, closesOn: calendarDate(campaign.closesOn) }, today)) {
        await paymentsErrors.throw('campaign_closed')
      }
      const charge = (await em.findOne(
        Charge,
        { id: order.chargeId, ...actor.scope, deletedAt: null },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      )) as Charge
      const before = snapshotOf(order, charge.amount)
      await assertNoPaymentInProgress(em, charge)
      const paid = paidTotal(await ledgerOf(em, charge))
      if (paid > 0) await paymentsErrors.throw('order_cancel_paid', { paid })
      const now = new Date()
      order.status = 'cancelled'
      order.updatedAt = now
      charge.status = 'cancelled'
      charge.cancelledAt = now
      charge.cancelReason = CANCEL_REASON
      charge.updatedAt = now
      await em.flush()
      return {
        entity: order,
        actingRole: authorized.actingRole,
        before,
        after: snapshotOf(order, charge.amount),
        charge,
        total: charge.amount,
        via: actor.via,
        copy: null,
      }
    })
    await emitAfterCommit(
      'payments.charge.cancelled',
      { tenantId: result.entity.tenantId, organizationId: result.entity.organizationId },
      { chargeIds: [result.charge.id] },
    )
    await emitOrderEvent('payments.order.cancelled', result)
    return result
  },
  buildLog: ({ result }) => orderLog(result, 'payments.audit.orders.cancel', 'Cancel a kit order'),
}

registerCommand(placeOrderCommand)
registerCommand(updateOrderCommand)
registerCommand(cancelOrderCommand)
