// Reads of "My groups' payments", phase 4 step 10, the coach part (payments spec *Domain Vocabulary* → Group charges,
// DD-31, DD-32; REQ-033, TEST-045; issue #117 E07-S10; UX concept M-18; foundation spec REQ-F16: routes and commands
// reach the ORM only through services): the caller's groups, the charges of each group's children — membership fees
// of the group's fee schedule (per the club's "Coaches and payments" setting) and orders of campaigns covering the
// group, with their lines — what was paid on them, the group's campaigns and the cash the caller holds. Every read is
// narrowed to the trusted club scope; the caller's grants decide the groups (`groupFilterOf`).
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import type { CalendarDate, Scope } from '@vereino/core'
import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import type { GroupDirectoryEntry } from '../../groups/services/group-directory'
import { Charge, Fee, Order, OrderCampaign, OrderLine, Payment } from '../data/entities'
import { amountDueOf, remainingOf } from '../lib/charge-ledger'
import { receiptSummaries, type ReceiptSummary } from '../lib/cash'
import {
  canHandOver,
  childTotals,
  describeCharge,
  effectiveFeeAccess,
  feeChargeVisible,
  filterChildren,
  groupFilterOf,
  groupTotals,
  orderChargeVisible,
  type GroupChargeKind,
  type GroupTotals,
} from '../lib/group-charges'
import type { CampaignStatus } from '../lib/order-campaigns'
import { periodOfDate, type ChargeStatus, type CoachFeeAccess } from '../lib/payments-rules'
import { clubClock, findPersons, listGroups, rosterOn, type PaymentsScope } from './directory'
import { paidTotals } from './ledger'
import { campaignProducts } from './order-campaigns'
import { storedPaymentsSettings } from './read'

function freshEm(container: AwilixContainer): EntityManager {
  return container.resolve<EntityManager>('em').fork()
}

function calendarDate(value: unknown): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10)
}

type PersonName = { firstName: string; lastName: string }

/** The kit order behind an `order` charge, as M-18 shows it. */
export type GroupChargeOrder = {
  id: string
  campaignId: string
  campaignName: string
  campaignStatus: CampaignStatus
  lines: string[]
  handedOverAt: string | null
  canHandOver: boolean
}

/** One charge of a group's child (DD-32): amount due, due date and status — never the discount or its reason. */
export type GroupCharge = {
  id: string
  kind: GroupChargeKind
  description: string
  periodLabel: string | null
  amountDue: number
  paid: number
  remaining: number
  dueDate: CalendarDate
  status: ChargeStatus
  overdue: boolean
  collectible: boolean
  createdAt: string
  payerPersonId: string | null
  payer: PersonName | null
  order: GroupChargeOrder | null
}

export type GroupChild = PersonName & {
  personId: string
  due: number
  overdue: boolean
  payerMissing: boolean
  charges: GroupCharge[]
}

/** The coach's fee access in force for the caller (the club administrator is not bound by the setting). */
export async function feeAccessFor(
  container: AwilixContainer,
  scope: PaymentsScope,
  grants: Scope,
): Promise<{ setting: CoachFeeAccess; access: CoachFeeAccess }> {
  const settings = await storedPaymentsSettings(container, scope)
  const setting = settings?.coachFeeAccess ?? 'collect'
  return {
    setting,
    access: effectiveFeeAccess(
      setting,
      grants.some((grant) => grant.kind === 'club_admin'),
    ),
  }
}

/** The caller's groups on M-18 (`groupFilterOf`), by name; none for a scope without a coach, coordinator or admin grant. */
export function groupsOfScope(
  container: AwilixContainer,
  scope: PaymentsScope,
  grants: Scope,
  em?: EntityManager,
): Promise<GroupDirectoryEntry[]> {
  const filter = groupFilterOf(grants)
  if (filter === undefined) return Promise.resolve([])
  return listGroups(container, scope, filter, em)
}

/** The children of a group on `date`: its active `participant` memberships. */
export async function groupParticipants(
  container: AwilixContainer,
  scope: PaymentsScope,
  groupId: string,
  date: CalendarDate,
  em?: EntityManager,
): Promise<string[]> {
  const roster = await rosterOn(container, scope, groupId, date, em)
  return [...new Set(roster.filter((entry) => entry.role === 'participant').map((entry) => entry.personId))]
}

function lineText(line: OrderLine, products: ReadonlyMap<string, string>): string {
  const name = products.get(line.productId) ?? ''
  const sizes = line.size ? [line.size] : Object.values(line.componentSizes ?? {})
  return sizes.length > 0 ? `${name} (${sizes.join(', ')})` : name
}

type RawCharge = Omit<GroupCharge, 'overdue' | 'collectible' | 'payer'> & { personId: string; groupIds: string[] }

/**
 * The charges of the given children shown in the given groups (DD-32): `fee` charges of the groups' fee schedules
 * (none with `access = none`) and `order` charges of submitted orders in campaigns covering a group (not drafts), with
 * what was paid and the order lines. Each charge names the groups it belongs to; visibility is applied by the caller.
 */
async function rawCharges(
  container: AwilixContainer,
  em: EntityManager,
  scope: PaymentsScope,
  groupIds: readonly string[],
  personIds: readonly string[],
  access: CoachFeeAccess,
): Promise<RawCharge[]> {
  if (groupIds.length === 0 || personIds.length === 0) return []
  const persons = [...new Set(personIds)]
  const fees =
    access === 'none'
      ? []
      : await em.find(
          Fee,
          { ...scope, groupId: { $in: [...groupIds] }, deletedAt: null },
          { fields: ['id', 'groupId'] },
        )
  const feeGroup = new Map(fees.map((fee) => [fee.id, fee.groupId as string]))
  const feeCharges =
    fees.length === 0
      ? []
      : await findWithDecryption(
          em,
          Charge,
          {
            ...scope,
            deletedAt: null,
            sourceType: 'fee',
            sourceId: { $in: [...feeGroup.keys()] },
            personId: { $in: persons },
          },
          {},
          scope,
        )
  const groupSet = new Set(groupIds)
  const campaigns = (await em.find(OrderCampaign, { ...scope, deletedAt: null, status: { $ne: 'draft' } })).filter(
    (campaign) => campaign.groupIds.some((id) => groupSet.has(id)),
  )
  const campaignById = new Map(campaigns.map((campaign) => [campaign.id, campaign]))
  const orders =
    campaigns.length === 0
      ? []
      : await em.find(Order, {
          ...scope,
          deletedAt: null,
          status: 'submitted',
          campaignId: { $in: [...campaignById.keys()] },
          participantPersonId: { $in: persons },
        })
  const [orderCharges, lines, products] = await Promise.all([
    orders.length === 0
      ? Promise.resolve([] as Charge[])
      : findWithDecryption(
          em,
          Charge,
          { ...scope, deletedAt: null, id: { $in: orders.map((order) => order.chargeId) } },
          {},
          scope,
        ),
    orders.length === 0
      ? Promise.resolve([] as OrderLine[])
      : em.find(OrderLine, { ...scope, deletedAt: null, orderId: { $in: orders.map((order) => order.id) } }),
    campaignProducts(em, scope, [...campaignById.keys()]),
  ])
  const productNames = new Map(products.map((product) => [product.id, product.name]))
  const orderByCharge = new Map(orders.map((order) => [order.chargeId, order]))
  const paid = await paidTotals(
    container,
    scope,
    [...feeCharges, ...orderCharges].map((charge) => charge.id),
  )

  const base = (charge: Charge) => {
    const amountDue = amountDueOf(charge)
    const paidOn = paid.get(charge.id) ?? 0
    return {
      id: charge.id,
      description: charge.description,
      periodLabel: charge.periodLabel ?? null,
      amountDue,
      paid: paidOn,
      remaining: charge.status === 'cancelled' ? 0 : remainingOf(amountDue, paidOn),
      dueDate: calendarDate(charge.dueDate),
      status: charge.status,
      createdAt: charge.createdAt.toISOString(),
      payerPersonId: charge.payerPersonId ?? null,
      personId: charge.personId as string,
    }
  }
  const rows: RawCharge[] = feeCharges.map((charge) => ({
    ...base(charge),
    kind: 'fee' as const,
    groupIds: [feeGroup.get(charge.sourceId as string) as string],
    order: null,
  }))
  for (const charge of orderCharges) {
    const order = orderByCharge.get(charge.id) as Order
    const campaign = campaignById.get(order.campaignId) as OrderCampaign
    rows.push({
      ...base(charge),
      kind: 'order',
      groupIds: campaign.groupIds.filter((id) => groupSet.has(id)),
      order: {
        id: order.id,
        campaignId: campaign.id,
        campaignName: campaign.name,
        campaignStatus: campaign.status,
        lines: lines.filter((line) => line.orderId === order.id).map((line) => lineText(line, productNames)),
        handedOverAt: order.handedOverAt ? order.handedOverAt.toISOString() : null,
        canHandOver: canHandOver(campaign.status, !!order.handedOverAt),
      },
    })
  }
  return rows
}

function visible(charge: RawCharge, currentPeriod: string, access: CoachFeeAccess): boolean {
  return charge.kind === 'fee'
    ? feeChargeVisible(charge, currentPeriod, access)
    : orderChargeVisible(charge.order?.campaignStatus as CampaignStatus, charge.status)
}

/** A shown charge as M-18 returns it: without the grouping fields, with what the screen derives and the payer. */
function toGroupCharge(
  row: RawCharge,
  access: CoachFeeAccess,
  today: CalendarDate,
  payer: PersonName | null,
): GroupCharge {
  const described = describeCharge(row, access, today)
  return {
    id: row.id,
    kind: row.kind,
    description: row.description,
    periodLabel: row.periodLabel,
    amountDue: row.amountDue,
    paid: row.paid,
    remaining: row.remaining,
    dueDate: row.dueDate,
    status: row.status,
    overdue: described.overdue,
    collectible: described.collectible,
    createdAt: row.createdAt,
    payerPersonId: row.payerPersonId,
    payer,
    order: row.order,
  }
}

function byDueDate(
  a: Pick<GroupCharge, 'dueDate' | 'createdAt' | 'id'>,
  b: Pick<GroupCharge, 'dueDate' | 'createdAt' | 'id'>,
) {
  return a.dueDate.localeCompare(b.dueDate) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)
}

/**
 * The charges of one child shown in one group, oldest first: what the coach's commands may act on (cash, reminder).
 * `em` is the command's transaction; the charges are not locked here.
 */
export async function childGroupCharges(
  container: AwilixContainer,
  em: EntityManager,
  scope: PaymentsScope,
  input: { groupId: string; personId: string; access: CoachFeeAccess; today: CalendarDate },
): Promise<GroupCharge[]> {
  const rows = await rawCharges(container, em, scope, [input.groupId], [input.personId], input.access)
  const currentPeriod = periodOfDate(input.today)
  return rows
    .filter((row) => row.personId === input.personId && visible(row, currentPeriod, input.access))
    .map((row) => toGroupCharge(row, input.access, input.today, null))
    .sort(byDueDate)
}

export type GroupCampaign = {
  id: string
  name: string
  description: string | null
  status: CampaignStatus
  closesOn: CalendarDate
  /** Children of the group without an order (while the campaign collects orders). */
  missing: number
}

export type HeldCash = { items: (ReceiptSummary & { payer: PersonName | null })[]; total: number; paymentCount: number }

export type GroupChargesView = {
  today: CalendarDate
  coachFeeAccess: CoachFeeAccess
  groups: (Pick<GroupDirectoryEntry, 'id' | 'name' | 'sectionId'> & GroupTotals)[]
  groupId: string | null
  group: GroupTotals | null
  children: GroupChild[]
  campaigns: GroupCampaign[]
}

/**
 * M-18 for the caller: their groups (each with its totals, for the chips), the selected group (default the first)
 * with its children (only those with a shown charge; "To pay" keeps those with something due) and its campaigns.
 * A `groupId` outside the caller's groups selects nothing.
 */
export async function groupChargesView(
  container: AwilixContainer,
  scope: PaymentsScope,
  grants: Scope,
  query: { groupId?: string; due: boolean },
): Promise<GroupChargesView> {
  const em = freshEm(container)
  const { today } = await clubClock(container, scope)
  const { setting, access } = await feeAccessFor(container, scope, grants)
  const groups = await groupsOfScope(container, scope, grants, em)
  const participants = new Map<string, string[]>()
  for (const group of groups) participants.set(group.id, await groupParticipants(container, scope, group.id, today, em))
  const rows = await rawCharges(
    container,
    em,
    scope,
    groups.map((group) => group.id),
    [...participants.values()].flat(),
    access,
  )
  const currentPeriod = periodOfDate(today)
  const shown = rows.filter((row) => visible(row, currentPeriod, access))
  const payerIds = shown.flatMap((row) => (row.payerPersonId ? [row.payerPersonId] : []))
  const persons = await findPersons(container, scope, [...[...participants.values()].flat(), ...payerIds], em)
  const name = (id: string | null): PersonName | null => {
    const person = id ? persons.get(id) : undefined
    return person ? { firstName: person.firstName, lastName: person.lastName } : null
  }

  const childrenOf = (groupId: string): GroupChild[] =>
    (participants.get(groupId) ?? [])
      .flatMap((personId) => {
        const charges = shown
          .filter((row) => row.personId === personId && row.groupIds.includes(groupId))
          .map((row) => toGroupCharge(row, access, today, name(row.payerPersonId)))
          .sort(byDueDate)
        const person = name(personId)
        if (charges.length === 0 || !person) return []
        return [{ personId, ...person, ...childTotals(charges), charges }]
      })
      .sort(
        (a, b) =>
          a.lastName.localeCompare(b.lastName, 'pl') ||
          a.firstName.localeCompare(b.firstName, 'pl') ||
          a.personId.localeCompare(b.personId),
      )

  const selected = groups.find((group) => group.id === (query.groupId ?? groups[0]?.id)) ?? null
  const children = selected ? childrenOf(selected.id) : []
  return {
    today,
    coachFeeAccess: setting,
    groups: groups.map((group) => ({
      id: group.id,
      name: group.name,
      sectionId: group.sectionId,
      ...groupTotals(childrenOf(group.id)),
    })),
    groupId: selected?.id ?? null,
    group: selected ? groupTotals(children) : null,
    children: filterChildren(children, query.due),
    campaigns: selected ? await groupCampaigns(em, scope, selected.id, participants.get(selected.id) ?? []) : [],
  }
}

/** The group's campaigns that collect or collected orders (not drafts, not completed), with who has no order yet. */
async function groupCampaigns(
  em: EntityManager,
  scope: PaymentsScope,
  groupId: string,
  participantIds: readonly string[],
): Promise<GroupCampaign[]> {
  const campaigns = (
    await em.find(
      OrderCampaign,
      { ...scope, deletedAt: null, status: { $nin: ['draft', 'completed'] } },
      { orderBy: { closesOn: 'asc', name: 'asc' } },
    )
  ).filter((campaign) => campaign.groupIds.includes(groupId))
  if (campaigns.length === 0) return []
  const orders = await em.find(
    Order,
    { ...scope, deletedAt: null, status: 'submitted', campaignId: { $in: campaigns.map((campaign) => campaign.id) } },
    { fields: ['id', 'campaignId', 'participantPersonId'] },
  )
  return campaigns.map((campaign) => {
    const ordered = new Set(
      orders.filter((order) => order.campaignId === campaign.id).map((order) => order.participantPersonId),
    )
    return {
      id: campaign.id,
      name: campaign.name,
      description: campaign.description ?? null,
      status: campaign.status,
      closesOn: calendarDate(campaign.closesOn),
      missing: participantIds.filter((id) => !ordered.has(id)).length,
    }
  })
}

/**
 * "Cash with you" (DD-31): the live cash payments the person collected, by receipt, with the payers' names, the total
 * and the number of payments; reversed payments count for nothing. Until the treasurer's handover (E07-S11, #118) the
 * collector holds every payment they collected.
 */
export async function cashHeldBy(
  container: AwilixContainer,
  scope: PaymentsScope,
  personId: string | null,
): Promise<HeldCash> {
  if (!personId) return { items: [], total: 0, paymentCount: 0 }
  const em = freshEm(container)
  const payments = await em.find(
    Payment,
    {
      ...scope,
      deletedAt: null,
      method: 'cash',
      collectedByPersonId: personId,
      receiptNumber: { $ne: null },
      reversesPaymentId: null,
    },
    { orderBy: { createdAt: 'asc', id: 'asc' } },
  )
  if (payments.length === 0) return { items: [], total: 0, paymentCount: 0 }
  const reversals = await em.find(
    Payment,
    { ...scope, deletedAt: null, reversesPaymentId: { $in: payments.map((row) => row.id) } },
    { fields: ['id', 'reversesPaymentId'] },
  )
  const reversed = new Set(reversals.map((row) => row.reversesPaymentId as string))
  const charges = await em.find(
    Charge,
    { ...scope, id: { $in: [...new Set(payments.map((row) => row.chargeId))] } },
    { fields: ['id', 'payerPersonId'] },
  )
  const payerOf = new Map(charges.map((row) => [row.id, row.payerPersonId ?? null]))
  const summary = receiptSummaries(
    payments.map((row) => ({
      id: row.id,
      receiptNumber: row.receiptNumber as string,
      chargeId: row.chargeId,
      amount: row.amount,
      createdAt: row.createdAt.toISOString(),
    })),
    reversed,
    payerOf,
  )
  const persons = await findPersons(
    container,
    scope,
    summary.items.flatMap((item) => (item.payerPersonId ? [item.payerPersonId] : [])),
    em,
  )
  const live = summary.items.filter((item) => !item.reversed)
  return {
    items: live.map((item) => {
      const payer = item.payerPersonId ? persons.get(item.payerPersonId) : undefined
      return { ...item, payer: payer ? { firstName: payer.firstName, lastName: payer.lastName } : null }
    }),
    total: summary.total,
    paymentCount: payments.filter((row) => !reversed.has(row.id)).length,
  }
}
