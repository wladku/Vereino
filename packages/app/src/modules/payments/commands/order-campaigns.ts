// `payments.order_campaigns.create|update|transition|remind` (payments spec *Domain Vocabulary* → Order campaign,
// API rows `/api/payments/order-campaigns*`; REQ-032, DD-30; issue #115, B-31, B-32). The club administrator builds
// the kit order form — section and groups, deadlines, personalisation, products with sizes and prices, one set — and
// moves it through its stages one at a time (409 `order_campaign_transition_invalid` out of order). The form is
// editable in `draft` and `open` only; a price change leaves placed orders as they are (their lines keep the price)
// and a product used in an order cannot be removed (409 `order_product_in_use`). "Remind everyone" e-mails the
// guardians of the children still without an order through the foundation dispatch.
//
// None of them is undoable: the products are a nested aggregate that placed orders point at, a transition is a stage
// of a real-world process (supplier order, delivery) and a reminder is an e-mail already sent. Each is audited.
import { randomUUID } from 'node:crypto'
import type { EntityManager } from '@mikro-orm/postgresql'
import type { z } from 'zod'
import { registerCommand, type CommandHandler, type CommandRuntimeContext } from '@open-mercato/shared/lib/commands'
import { isCrudHttpError } from '@open-mercato/shared/lib/crud/errors'
import type { Recipient, Scope } from '@vereino/core'
import { authorizeScoped, contactResolver, type DispatchService, type TargetLock } from '@/modules/foundation'
import { paymentsErrors } from '../api/errors'
import { OrderCampaign, OrderProduct } from '../data/entities'
import {
  orderCampaignCreateSchema,
  orderCampaignRemindSchema,
  orderCampaignTransitionSchema,
  orderCampaignUpdateSchema,
  type orderProductInputSchema,
} from '../data/validators'
import type { OrderReminderParams } from '../emails/templates'
import type { PaymentsErrorCode } from '../lib/error-codes'
import {
  campaignDateErrors,
  isCampaignEditable,
  productsError,
  removedProductIds,
  transitionTarget,
  type CampaignStatus,
  type ProductKind,
} from '../lib/order-campaigns'
import { activeGuardians, clubClock, findGroups, findSections, type PaymentsScope } from '../services/directory'
import { campaignMissing, campaignProducts, usedProductIds } from '../services/order-campaigns'
import {
  PAYMENTS_WRITE_KINDS,
  clubTarget,
  emitAfterCommit,
  emitPaymentsSideEffects,
  inWriteTransaction,
  paymentsEvents,
  paymentsLog,
  trustedTenantId,
  type PaymentsCommandResult,
} from './shared'

export const ORDER_CAMPAIGN_RESOURCE_KIND = 'payments.order_campaign'

export const orderCampaignEvents = paymentsEvents<OrderCampaign>('order_campaign')

type ProductSnapshot = {
  id: string
  name: string
  kind: ProductKind
  componentProductIds: string[]
  sizesChild: string[]
  sizesAdult: string[]
  priceChild: number
  priceAdult: number | null
  requiredAnswer: boolean
}

export type OrderCampaignSnapshot = {
  id: string
  tenantId: string
  organizationId: string
  name: string
  description: string | null
  sectionId: string
  groupIds: string[]
  closesOn: string
  paymentDueOn: string
  status: CampaignStatus
  askPrintName: boolean
  askPrintNumber: boolean
  notesLabel: string | null
  supplierName: string | null
  products: ProductSnapshot[]
}

export type OrderCampaignCommandResult = PaymentsCommandResult<OrderCampaign, OrderCampaignSnapshot> & {
  after: OrderCampaignSnapshot
  /** The stage before the command, when it changed. */
  statusFrom: CampaignStatus | null
}

function calendarDate(value: unknown): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10)
}

function snapshotOf(row: OrderCampaign, products: readonly OrderProduct[]): OrderCampaignSnapshot {
  return {
    id: row.id,
    tenantId: row.tenantId,
    organizationId: row.organizationId,
    name: row.name,
    description: row.description ?? null,
    sectionId: row.sectionId,
    groupIds: [...row.groupIds],
    closesOn: calendarDate(row.closesOn),
    paymentDueOn: calendarDate(row.paymentDueOn),
    status: row.status,
    askPrintName: row.askPrintName,
    askPrintNumber: row.askPrintNumber,
    notesLabel: row.notesLabel ?? null,
    supplierName: row.supplierName ?? null,
    products: products
      .filter((product) => !product.deletedAt)
      .map((product) => ({
        id: product.id,
        name: product.name,
        kind: product.kind,
        componentProductIds: [...product.componentProductIds],
        sizesChild: [...product.sizesChild],
        sizesAdult: [...product.sizesAdult],
        priceChild: product.priceChild,
        priceAdult: product.priceAdult ?? null,
        requiredAnswer: product.requiredAnswer,
      })),
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

type ProductInput = z.output<typeof orderProductInputSchema>

type CampaignForm = {
  sectionId: string
  groupIds: string[]
  closesOn: string
  paymentDueOn: string
  products: {
    id?: string
    key: string
    kind: ProductKind
    componentKeys: string[]
    sizesAdult: string[]
    priceAdult?: number | null
  }[]
}

const PRODUCT_ERROR_CODES: Record<NonNullable<ReturnType<typeof productsError>>, PaymentsErrorCode> = {
  set_too_many: 'order_set_too_many',
  set_too_small: 'order_set_too_small',
  set_component_invalid: 'order_set_component_invalid',
  adult_price_missing: 'order_adult_price_missing',
}

/**
 * 422 unless the form is consistent: the deadlines (the orders deadline not in the past when set or changed, the
 * payment deadline not before it), the products (one set of at least two of them, adult prices) and a live section
 * whose live groups are every selected group.
 */
async function assertForm(
  ctx: CommandRuntimeContext,
  em: EntityManager,
  scope: PaymentsScope,
  form: CampaignForm,
  checkPast: boolean,
): Promise<void> {
  const { today } = await clubClock(ctx.container, scope)
  const dates = campaignDateErrors(form, today, checkPast)
  if (dates.closesOn) await throwFieldError('order_closes_on_past', 'closesOn')
  if (dates.paymentDueOn) await throwFieldError('order_payment_due_before_close', 'paymentDueOn')
  const productError = productsError(
    form.products.map((product) => ({
      key: product.key,
      kind: product.kind,
      componentKeys: product.componentKeys,
      sizesAdult: product.sizesAdult,
      priceAdult: product.priceAdult ?? null,
    })),
  )
  if (productError) await throwFieldError(PRODUCT_ERROR_CODES[productError], 'products')
  const sections = await findSections(ctx.container, scope, [form.sectionId], em)
  if (!sections.has(form.sectionId)) await throwFieldError('order_section_unknown', 'sectionId')
  const groups = await findGroups(ctx.container, scope, form.groupIds, em)
  if (form.groupIds.some((id) => groups.get(id)?.sectionId !== form.sectionId)) {
    await throwFieldError('order_groups_invalid', 'groupIds')
  }
}

/**
 * Writes the form's products onto the campaign: a sent product with a known id is changed (a price change does not
 * touch placed orders, whose lines keep their price), any other is created, and a stored product no longer sent is
 * removed — 409 `order_product_in_use` when a placed order uses it. A set's products are resolved from their keys.
 */
async function writeProducts(
  em: EntityManager,
  campaign: OrderCampaign,
  inputs: readonly ProductInput[],
  existing: readonly OrderProduct[],
): Promise<OrderProduct[]> {
  const scope = { tenantId: campaign.tenantId, organizationId: campaign.organizationId }
  const byId = new Map(existing.map((product) => [product.id, product]))
  const idOfKey = new Map(
    inputs.map((input) => [input.key, input.id && byId.has(input.id) ? input.id : randomUUID()] as const),
  )
  const removed = removedProductIds(
    existing.map((product) => product.id),
    inputs.flatMap((input) => (input.id && byId.has(input.id) ? [input.id] : [])),
  )
  if (removed.length > 0) {
    const used = await usedProductIds(em, scope, campaign.id, removed)
    if (used.size > 0) await throwFieldError('order_product_in_use', 'products')
  }
  const now = new Date()
  for (const id of removed) {
    const product = byId.get(id) as OrderProduct
    product.deletedAt = now
    product.updatedAt = now
  }
  const written: OrderProduct[] = []
  inputs.forEach((input, sort) => {
    const id = idOfKey.get(input.key) as string
    const fields = {
      name: input.name,
      kind: input.kind,
      componentProductIds:
        input.kind === 'set' ? input.componentKeys.map((key) => idOfKey.get(key) as string) : ([] as string[]),
      sizesChild: input.kind === 'set' ? [] : input.sizesChild,
      sizesAdult: input.kind === 'set' ? [] : input.sizesAdult,
      priceChild: input.priceChild,
      priceAdult: input.kind === 'set' ? null : (input.priceAdult ?? null),
      requiredAnswer: input.requiredAnswer,
      sort,
    }
    const current = byId.get(id)
    if (current) {
      Object.assign(current, fields, { updatedAt: now })
      written.push(current)
    } else {
      const product = em.create(OrderProduct, {
        id,
        ...scope,
        campaignId: campaign.id,
        ...fields,
        createdAt: now,
        updatedAt: now,
      })
      em.persist(product)
      written.push(product)
    }
  })
  return written
}

function loader(ctx: CommandRuntimeContext) {
  return (em: EntityManager, id: string, lock: TargetLock): Promise<OrderCampaign | null> => {
    const tenantId = trustedTenantId(ctx)
    if (!tenantId) return Promise.resolve(null)
    return em.findOne(OrderCampaign, { id, tenantId, deletedAt: null }, lock)
  }
}

/** The caller's own person (the `self` grant). */
function selfPersonId(scope: Scope): string | null {
  return scope.find((grant) => grant.kind === 'self')?.ids?.[0] ?? null
}

function campaignLog(result: OrderCampaignCommandResult, labelKey: string, fallback: string) {
  return paymentsLog({
    result,
    resourceKind: ORDER_CAMPAIGN_RESOURCE_KIND,
    labelKey,
    fallback,
    after: result.after,
    context: result.statusFrom ? { statusFrom: result.statusFrom, status: result.entity.status } : undefined,
  })
}

async function emitStatusChanged(result: OrderCampaignCommandResult): Promise<void> {
  if (!result.statusFrom) return
  await emitAfterCommit(
    'payments.order_campaign.status_changed',
    { tenantId: result.entity.tenantId, organizationId: result.entity.organizationId },
    { id: result.entity.id, status: result.entity.status, from: result.statusFrom },
  )
}

const createCampaignCommand: CommandHandler<Record<string, unknown>, OrderCampaignCommandResult> = {
  id: 'payments.order_campaigns.create',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const id = randomUUID()
    const result = await inWriteTransaction(ctx, 'payments.order_campaigns.create', async (em) => {
      const authorized = await authorizeScoped(
        {
          input: orderCampaignCreateSchema,
          resourceKind: ORDER_CAMPAIGN_RESOURCE_KIND,
          allowedKinds: PAYMENTS_WRITE_KINDS,
          resolveTarget: (_parsed, _entity, scope) => clubTarget({ id, ...scope }),
        },
        rawInput,
        ctx,
        em,
      )
      const { parsed, tenantId, organizationId } = authorized
      const scope = { tenantId, organizationId }
      await assertForm(ctx, em, scope, parsed, true)
      const now = new Date()
      const row = em.create(OrderCampaign, {
        id,
        ...scope,
        name: parsed.name,
        description: parsed.description ?? null,
        sectionId: parsed.sectionId,
        groupIds: parsed.groupIds,
        closesOn: parsed.closesOn,
        paymentDueOn: parsed.paymentDueOn,
        status: parsed.open ? 'open' : 'draft',
        askPrintName: parsed.askPrintName,
        askPrintNumber: parsed.askPrintNumber,
        notesLabel: parsed.notesLabel || null,
        supplierName: parsed.supplierName || null,
        createdByPersonId: selfPersonId(authorized.scope),
        createdAt: now,
        updatedAt: now,
      })
      em.persist(row)
      const products = await writeProducts(em, row, parsed.products, [])
      await em.flush()
      return {
        entity: row,
        actingRole: authorized.actingRole,
        before: null,
        after: snapshotOf(row, products),
        statusFrom: parsed.open ? ('draft' as const) : null,
      }
    })
    await emitPaymentsSideEffects(ctx, result.entity, 'created', orderCampaignEvents)
    await emitStatusChanged(result)
    return result
  },
  buildLog: ({ result }) => campaignLog(result, 'payments.audit.orderCampaigns.create', 'Create an order campaign'),
}

const updateCampaignCommand: CommandHandler<Record<string, unknown>, OrderCampaignCommandResult> = {
  id: 'payments.order_campaigns.update',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const result = await inWriteTransaction(ctx, 'payments.order_campaigns.update', async (em) => {
      const authorized = await authorizeScoped(
        {
          input: orderCampaignUpdateSchema,
          resourceKind: ORDER_CAMPAIGN_RESOURCE_KIND,
          allowedKinds: PAYMENTS_WRITE_KINDS,
          loadTarget: (parsed, lockEm, lock) => loader(ctx)(lockEm, parsed.id, lock),
          resolveTarget: (_parsed, entity) => clubTarget(entity as OrderCampaign),
        },
        rawInput,
        ctx,
        em,
      )
      const row = authorized.entity as OrderCampaign
      const parsed = authorized.parsed
      const scope = { tenantId: row.tenantId, organizationId: row.organizationId }
      if (!isCampaignEditable(row.status)) await paymentsErrors.throw('order_campaign_not_editable')
      const existing = await campaignProducts(em, scope, [row.id])
      const before = snapshotOf(row, existing)
      await assertForm(ctx, em, scope, parsed, parsed.closesOn !== before.closesOn)
      const statusFrom = parsed.open && row.status === 'draft' ? row.status : null
      row.name = parsed.name
      row.description = parsed.description ?? null
      row.sectionId = parsed.sectionId
      row.groupIds = parsed.groupIds
      row.closesOn = parsed.closesOn
      row.paymentDueOn = parsed.paymentDueOn
      row.askPrintName = parsed.askPrintName
      row.askPrintNumber = parsed.askPrintNumber
      row.notesLabel = parsed.notesLabel || null
      row.supplierName = parsed.supplierName || null
      if (statusFrom) row.status = 'open'
      row.updatedAt = new Date()
      const products = await writeProducts(em, row, parsed.products, existing)
      await em.flush()
      return {
        entity: row,
        actingRole: authorized.actingRole,
        before,
        after: snapshotOf(row, products),
        statusFrom,
      }
    })
    await emitPaymentsSideEffects(ctx, result.entity, 'updated', orderCampaignEvents)
    await emitStatusChanged(result)
    return result
  },
  buildLog: ({ result }) => campaignLog(result, 'payments.audit.orderCampaigns.update', 'Change an order campaign'),
}

const transitionCampaignCommand: CommandHandler<Record<string, unknown>, OrderCampaignCommandResult> = {
  id: 'payments.order_campaigns.transition',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const result = await inWriteTransaction(ctx, 'payments.order_campaigns.transition', async (em) => {
      const authorized = await authorizeScoped(
        {
          input: orderCampaignTransitionSchema,
          resourceKind: ORDER_CAMPAIGN_RESOURCE_KIND,
          allowedKinds: PAYMENTS_WRITE_KINDS,
          loadTarget: (parsed, lockEm, lock) => loader(ctx)(lockEm, parsed.id, lock),
          resolveTarget: (_parsed, entity) => clubTarget(entity as OrderCampaign),
        },
        rawInput,
        ctx,
        em,
      )
      const row = authorized.entity as OrderCampaign
      const target = transitionTarget(authorized.parsed.action, row.status)
      if (!target) {
        await paymentsErrors.throw('order_campaign_transition_invalid', {
          status: row.status,
          action: authorized.parsed.action,
        })
      }
      const products = await campaignProducts(em, { tenantId: row.tenantId, organizationId: row.organizationId }, [
        row.id,
      ])
      const before = snapshotOf(row, products)
      row.status = target as CampaignStatus
      row.updatedAt = new Date()
      await em.flush()
      return {
        entity: row,
        actingRole: authorized.actingRole,
        before,
        after: snapshotOf(row, products),
        statusFrom: before.status,
      }
    })
    await emitStatusChanged(result)
    return result
  },
  buildLog: ({ result }) =>
    campaignLog(result, 'payments.audit.orderCampaigns.transition', 'Move an order campaign to its next stage'),
}

export type OrderCampaignRemindResult = PaymentsCommandResult<OrderCampaign, null> & {
  children: number
  recipients: number
  dispatchId: string | null
  scope: PaymentsScope
}

const remindCampaignCommand: CommandHandler<Record<string, unknown>, OrderCampaignRemindResult> = {
  id: 'payments.order_campaigns.remind',
  isUndoable: false,
  async execute(rawInput, ctx) {
    const result = await inWriteTransaction(ctx, 'payments.order_campaigns.remind', async (em) => {
      const authorized = await authorizeScoped(
        {
          input: orderCampaignRemindSchema,
          resourceKind: ORDER_CAMPAIGN_RESOURCE_KIND,
          allowedKinds: PAYMENTS_WRITE_KINDS,
          loadTarget: (parsed, lockEm, lock) => loader(ctx)(lockEm, parsed.id, lock),
          resolveTarget: (_parsed, entity) => clubTarget(entity as OrderCampaign),
          // A reminder changes nothing on the campaign, so it needs no lock token.
          lock: 'none',
        },
        rawInput,
        ctx,
        em,
      )
      const row = authorized.entity as OrderCampaign
      const scope = { tenantId: row.tenantId, organizationId: row.organizationId }
      if (row.status !== 'open') await paymentsErrors.throw('order_campaign_not_collecting')
      const missing = await campaignMissing(ctx.container, scope, row, authorized.parsed.groupId, em)
      const { today } = await clubClock(ctx.container, scope)
      const wardIds = missing.map((child) => child.personId)
      const guardians = await activeGuardians(ctx.container, scope, wardIds, today, em)
      // An adult participant without a guardian is reminded in person.
      const personIds = [...new Set(wardIds.flatMap((id) => guardians.get(id) ?? [id]))]
      const resolverCtx = { container: ctx.container, ...scope, scope: authorized.scope, em }
      const contacts = personIds.length > 0 ? await contactResolver(ctx.container).contacts(personIds, resolverCtx) : []
      const recipients: Recipient[] = contacts.flatMap((contact) =>
        contact.email
          ? [
              {
                personId: contact.personId,
                userId: contact.userId,
                email: contact.email,
                locale: contact.locale,
                reasons: ['direct'],
                channels: ['email'],
              },
            ]
          : [],
      )
      const params: OrderReminderParams = {
        campaignId: row.id,
        campaignName: row.name,
        closesOn: calendarDate(row.closesOn),
      }
      const dispatchId =
        recipients.length > 0
          ? (
              await ctx.container.resolve<DispatchService>('foundationDispatch').enqueue(
                em,
                {
                  template: 'payments.order_reminder',
                  params,
                  recipients,
                  source: { module: 'payments', type: 'payments:order_campaign', id: row.id },
                  // Each "Remind everyone" is its own send.
                  idempotencyKey: `payments:order-reminder:${row.id}:${randomUUID()}`,
                  actor: { userId: ctx.auth?.sub ?? null, actingRole: authorized.actingRole },
                },
                { ...scope, scope: authorized.scope, em },
              )
            ).dispatchId
          : null
      return {
        entity: row,
        actingRole: authorized.actingRole,
        before: null,
        children: missing.length,
        recipients: recipients.length,
        dispatchId,
        scope,
      }
    })
    if (result.dispatchId) {
      await ctx.container.resolve<DispatchService>('foundationDispatch').publish(result.dispatchId, result.scope)
    }
    return result
  },
  buildLog: ({ result }) =>
    paymentsLog({
      result,
      resourceKind: ORDER_CAMPAIGN_RESOURCE_KIND,
      labelKey: 'payments.audit.orderCampaigns.remind',
      fallback: 'Remind guardians without an order',
      after: null,
      context: { children: result.children, recipients: result.recipients },
    }),
}

registerCommand(createCampaignCommand)
registerCommand(updateCampaignCommand)
registerCommand(transitionCampaignCommand)
registerCommand(remindCampaignCommand)
