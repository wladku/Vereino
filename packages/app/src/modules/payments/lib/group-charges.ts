// Pure rules of "My groups' payments", phase 4 step 10, the coach part (payments spec *Domain Vocabulary* → Group
// charges, DD-31, DD-32; REQ-033, TEST-045; issue #117 E07-S10; UX concept M-18): which groups a coach or coordinator
// sees, which charges of a group's child are shown (fees of the group's fee schedule per the club's "Coaches and
// payments" setting, orders of campaigns covering the group), whether cash may be accepted for a charge, the child's
// and the group's totals, the "To pay" filter, whose overdue charges a reminder goes to and when a kit may be handed
// over. Time is a parameter (engineering standards S3.5); nothing here reads the database.
import type { CalendarDate, Scope } from '@vereino/core'
import { OPEN_CHARGE_STATUSES, isOverdue } from './charge-ledger'
import type { CampaignStatus } from './order-campaigns'
import type { ChargeStatus, CoachFeeAccess } from './payments-rules'

/** The kinds of charge "My groups' payments" shows. */
export type GroupChargeKind = 'fee' | 'order'

/** The groups a scope covers: `null` = every group (club administrator), `undefined` = none. */
export type GroupFilter = { sectionIds: string[]; groupIds: string[] } | null | undefined

function grantIds(scope: Scope, kind: 'coordinator' | 'coach'): string[] {
  return [...new Set(scope.flatMap((grant) => (grant.kind === kind ? [...(grant.ids ?? [])] : [])))]
}

/**
 * The groups a caller sees on M-18: every group for the club administrator, the groups of a coordinator's sections and
 * the groups a coach leads (a coach grant also carries session ids, which match no group); none for anyone else.
 */
export function groupFilterOf(scope: Scope): GroupFilter {
  if (scope.some((grant) => grant.kind === 'club_admin')) return null
  const sectionIds = grantIds(scope, 'coordinator')
  const groupIds = grantIds(scope, 'coach')
  return sectionIds.length === 0 && groupIds.length === 0 ? undefined : { sectionIds, groupIds }
}

/**
 * What the club lets a coach do with membership fees (DD-32): the club administrator is not bound by the setting (it
 * is the treasurer's work, D-030); anyone else gets the club's `coach_fee_access`.
 */
export function effectiveFeeAccess(setting: CoachFeeAccess, clubAdmin: boolean): CoachFeeAccess {
  return clubAdmin ? 'collect' : setting
}

/**
 * A membership fee charge is shown while something remains to pay on it (current period or overdue), and the current
 * period's charge also once paid; a cancelled or forfeited charge never. Nothing with `coach_fee_access = none`.
 */
export function feeChargeVisible(
  charge: { status: ChargeStatus; periodLabel: string | null; remaining: number },
  currentPeriod: string,
  access: CoachFeeAccess,
): boolean {
  if (access === 'none' || charge.status === 'cancelled' || charge.status === 'forfeited') return false
  return (OPEN_CHARGE_STATUSES.includes(charge.status) && charge.remaining > 0) || charge.periodLabel === currentPeriod
}

/**
 * An order charge is shown once the campaign collects orders (not a draft), until the campaign is completed and the
 * charge paid; a cancelled charge (a cancelled order) never.
 */
export function orderChargeVisible(campaignStatus: CampaignStatus, chargeStatus: ChargeStatus): boolean {
  if (campaignStatus === 'draft' || chargeStatus === 'cancelled' || chargeStatus === 'forfeited') return false
  return !(campaignStatus === 'completed' && chargeStatus === 'paid')
}

export type CoachCashRefusal = 'coach_fee_cash_disabled' | 'charge_payer_missing'

/**
 * Why cash may not be accepted for a shown charge, or null: a membership fee only with `coach_fee_access = collect`
 * (403), and never a charge without a payer — "a matter for the treasurer" (422). Paid charges are refused later by
 * the shared cash rules (`cashRefusal`).
 */
export function coachCashRefusal(
  charge: { kind: GroupChargeKind; payerPersonId: string | null },
  access: CoachFeeAccess,
): CoachCashRefusal | null {
  if (charge.kind === 'fee' && access !== 'collect') return 'coach_fee_cash_disabled'
  return charge.payerPersonId ? null : 'charge_payer_missing'
}

export type GroupChargeLine = {
  kind: GroupChargeKind
  status: ChargeStatus
  dueDate: CalendarDate
  remaining: number
  payerPersonId: string | null
}

/** A shown charge with what the screen derives: overdue and whether "Accept cash" may select it. */
export function describeCharge<T extends GroupChargeLine>(
  charge: T,
  access: CoachFeeAccess,
  today: CalendarDate,
): T & { overdue: boolean; collectible: boolean } {
  return {
    ...charge,
    overdue: isOverdue(charge, today),
    collectible: charge.remaining > 0 && coachCashRefusal(charge, access) === null,
  }
}

export type ChildTotals = { due: number; overdue: boolean; payerMissing: boolean }

/** A child's total still to pay, whether any charge is overdue and whether a charge with something due has no payer. */
export function childTotals(
  charges: readonly { remaining: number; overdue: boolean; payerPersonId: string | null }[],
): ChildTotals {
  return {
    due: charges.reduce((sum, charge) => sum + charge.remaining, 0),
    overdue: charges.some((charge) => charge.overdue),
    payerMissing: charges.some((charge) => charge.remaining > 0 && !charge.payerPersonId),
  }
}

export type GroupTotals = { totalDue: number; peopleToPay: number; peopleOverdue: number }

/** The group card: the total due, how many children have something to pay and how many have an overdue charge. */
export function groupTotals(children: readonly Pick<ChildTotals, 'due' | 'overdue'>[]): GroupTotals {
  return {
    totalDue: children.reduce((sum, child) => sum + child.due, 0),
    peopleToPay: children.filter((child) => child.due > 0).length,
    peopleOverdue: children.filter((child) => child.overdue).length,
  }
}

/** "Everyone" keeps every child with a shown charge; "To pay" only those with something due. */
export function filterChildren<T extends { due: number }>(children: readonly T[], dueOnly: boolean): T[] {
  return dueOnly ? children.filter((child) => child.due > 0) : [...children]
}

/** The overdue charges with a payer, by payer, in the order given: one reminder per payer ("Send reminder"). */
export function overdueByPayer<T extends { overdue: boolean; remaining: number; payerPersonId: string | null }>(
  charges: readonly T[],
): Map<string, T[]> {
  const byPayer = new Map<string, T[]>()
  for (const charge of charges) {
    if (!charge.overdue || charge.remaining <= 0 || !charge.payerPersonId) continue
    byPayer.set(charge.payerPersonId, [...(byPayer.get(charge.payerPersonId) ?? []), charge])
  }
  return byPayer
}

/** The campaign stages after the delivery, when kits are at the club and may be handed over. */
export const HAND_OVER_STATUSES: readonly CampaignStatus[] = ['delivered', 'completed']

export type HandOverRefusal = 'order_not_delivered' | 'order_already_handed_over' | 'order_unpaid_confirm_required'

/**
 * Why a kit may not be handed over, or null: not before the delivery (409), not twice (409), and an unpaid kit only
 * after the warning was confirmed (409 until `confirmUnpaid`; the charge stays open).
 */
export function handOverRefusal(input: {
  campaignStatus: CampaignStatus
  handedOver: boolean
  remaining: number
  confirmUnpaid: boolean
}): HandOverRefusal | null {
  if (!HAND_OVER_STATUSES.includes(input.campaignStatus)) return 'order_not_delivered'
  if (input.handedOver) return 'order_already_handed_over'
  return input.remaining > 0 && !input.confirmUnpaid ? 'order_unpaid_confirm_required' : null
}

/** A child's order with its campaign may be handed over now (the row action is shown). */
export function canHandOver(campaignStatus: CampaignStatus, handedOver: boolean): boolean {
  return HAND_OVER_STATUSES.includes(campaignStatus) && !handedOver
}
