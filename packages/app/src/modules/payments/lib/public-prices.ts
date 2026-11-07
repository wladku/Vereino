// The prices block of the public section page (payments spec REQ-026, TEST-038; club spec DD-28, Q-024; issue #112,
// E07-S05): for each public group of the section, the fee schedules valid on the club's today — amount in grosz and
// period — and the sibling discount that covers the fee's period. Only what a guest may see: no fee or rule name, no
// custom discount (those name persons), no charge. Pure: the rows and the club's today are passed in.
import { isActiveAt, type CalendarDate } from '@vereino/core'
import { FEE_PERIODS, type DiscountConditions, type DiscountKind, type FeePeriod } from './payments-rules'

/** A fee schedule row as the provider reads it. */
export type PublicFeeRow = {
  groupId: string | null
  amount: number
  period: FeePeriod
  validFrom: CalendarDate
  validTo: CalendarDate | null
}

/** A discount rule row as the provider reads it. */
export type PublicDiscountRuleRow = {
  kind: DiscountKind
  percent: number | null
  conditions: DiscountConditions
  validFrom: CalendarDate
  validTo: CalendarDate | null
}

/** One fee on a group card: grosz, the period and the sibling discount in whole percent (null without one). */
export type PublicFee = {
  amount: number
  currency: 'PLN'
  period: FeePeriod
  siblingDiscountPercent: number | null
}

export type PublicGroupPrices = { groupId: string; fees: PublicFee[] }

/** The `prices` block of a section page; null when no public group has a valid fee. */
export type PublicPricesBlock = { groups: PublicGroupPrices[] }

/** The most favorable sibling percent valid today for a fee period, or null. */
export function siblingPercentFor(
  rules: readonly PublicDiscountRuleRow[],
  period: FeePeriod,
  today: CalendarDate,
): number | null {
  let best: number | null = null
  for (const rule of rules) {
    if (rule.kind !== 'sibling' || rule.percent === null) continue
    if (!rule.conditions.feePeriods.includes(period)) continue
    if (!isActiveAt({ validFrom: rule.validFrom, validTo: rule.validTo }, today)) continue
    if (best === null || rule.percent > best) best = rule.percent
  }
  return best
}

/**
 * The prices of the public groups, in the groups' order: each group's fees valid today, ordered by period
 * (monthly, one-off, per session) and amount; a group without a valid fee is left out.
 */
export function publicPricesBlock(
  groupIds: readonly string[],
  fees: readonly PublicFeeRow[],
  rules: readonly PublicDiscountRuleRow[],
  today: CalendarDate,
): PublicPricesBlock | null {
  const groups: PublicGroupPrices[] = []
  for (const groupId of new Set(groupIds)) {
    const own = fees
      .filter((fee) => fee.groupId === groupId && isActiveAt({ validFrom: fee.validFrom, validTo: fee.validTo }, today))
      .sort((a, b) => FEE_PERIODS.indexOf(a.period) - FEE_PERIODS.indexOf(b.period) || a.amount - b.amount)
    if (own.length === 0) continue
    groups.push({
      groupId,
      fees: own.map((fee) => ({
        amount: fee.amount,
        currency: 'PLN',
        period: fee.period,
        siblingDiscountPercent: siblingPercentFor(rules, fee.period, today),
      })),
    })
  }
  return groups.length > 0 ? { groups } : null
}
