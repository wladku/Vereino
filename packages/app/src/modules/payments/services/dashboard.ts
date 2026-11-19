// The B-01 payment widgets' read (README B-01; payments spec REQ-011, #111; payments parity spec REQ-C09, phase 7,
// #297 E12-S07), narrowed to the trusted club scope; routes reach the ORM only through services (REQ-F16):
// - "Overdue": what remains on `open` and `partially_paid` charges past their due date in the club's calendar, how many
//   charges, how many families (distinct payers) and how many have no payer;
// - "Charges without a payer": how many open charges have `payer_missing`, the first five (description, period,
//   person) and how many more;
// - "Bank statements and cash": the transfers waiting for a decision ("To confirm" and "Unmatched"; only for a caller
//   who imports statements) and the charges holding an online overpayment to refund;
// - "Order campaigns": each running campaign (neither draft nor completed) with its orders, children, paid and value
//   (only for a caller who manages order campaigns).
// `paymentsDashboardCounts` is the lean read of spec N's menu counts: two indexed counts, no list and no decryption.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { findWithDecryption } from '@open-mercato/shared/lib/encryption/find'
import { BankTransaction, Charge, OrderCampaign } from '../data/entities'
import { OPEN_CHARGE_STATUSES, amountDueOf, remainingOf } from '../lib/charge-ledger'
import {
  BANK_TO_DECIDE_STATUSES,
  RUNNING_CAMPAIGN_STATUSES,
  WITHOUT_PAYER_LIST_LIMIT,
  moreCount,
} from '../lib/dashboard'
import type { CampaignStatus } from '../lib/order-campaigns'
import { overdueSummary } from '../lib/payer-summary'
import { clubClock, findPersons, type PaymentsScope } from './directory'
import { chargesToRefund, paidTotals } from './ledger'
import { campaignsKpis } from './order-campaigns'

function freshEm(container: AwilixContainer): EntityManager {
  return container.resolve<EntityManager>('em').fork()
}

/** The blocks a caller's features unlock: the bank block with `payments.bank.import`, campaigns with `.orders.manage`. */
export type DashboardFeatures = { bank: boolean; campaigns: boolean }

export type WithoutPayerItem = {
  id: string
  description: string
  period: string | null
  person: { firstName: string; lastName: string } | null
}

export type DashboardCampaign = {
  id: string
  name: string
  status: CampaignStatus
  orders: number
  children: number
  paid: number
  value: number
}

export type PaymentsDashboard = {
  overdue: { total: number; charges: number; families: number; withoutPayer: number }
  withoutPayer: { charges: number; items: WithoutPayerItem[]; more: number }
  toRefund: { count: number }
  bank?: { toDecide: number }
  campaigns?: DashboardCampaign[]
  campaignsRunning?: number
}

export type PaymentsDashboardCounts = {
  bank?: { toDecide: number }
  campaignsRunning?: number
}

/** The statement transfers of the club waiting for the treasurer's decision. */
function countToDecide(em: EntityManager, scope: PaymentsScope): Promise<number> {
  return em.count(BankTransaction, { ...scope, deletedAt: null, status: { $in: [...BANK_TO_DECIDE_STATUSES] } })
}

/** The club's running order campaigns, the one closing first on top. */
function runningCampaigns(em: EntityManager, scope: PaymentsScope) {
  return em.find(
    OrderCampaign,
    { ...scope, deletedAt: null, status: { $in: [...RUNNING_CAMPAIGN_STATUSES] } },
    { fields: ['id', 'name', 'status', 'groupIds', 'closesOn'], orderBy: { closesOn: 'asc', id: 'asc' } },
  )
}

async function overdueBlock(container: AwilixContainer, scope: PaymentsScope, em: EntityManager) {
  const { today } = await clubClock(container, scope)
  const rows = await em.find(
    Charge,
    { ...scope, deletedAt: null, status: { $in: [...OPEN_CHARGE_STATUSES] }, dueDate: { $lt: today } },
    { fields: ['id', 'amount', 'discountAmount', 'payerPersonId', 'payerMissing'] },
  )
  const paid = await paidTotals(
    container,
    scope,
    rows.map((row) => row.id),
  )
  return overdueSummary(
    rows.map((row) => ({
      payerPersonId: row.payerPersonId ?? null,
      payerMissing: row.payerMissing,
      remaining: remainingOf(amountDueOf(row), paid.get(row.id) ?? 0),
    })),
  )
}

async function withoutPayerBlock(container: AwilixContainer, scope: PaymentsScope, em: EntityManager) {
  const where = { ...scope, deletedAt: null, status: { $in: [...OPEN_CHARGE_STATUSES] }, payerMissing: true }
  const [charges, rows] = await Promise.all([
    em.count(Charge, where),
    findWithDecryption(
      em,
      Charge,
      where,
      {
        fields: ['id', 'description', 'periodLabel', 'personId'],
        orderBy: { dueDate: 'asc', id: 'asc' },
        limit: WITHOUT_PAYER_LIST_LIMIT,
      },
      scope,
    ),
  ])
  const persons = await findPersons(
    container,
    scope,
    rows.flatMap((row) => (row.personId ? [row.personId] : [])),
  )
  const items = rows.map((row): WithoutPayerItem => {
    const person = row.personId ? persons.get(row.personId) : undefined
    return {
      id: row.id,
      description: row.description,
      period: row.periodLabel ?? null,
      person: person ? { firstName: person.firstName, lastName: person.lastName } : null,
    }
  })
  return { charges, items, more: moreCount(charges, items.length) }
}

async function campaignsBlock(container: AwilixContainer, scope: PaymentsScope, em: EntityManager) {
  const campaigns = await runningCampaigns(em, scope)
  const kpis = await campaignsKpis(container, scope, campaigns)
  return campaigns.map((campaign): DashboardCampaign => {
    const kpi = kpis.get(campaign.id)
    return {
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      orders: kpi?.orders ?? 0,
      children: kpi?.children ?? 0,
      paid: kpi?.paid ?? 0,
      value: kpi?.value ?? 0,
    }
  })
}

/** The B-01 payment widgets for the club; the bank and campaign blocks only with their features. */
export async function paymentsDashboard(
  container: AwilixContainer,
  scope: PaymentsScope,
  features: DashboardFeatures,
): Promise<PaymentsDashboard> {
  const [overdue, withoutPayer, toRefund, toDecide, campaigns] = await Promise.all([
    overdueBlock(container, scope, freshEm(container)),
    withoutPayerBlock(container, scope, freshEm(container)),
    chargesToRefund(container, scope),
    features.bank ? countToDecide(freshEm(container), scope) : Promise.resolve(null),
    features.campaigns ? campaignsBlock(container, scope, freshEm(container)) : Promise.resolve(null),
  ])
  const result: PaymentsDashboard = { overdue, withoutPayer, toRefund: { count: toRefund.length } }
  if (toDecide !== null) result.bank = { toDecide }
  if (campaigns !== null) {
    result.campaigns = campaigns
    result.campaignsRunning = campaigns.length
  }
  return result
}

/** Spec N's menu counts: the transfers to decide and the running campaigns, each only with its feature. */
export async function paymentsDashboardCounts(
  container: AwilixContainer,
  scope: PaymentsScope,
  features: DashboardFeatures,
): Promise<PaymentsDashboardCounts> {
  const [toDecide, running] = await Promise.all([
    features.bank ? countToDecide(freshEm(container), scope) : Promise.resolve(null),
    features.campaigns
      ? freshEm(container).count(OrderCampaign, {
          ...scope,
          deletedAt: null,
          status: { $in: [...RUNNING_CAMPAIGN_STATUSES] },
        })
      : Promise.resolve(null),
  ])
  const result: PaymentsDashboardCounts = {}
  if (toDecide !== null) result.bank = { toDecide }
  if (running !== null) result.campaignsRunning = running
  return result
}
