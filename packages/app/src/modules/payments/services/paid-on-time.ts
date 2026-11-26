// `payments.paidOnTime` (E27-S03, #820): the "Paid on time" leading indicator of the pilot report, registered as an
// optional DI service `activities` reads with `hasRegistration` (`activities/services/pilot-indicators.ts`). With
// `payments` disabled the token is absent and the report hides the indicator instead of showing 0.
//
// Per section among `sectionIds`: the `fee` and `order` charges due in the period and how many were fully paid by
// their due date (`lib/paid-on-time.ts`). A `fee` charge belongs to the section of its fee's group or activity, an
// `order` charge to its order campaign's section. Counts only; every query carries the caller's tenant and
// organization, and the caller has already narrowed `sectionIds` to its record scope.
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import type { CalendarDate } from '@vereino/core'
import type { PaidOnTimeReader } from '../../activities/services/pilot-indicators'
import { Charge, Fee, Order, OrderCampaign, Payment } from '../data/entities'
import { ON_TIME_SOURCE_TYPES, countPaidOnTime, type OnTimeCharge, type OnTimeCounts } from '../lib/paid-on-time'
import { findActivities, findGroups, type PaymentsScope } from './directory'

export const PAYMENTS_PAID_ON_TIME = 'payments.paidOnTime' as const

/** The section of each `fee` and `order` charge source: fee id or order id → section id. */
async function sourceSections(
  container: AwilixContainer,
  em: EntityManager,
  scope: PaymentsScope,
  charges: readonly { sourceType: string; sourceId?: string | null }[],
): Promise<Map<string, string>> {
  const feeIds = [...new Set(charges.filter((c) => c.sourceType === 'fee').map((c) => c.sourceId ?? ''))].filter(
    Boolean,
  )
  const orderIds = [...new Set(charges.filter((c) => c.sourceType === 'order').map((c) => c.sourceId ?? ''))].filter(
    Boolean,
  )
  const [fees, orders] = await Promise.all([
    feeIds.length === 0
      ? Promise.resolve([] as Fee[])
      : em.find(Fee, { ...scope, id: { $in: feeIds } }, { fields: ['id', 'groupId', 'activityId'] }),
    orderIds.length === 0
      ? Promise.resolve([] as Order[])
      : em.find(Order, { ...scope, id: { $in: orderIds } }, { fields: ['id', 'campaignId'] }),
  ])
  const campaignIds = [...new Set(orders.map((order) => order.campaignId))]
  const [groups, activities, campaigns] = await Promise.all([
    findGroups(container, scope, fees.map((fee) => fee.groupId ?? '').filter(Boolean), em),
    findActivities(container, scope, fees.map((fee) => fee.activityId ?? '').filter(Boolean), em),
    campaignIds.length === 0
      ? Promise.resolve([] as OrderCampaign[])
      : em.find(OrderCampaign, { ...scope, id: { $in: campaignIds } }, { fields: ['id', 'sectionId'] }),
  ])
  const sections = new Map<string, string>()
  for (const fee of fees) {
    const section =
      (fee.groupId ? groups.get(fee.groupId)?.sectionId : null) ??
      (fee.activityId ? activities.get(fee.activityId)?.sectionId : null)
    if (section) sections.set(fee.id, section)
  }
  const campaignSection = new Map(campaigns.map((campaign) => [campaign.id, campaign.sectionId]))
  for (const order of orders) {
    const section = campaignSection.get(order.campaignId)
    if (section) sections.set(order.id, section)
  }
  return sections
}

export function createPaidOnTime(container: AwilixContainer): PaidOnTimeReader {
  return {
    async paidOnTime(scope, sectionIds, period, today: CalendarDate) {
      const result = new Map<string, OnTimeCounts>(sectionIds.map((id) => [id, { count: 0, total: 0 }]))
      if (sectionIds.length === 0) return result
      const em = container.resolve<EntityManager>('em').fork()
      const charges = await em.find(
        Charge,
        {
          ...scope,
          deletedAt: null,
          sourceType: { $in: [...ON_TIME_SOURCE_TYPES] },
          status: { $ne: 'cancelled' },
          dueDate: { $gte: period.from, $lte: period.to },
        },
        { fields: ['id', 'sourceType', 'sourceId', 'status', 'amount', 'discountAmount', 'dueDate'] },
      )
      if (charges.length === 0) return result
      const sections = await sourceSections(container, em, scope, charges)
      const inReach = charges.filter((charge) => result.has(sections.get(charge.sourceId ?? '') ?? ''))
      const payments =
        inReach.length === 0
          ? []
          : await em.find(
              Payment,
              { ...scope, deletedAt: null, chargeId: { $in: inReach.map((charge) => charge.id) } },
              { fields: ['chargeId', 'amount', 'paidOn', 'isOverpayment'] },
            )
      const paymentsOf = new Map<string, OnTimeCharge['payments'][number][]>()
      for (const payment of payments) {
        const list = paymentsOf.get(payment.chargeId) ?? []
        list.push({ amount: payment.amount, paidOn: payment.paidOn, isOverpayment: payment.isOverpayment })
        paymentsOf.set(payment.chargeId, list)
      }
      const bySection = new Map<string, OnTimeCharge[]>()
      for (const charge of inReach) {
        const section = sections.get(charge.sourceId ?? '') as string
        const list = bySection.get(section) ?? []
        list.push({
          sourceType: charge.sourceType,
          status: charge.status,
          amount: charge.amount,
          discountAmount: charge.discountAmount,
          dueDate: charge.dueDate,
          payments: paymentsOf.get(charge.id) ?? [],
        })
        bySection.set(section, list)
      }
      for (const [section, list] of bySection) result.set(section, countPaidOnTime(list, today))
      return result
    },
  }
}
