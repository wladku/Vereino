// Reads of a guardian's kit orders (payments spec REQ-032, REQ-002, DD-30; issue #116, M-16, M-17, M-19; foundation
// spec REQ-F16: routes reach the ORM only through services): the campaigns covering the caller's children with each
// child's state, and the order form of one campaign — its products, the caller's children in its groups, the numbers
// taken in their groups, their orders with what was paid, the contact defaults and the transfer instructions. Every
// read is narrowed to the trusted club scope; the children are the caller's own grants, never the input's.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { contactResolver } from '@/modules/foundation'
import { Order, OrderCampaign, OrderLine } from '../data/entities'
import { remainingOf } from '../lib/charge-ledger'
import type { CampaignStatus, ProductKind } from '../lib/order-campaigns'
import {
  answersOfLines,
  childOrderState,
  defaultPrintName,
  ordersOpen,
  takenNumbers,
  type ChildOrderState,
} from '../lib/orders'
import { clubClock, findPersons, type PaymentsScope } from './directory'
import {
  campaignNames,
  campaignParticipants,
  campaignProducts,
  orderMoney,
  submittedOrders,
  type OrderMoney,
} from './order-campaigns'
import { transferInstructions, type TransferInstructions } from './payer-overview'

/** The stages in which a guardian sees a campaign (a draft is not shown; a completed one is over). */
export const GUARDIAN_CAMPAIGN_STATUSES: readonly CampaignStatus[] = ['open', 'closed', 'ordered', 'delivered']

function freshEm(container: AwilixContainer): EntityManager {
  return container.resolve<EntityManager>('em').fork()
}

function calendarDate(value: unknown): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10)
}

/** The children by first name, then id: a stable order whatever order the grants listed them in. */
function byFirstName<T>(
  entries: readonly T[],
  persons: ReadonlyMap<string, { firstName: string }>,
  idOf: (entry: T) => string,
): T[] {
  return [...entries].sort(
    (a, b) =>
      (persons.get(idOf(a))?.firstName ?? '').localeCompare(persons.get(idOf(b))?.firstName ?? '') ||
      idOf(a).localeCompare(idOf(b)),
  )
}

export type MyCampaignChild = {
  personId: string
  firstName: string
  groupName: string | null
  state: ChildOrderState
  orderId: string | null
  total: number
  remaining: number
}

export type MyCampaignItem = {
  id: string
  name: string
  description: string | null
  closesOn: string
  paymentDueOn: string
  status: CampaignStatus
  ordersOpen: boolean
  children: MyCampaignChild[]
}

/**
 * M-16: the campaigns in a guardian's stages that cover a group of the caller's children (or of the caller, an adult
 * participant), each child with its state — not ordered, to pay, paid or picked up — by orders deadline, latest first.
 */
export async function myOrderCampaigns(
  container: AwilixContainer,
  scope: PaymentsScope,
  personIds: readonly string[],
): Promise<MyCampaignItem[]> {
  const em = freshEm(container)
  const { today } = await clubClock(container, scope)
  const campaigns = await em.find(
    OrderCampaign,
    { ...scope, deletedAt: null, status: { $in: [...GUARDIAN_CAMPAIGN_STATUSES] } },
    { orderBy: { closesOn: 'desc', id: 'asc' } },
  )
  const covered: { campaign: OrderCampaign; children: Map<string, string> }[] = []
  for (const campaign of campaigns) {
    const participants = await campaignParticipants(container, scope, campaign.groupIds, today, em)
    const children = new Map(
      [...new Set(personIds)].flatMap((id) => {
        const groupId = participants.get(id)
        return groupId ? [[id, groupId] as const] : []
      }),
    )
    if (children.size > 0) covered.push({ campaign, children })
  }
  if (covered.length === 0) return []
  const orders = (
    await submittedOrders(
      em,
      scope,
      covered.map((entry) => entry.campaign.id),
    )
  ).filter((order) => personIds.includes(order.participantPersonId))
  const [money, persons, names] = await Promise.all([
    orderMoney(container, em, scope, orders),
    findPersons(container, scope, personIds, em),
    campaignNames(
      container,
      scope,
      covered.map((entry) => entry.campaign),
    ),
  ])
  return covered.map(({ campaign, children }) => ({
    id: campaign.id,
    name: campaign.name,
    description: campaign.description ?? null,
    closesOn: calendarDate(campaign.closesOn),
    paymentDueOn: calendarDate(campaign.paymentDueOn),
    status: campaign.status,
    ordersOpen: ordersOpen({ status: campaign.status, closesOn: calendarDate(campaign.closesOn) }, today),
    children: byFirstName([...children.entries()], persons, ([personId]) => personId).map(([personId, groupId]) => {
      const order = orders.find((row) => row.campaignId === campaign.id && row.participantPersonId === personId)
      const own = order ? (money.get(order.id) as OrderMoney) : null
      return {
        personId,
        firstName: persons.get(personId)?.firstName ?? '',
        groupName: names.groups.get(groupId) ?? null,
        state: childOrderState(
          order && own ? { chargeStatus: own.chargeStatus, handedOver: order.handedOverAt != null } : null,
        ),
        orderId: order?.id ?? null,
        total: own?.total ?? 0,
        remaining: own ? remainingOf(own.total, own.paid) : 0,
      }
    }),
  }))
}

export type OrderFormProduct = {
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

export type OrderFormChild = {
  personId: string
  firstName: string
  lastName: string
  groupId: string
  groupName: string | null
  defaultPrintName: string
  /** The print numbers other children of the group already took. */
  takenNumbers: number[]
}

export type OrderFormOrder = {
  id: string
  participantPersonId: string
  setSelected: boolean
  choices: Record<string, string>
  printName: string | null
  printNumber: number | null
  contactEmail: string | null
  contactPhone: string | null
  notes: string | null
  lines: { productId: string; productName: string; size: string | null; sizes: string | null; unitPrice: number }[]
  total: number
  paid: number
  remaining: number
  chargeId: string
  state: ChildOrderState
  updatedAt: string
}

export type OrderFormView = {
  campaign: {
    id: string
    name: string
    description: string | null
    closesOn: string
    paymentDueOn: string
    status: CampaignStatus
    ordersOpen: boolean
    askPrintName: boolean
    askPrintNumber: boolean
    notesLabel: string | null
  }
  products: OrderFormProduct[]
  children: OrderFormChild[]
  orders: OrderFormOrder[]
  contact: { email: string | null; phone: string | null }
  transfer: TransferInstructions | null
}

/**
 * M-17 and M-19: the order form of `campaign` for the person ordering. `personIds` are the persons the caller may
 * order for (their wards, and themself); only those in the campaign's groups today are listed, each with the numbers
 * other children of its group took. The contact defaults to the caller's address and their latest order's phone.
 */
export async function orderFormView(
  container: AwilixContainer,
  scope: PaymentsScope,
  campaign: OrderCampaign,
  ordererPersonId: string,
  personIds: readonly string[],
): Promise<OrderFormView> {
  const em = freshEm(container)
  const { today } = await clubClock(container, scope)
  const [participants, products, names, all] = await Promise.all([
    campaignParticipants(container, scope, campaign.groupIds, today, em),
    campaignProducts(em, scope, [campaign.id]),
    campaignNames(container, scope, [campaign]),
    findWithDecryption(
      em,
      Order,
      { ...scope, campaignId: campaign.id, status: 'submitted', deletedAt: null },
      { orderBy: { createdAt: 'asc' } },
      scope,
    ),
  ])
  const candidates = [...new Set(personIds)].filter((id) => participants.has(id))
  const holders = all.map((order) => ({
    participantPersonId: order.participantPersonId,
    printNumber: order.printNumber ?? null,
    groupId: participants.get(order.participantPersonId) ?? null,
  }))
  const own = all.filter((order) => candidates.includes(order.participantPersonId))
  const [persons, money, lines, contacts, transfer] = await Promise.all([
    findPersons(container, scope, candidates, em),
    orderMoney(container, em, scope, own),
    own.length === 0
      ? Promise.resolve([] as OrderLine[])
      : em.find(OrderLine, { ...scope, orderId: { $in: own.map((order) => order.id) }, deletedAt: null }),
    contactResolver(container).contacts([ordererPersonId], { container, ...scope, scope: [], em }),
    transferInstructions(container, { scope, personId: ordererPersonId, wardIds: [] }),
  ])
  const childIds = byFirstName(candidates, persons, (id) => id)
  const productName = new Map(products.map((product) => [product.id, product.name]))
  const latest = [...all].reverse().find((order) => order.orderedByPersonId === ordererPersonId)
  return {
    campaign: {
      id: campaign.id,
      name: campaign.name,
      description: campaign.description ?? null,
      closesOn: calendarDate(campaign.closesOn),
      paymentDueOn: calendarDate(campaign.paymentDueOn),
      status: campaign.status,
      ordersOpen: ordersOpen({ status: campaign.status, closesOn: calendarDate(campaign.closesOn) }, today),
      askPrintName: campaign.askPrintName,
      askPrintNumber: campaign.askPrintNumber,
      notesLabel: campaign.notesLabel ?? null,
    },
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
    })),
    children: childIds.map((personId) => {
      const groupId = participants.get(personId) as string
      const person = persons.get(personId)
      return {
        personId,
        firstName: person?.firstName ?? '',
        lastName: person?.lastName ?? '',
        groupId,
        groupName: names.groups.get(groupId) ?? null,
        defaultPrintName: defaultPrintName(person?.firstName ?? ''),
        takenNumbers: takenNumbers(holders, groupId, personId),
      }
    }),
    orders: own.map((order) => {
      const orderLines = lines.filter((line) => line.orderId === order.id)
      const answers = answersOfLines(
        products,
        orderLines.map((line) => ({
          productId: line.productId,
          size: line.size ?? null,
          componentSizes: line.componentSizes ?? null,
        })),
      )
      const paid = money.get(order.id) as OrderMoney
      return {
        id: order.id,
        participantPersonId: order.participantPersonId,
        setSelected: answers.setSelected,
        choices: answers.choices,
        printName: order.printName ?? null,
        printNumber: order.printNumber ?? null,
        contactEmail: order.contactEmail ?? null,
        contactPhone: order.contactPhone ?? null,
        notes: order.notes ?? null,
        lines: orderLines.map((line) => ({
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
        total: paid.total,
        paid: paid.paid,
        remaining: remainingOf(paid.total, paid.paid),
        chargeId: order.chargeId,
        state: childOrderState({ chargeStatus: paid.chargeStatus, handedOver: order.handedOverAt != null }),
        updatedAt: order.updatedAt.toISOString(),
      }
    }),
    contact: { email: latest?.contactEmail ?? contacts[0]?.email ?? null, phone: latest?.contactPhone ?? null },
    transfer,
  }
}
