// Reads of order campaigns for the `payments` routes and commands (payments spec REQ-032, DD-30; issue #115, B-30…
// B-32; foundation spec REQ-F16: routes reach the ORM only through services): a campaign with its products, the
// children its groups cover today, its submitted orders with their totals and what was paid, the KPIs, the Orders and
// No order tabs and the supplier summary. Every read is narrowed to the trusted club scope.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import type { CalendarDate } from '@vereino/core'
import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { Charge, Order, OrderCampaign, OrderLine, OrderProduct } from '../data/entities'
import { closeExpiredCampaigns } from '../data/queries'
import { emitPaymentsEvent } from '../events'
import { amountDueOf, remainingOf } from '../lib/charge-ledger'
import {
  campaignKpis,
  nextAction,
  supplierSummary,
  type CampaignAction,
  type CampaignKpis,
  type CampaignStatus,
  type ProductKind,
  type SupplierSummary,
} from '../lib/order-campaigns'
import { clubClock, findGroups, findPersons, findSections, rosterOn, type PaymentsScope } from './directory'
import { paidTotals } from './ledger'

function freshEm(container: AwilixContainer): EntityManager {
  return container.resolve<EntityManager>('em').fork()
}

function calendarDate(value: unknown): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10)
}

/** One live campaign of the club, or null. */
export function findCampaign(
  container: AwilixContainer,
  scope: PaymentsScope,
  id: string,
  em?: EntityManager,
): Promise<OrderCampaign | null> {
  return (em ?? freshEm(container)).findOne(OrderCampaign, { id, ...scope, deletedAt: null })
}

/** The live products of campaigns, in form order. */
export function campaignProducts(
  em: EntityManager,
  scope: PaymentsScope,
  campaignIds: readonly string[],
): Promise<OrderProduct[]> {
  if (campaignIds.length === 0) return Promise.resolve([])
  return em.find(
    OrderProduct,
    { ...scope, campaignId: { $in: [...campaignIds] }, deletedAt: null },
    { orderBy: { campaignId: 'asc', sort: 'asc' } },
  )
}

/**
 * The children a campaign covers on `date`: the persons with an active `participant` membership in one of its groups,
 * each with the first of its groups (in the campaign's order) they belong to.
 */
export async function campaignParticipants(
  container: AwilixContainer,
  scope: PaymentsScope,
  groupIds: readonly string[],
  date: CalendarDate,
  em?: EntityManager,
): Promise<Map<string, string>> {
  const byPerson = new Map<string, string>()
  for (const groupId of groupIds) {
    const roster = await rosterOn(container, scope, groupId, date, em)
    for (const entry of roster) {
      if (entry.role === 'participant' && !byPerson.has(entry.personId)) byPerson.set(entry.personId, groupId)
    }
  }
  return byPerson
}

/** The submitted orders of campaigns, oldest first. */
export function submittedOrders(
  em: EntityManager,
  scope: PaymentsScope,
  campaignIds: readonly string[],
): Promise<Order[]> {
  if (campaignIds.length === 0) return Promise.resolve([])
  return em.find(
    Order,
    { ...scope, campaignId: { $in: [...campaignIds] }, status: 'submitted', deletedAt: null },
    { orderBy: { createdAt: 'asc' } },
  )
}

type OrderMoney = { total: number; paid: number; chargeStatus: string | null }

/** The amount due and what was paid on each order's charge. */
async function orderMoney(
  container: AwilixContainer,
  em: EntityManager,
  scope: PaymentsScope,
  orders: readonly Order[],
): Promise<Map<string, OrderMoney>> {
  const chargeIds = orders.map((order) => order.chargeId)
  const [charges, paid] = await Promise.all([
    chargeIds.length === 0
      ? Promise.resolve([] as Charge[])
      : em.find(
          Charge,
          { ...scope, id: { $in: chargeIds }, deletedAt: null },
          { fields: ['id', 'amount', 'discountAmount', 'status'] },
        ),
    paidTotals(container, scope, chargeIds),
  ])
  const byCharge = new Map(charges.map((charge) => [charge.id, charge]))
  return new Map(
    orders.map((order) => {
      const charge = byCharge.get(order.chargeId)
      return [
        order.id,
        {
          total: charge ? amountDueOf(charge) : 0,
          paid: paid.get(order.chargeId) ?? 0,
          chargeStatus: charge?.status ?? null,
        },
      ]
    }),
  )
}

/** The B-30/B-32 KPIs of each campaign (children counted on the club's today). */
export async function campaignsKpis(
  container: AwilixContainer,
  scope: PaymentsScope,
  campaigns: readonly Pick<OrderCampaign, 'id' | 'groupIds'>[],
): Promise<Map<string, CampaignKpis>> {
  const em = freshEm(container)
  const { today } = await clubClock(container, scope)
  const orders = await submittedOrders(
    em,
    scope,
    campaigns.map((campaign) => campaign.id),
  )
  const money = await orderMoney(container, em, scope, orders)
  const result = new Map<string, CampaignKpis>()
  for (const campaign of campaigns) {
    const participants = await campaignParticipants(container, scope, campaign.groupIds, today, em)
    const own = orders.filter((order) => order.campaignId === campaign.id)
    result.set(
      campaign.id,
      campaignKpis(
        participants.size,
        own.map((order) => ({
          total: money.get(order.id)?.total ?? 0,
          paid: money.get(order.id)?.paid ?? 0,
          handedOver: order.handedOverAt != null,
        })),
      ),
    )
  }
  return result
}

/** The names of the sections and groups of campaigns. */
export async function campaignNames(
  container: AwilixContainer,
  scope: PaymentsScope,
  campaigns: readonly Pick<OrderCampaign, 'sectionId' | 'groupIds'>[],
): Promise<{ sections: Map<string, string>; groups: Map<string, string> }> {
  const [sections, groups] = await Promise.all([
    findSections(
      container,
      scope,
      campaigns.map((campaign) => campaign.sectionId),
    ),
    findGroups(
      container,
      scope,
      campaigns.flatMap((campaign) => campaign.groupIds),
    ),
  ])
  return {
    sections: new Map([...sections.values()].map((section) => [section.id, section.name])),
    groups: new Map([...groups.values()].map((group) => [group.id, group.name])),
  }
}

export type ProductView = {
  id: string
  name: string
  kind: ProductKind
  componentProductIds: string[]
  sizesChild: string[]
  sizesAdult: string[]
  priceChild: number
  priceAdult: number | null
  requiredAnswer: boolean
  /** The product is on a placed order, so the form cannot remove it. */
  used: boolean
}

export type CampaignDetail = {
  id: string
  name: string
  description: string | null
  sectionId: string
  sectionName: string | null
  groups: { id: string; name: string | null }[]
  closesOn: string
  paymentDueOn: string
  status: CampaignStatus
  nextAction: CampaignAction | null
  askPrintName: boolean
  askPrintNumber: boolean
  notesLabel: string | null
  supplierName: string | null
  products: ProductView[]
  kpis: CampaignKpis
  createdAt: string
  updatedAt: string
}

/** The product ids among `productIds` that a submitted order uses. */
export async function usedProductIds(
  em: EntityManager,
  scope: PaymentsScope,
  campaignId: string,
  productIds: readonly string[],
): Promise<Set<string>> {
  if (productIds.length === 0) return new Set()
  const orders = await em.find(
    Order,
    { ...scope, campaignId, status: 'submitted', deletedAt: null },
    { fields: ['id'] },
  )
  if (orders.length === 0) return new Set()
  const lines = await em.find(
    OrderLine,
    {
      ...scope,
      orderId: { $in: orders.map((order) => order.id) },
      productId: { $in: [...productIds] },
      deletedAt: null,
    },
    { fields: ['id', 'productId'] },
  )
  return new Set(lines.map((line) => line.productId))
}

/** B-31/B-32: one campaign with its products, names, next action and KPIs; null when unknown. */
export async function campaignDetail(
  container: AwilixContainer,
  scope: PaymentsScope,
  id: string,
): Promise<CampaignDetail | null> {
  const em = freshEm(container)
  const campaign = await findCampaign(container, scope, id, em)
  if (!campaign) return null
  const products = await campaignProducts(em, scope, [campaign.id])
  const [used, names, kpis] = await Promise.all([
    usedProductIds(
      em,
      scope,
      campaign.id,
      products.map((product) => product.id),
    ),
    campaignNames(container, scope, [campaign]),
    campaignsKpis(container, scope, [campaign]),
  ])
  return {
    id: campaign.id,
    name: campaign.name,
    description: campaign.description ?? null,
    sectionId: campaign.sectionId,
    sectionName: names.sections.get(campaign.sectionId) ?? null,
    groups: campaign.groupIds.map((groupId) => ({ id: groupId, name: names.groups.get(groupId) ?? null })),
    closesOn: calendarDate(campaign.closesOn),
    paymentDueOn: calendarDate(campaign.paymentDueOn),
    status: campaign.status,
    nextAction: nextAction(campaign.status),
    askPrintName: campaign.askPrintName,
    askPrintNumber: campaign.askPrintNumber,
    notesLabel: campaign.notesLabel ?? null,
    supplierName: campaign.supplierName ?? null,
    products: products.map((product) => ({
      id: product.id,
      name: product.name,
      kind: product.kind,
      componentProductIds: [...product.componentProductIds],
      sizesChild: Array.from(product.sizesChild),
      sizesAdult: Array.from(product.sizesAdult),
      priceChild: product.priceChild,
      priceAdult: product.priceAdult ?? null,
      requiredAnswer: product.requiredAnswer,
      used: used.has(product.id),
    })),
    kpis: kpis.get(campaign.id) as CampaignKpis,
    createdAt: campaign.createdAt.toISOString(),
    updatedAt: campaign.updatedAt.toISOString(),
  }
}

type PersonName = { firstName: string; lastName: string } | null

export type CampaignOrderRow = {
  id: string
  participantPersonId: string
  participant: PersonName
  groupId: string | null
  groupName: string | null
  orderedBy: PersonName
  printName: string | null
  printNumber: number | null
  lines: { productId: string; productName: string; size: string | null; sizes: string | null; unitPrice: number }[]
  total: number
  paid: number
  remaining: number
  chargeId: string
  chargeStatus: string | null
  handedOver: boolean
  createdAt: string
}

/** B-32 "Orders": the campaign's submitted orders with the child, group, lines, total, paid and handover. */
export async function campaignOrders(
  container: AwilixContainer,
  scope: PaymentsScope,
  campaign: OrderCampaign,
): Promise<CampaignOrderRow[]> {
  const em = freshEm(container)
  const orders = await findWithDecryption(
    em,
    Order,
    { ...scope, campaignId: campaign.id, status: 'submitted', deletedAt: null },
    { orderBy: { createdAt: 'asc' } },
    scope,
  )
  if (orders.length === 0) return []
  const { today } = await clubClock(container, scope)
  const [products, lines, money, participants, names] = await Promise.all([
    campaignProducts(em, scope, [campaign.id]),
    em.find(OrderLine, { ...scope, orderId: { $in: orders.map((order) => order.id) }, deletedAt: null }),
    orderMoney(container, em, scope, orders),
    campaignParticipants(container, scope, campaign.groupIds, today, em),
    campaignNames(container, scope, [campaign]),
  ])
  const persons = await findPersons(
    container,
    scope,
    orders.flatMap((order) => [order.participantPersonId, order.orderedByPersonId]),
  )
  const nameOf = (personId: string): PersonName => {
    const person = persons.get(personId)
    return person ? { firstName: person.firstName, lastName: person.lastName } : null
  }
  const productName = new Map(products.map((product) => [product.id, product.name]))
  return orders.map((order) => {
    const groupId = participants.get(order.participantPersonId) ?? null
    const own = money.get(order.id) as OrderMoney
    return {
      id: order.id,
      participantPersonId: order.participantPersonId,
      participant: nameOf(order.participantPersonId),
      groupId,
      groupName: groupId ? (names.groups.get(groupId) ?? null) : null,
      orderedBy: nameOf(order.orderedByPersonId),
      printName: order.printName ?? null,
      printNumber: order.printNumber ?? null,
      lines: lines
        .filter((line) => line.orderId === order.id)
        .map((line) => ({
          productId: line.productId,
          productName: productName.get(line.productId) ?? '',
          size: line.size ?? null,
          sizes: line.componentSizes
            ? Object.entries(line.componentSizes)
                .map(([productId, size]) => `${productName.get(productId) ?? ''}: ${size}`)
                .join(', ')
            : null,
          unitPrice: line.unitPrice,
        })),
      total: own.total,
      paid: own.paid,
      remaining: remainingOf(own.total, own.paid),
      chargeId: order.chargeId,
      chargeStatus: own.chargeStatus,
      handedOver: order.handedOverAt != null,
      createdAt: order.createdAt.toISOString(),
    }
  })
}

export type MissingChildRow = { personId: string; participant: PersonName; groupId: string; groupName: string | null }

/** The children a campaign covers today without a submitted order, by group order then name. */
export async function campaignMissing(
  container: AwilixContainer,
  scope: PaymentsScope,
  campaign: OrderCampaign,
  groupId?: string,
  em?: EntityManager,
): Promise<MissingChildRow[]> {
  const reader = em ?? freshEm(container)
  const { today } = await clubClock(container, scope)
  const [participants, orders] = await Promise.all([
    campaignParticipants(container, scope, campaign.groupIds, today, reader),
    submittedOrders(reader, scope, [campaign.id]),
  ])
  const ordered = new Set(orders.map((order) => order.participantPersonId))
  const missing = [...participants.entries()].filter(
    ([personId, group]) => !ordered.has(personId) && (!groupId || group === groupId),
  )
  const [persons, names] = await Promise.all([
    findPersons(
      container,
      scope,
      missing.map(([personId]) => personId),
      reader,
    ),
    campaignNames(container, scope, [campaign]),
  ])
  const groupOrder = new Map(campaign.groupIds.map((id, index) => [id, index]))
  return missing
    .map(([personId, group]) => {
      const person = persons.get(personId)
      return {
        personId,
        participant: person ? { firstName: person.firstName, lastName: person.lastName } : null,
        groupId: group,
        groupName: names.groups.get(group) ?? null,
      }
    })
    .sort(
      (a, b) =>
        (groupOrder.get(a.groupId) ?? 0) - (groupOrder.get(b.groupId) ?? 0) ||
        (a.participant?.lastName ?? '').localeCompare(b.participant?.lastName ?? '') ||
        (a.participant?.firstName ?? '').localeCompare(b.participant?.firstName ?? ''),
    )
}

/** B-32 "Supplier summary": units per product and size and the print rows of the submitted orders. */
export async function campaignSummary(
  container: AwilixContainer,
  scope: PaymentsScope,
  campaign: OrderCampaign,
): Promise<SupplierSummary> {
  const em = freshEm(container)
  const orders = await submittedOrders(em, scope, [campaign.id])
  const { today } = await clubClock(container, scope)
  const [products, lines, participants, names] = await Promise.all([
    campaignProducts(em, scope, [campaign.id]),
    orders.length === 0
      ? Promise.resolve([] as OrderLine[])
      : em.find(OrderLine, { ...scope, orderId: { $in: orders.map((order) => order.id) }, deletedAt: null }),
    campaignParticipants(container, scope, campaign.groupIds, today, em),
    campaignNames(container, scope, [campaign]),
  ])
  return supplierSummary(
    products.map((product) => ({
      id: product.id,
      name: product.name,
      kind: product.kind,
      componentProductIds: product.componentProductIds,
      sizesChild: product.sizesChild,
      sizesAdult: product.sizesAdult,
      sort: product.sort,
    })),
    orders.map((order) => {
      const groupId = participants.get(order.participantPersonId)
      return {
        printName: order.printName ?? null,
        printNumber: order.printNumber ?? null,
        groupName: groupId ? (names.groups.get(groupId) ?? null) : null,
        lines: lines
          .filter((line) => line.orderId === order.id)
          .map((line) => ({
            productId: line.productId,
            size: line.size ?? null,
            componentSizes: line.componentSizes ?? null,
          })),
      }
    }),
  )
}

/**
 * One run of `payments:close-order-campaigns` for a club (payments spec *Events* row; REQ-032, #115): every `open`
 * campaign past the end of its orders deadline (in the club's calendar) becomes `closed`, and each emits
 * `payments.order_campaign.status_changed` after the commit.
 */
export async function closeOrderCampaigns(
  container: AwilixContainer,
  scope: PaymentsScope,
): Promise<{ closed: string[] }> {
  const { today } = await clubClock(container, scope)
  const closed = await closeExpiredCampaigns(freshEm(container), scope, today)
  for (const id of closed) {
    await emitPaymentsEvent(
      'payments.order_campaign.status_changed',
      { id, status: 'closed', from: 'open', ...scope },
      { persistent: true, ...scope },
    )
  }
  return { closed }
}
