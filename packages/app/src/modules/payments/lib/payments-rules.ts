// Pure rules of the `payments` module, phase 4 step 2 (payments spec *Domain Vocabulary* → Fee schedule, Sibling
// discount, Charge; REQ-011, REQ-018; issue #108): the fee periods, the discount kinds and their conditions, the
// "Coaches and payments" setting, the charge statuses and the billing period `YYYY-MM`. Time is a parameter
// (engineering standards S3.5); nothing here reads the database.
import { periodsOverlap, type CalendarDate } from '@vereino/core'

/** `monthly` (one charge per month), `one_off` (one charge in all, e.g. a camp) or `per_occurrence` (per session). */
export const FEE_PERIODS = ['monthly', 'one_off', 'per_occurrence'] as const
export type FeePeriod = (typeof FEE_PERIODS)[number]

/** `sibling` (R12: the family's second and further children) or `custom` (named persons, e.g. a social relief). */
export const DISCOUNT_KINDS = ['sibling', 'custom'] as const
export type DiscountKind = (typeof DISCOUNT_KINDS)[number]

/** Which child of a payer pays the full rate under a sibling rule (R12 default: the oldest). */
export const FULL_RATE_CHILDREN = ['oldest', 'youngest'] as const
export type FullRateChild = (typeof FULL_RATE_CHILDREN)[number]

/** The "Coaches and payments" setting (R07, DD-32): fees and cash / fees view-only / orders only. */
export const COACH_FEE_ACCESS = ['collect', 'view', 'none'] as const
export type CoachFeeAccess = (typeof COACH_FEE_ACCESS)[number]

export const CHARGE_STATUSES = ['open', 'partially_paid', 'paid', 'cancelled', 'forfeited'] as const
export type ChargeStatus = (typeof CHARGE_STATUSES)[number]

export const CHARGE_SOURCE_TYPES = ['fee', 'rental', 'order', 'manual'] as const
export type ChargeSourceType = (typeof CHARGE_SOURCE_TYPES)[number]

/** The `period_label` of a one-off fee's charge: one charge per person in all, whatever month generates it. */
export const ONE_OFF_PERIOD_LABEL = 'one_off'

/** The payment day of a fee: 1–28, so it exists in every month. */
export const MIN_DUE_DAY = 1
export const MAX_DUE_DAY = 28

/** A fee amount in grosz: more than zero, at most PLN 100 000. */
export const MAX_AMOUNT = 10_000_000

/** How far a generated period may lie from the club's current month (B-21 validation: no earlier than 12 back). */
export const GENERATION_MONTHS_BACK = 12
export const GENERATION_MONTHS_AHEAD = 12

/** The conditions of a discount rule (stored in `payments_discount_rules.conditions`). */
export type DiscountConditions = {
  /** The fee periods the rule covers (R12 default for a sibling rule: monthly fees only). */
  feePeriods: FeePeriod[]
  /** Sibling rules: which child pays the full rate. */
  fullRate?: FullRateChild
  /** Custom rules: the persons (debtors) the rule applies to. */
  personIds?: string[]
}

export const DEFAULT_SIBLING_CONDITIONS: DiscountConditions = { feePeriods: ['monthly'], fullRate: 'oldest' }

/** True unless exactly one of the group and the activity is set (422 `fee_target_invalid`). */
export function feeTargetInvalid(target: { groupId?: string | null; activityId?: string | null }): boolean {
  return Boolean(target.groupId) === Boolean(target.activityId)
}

/**
 * Why a discount's value is refused (422 `discount_value_invalid`), or null: exactly one of a percent (1–100) and an
 * amount (grosz, more than zero) — and a sibling rule is always a percent (R12).
 */
export function discountValueInvalid(rule: {
  kind: DiscountKind
  percent?: number | null
  amount?: number | null
}): boolean {
  const hasPercent = rule.percent !== null && rule.percent !== undefined
  const hasAmount = rule.amount !== null && rule.amount !== undefined
  if (hasPercent === hasAmount) return true
  if (rule.kind === 'sibling' && !hasPercent) return true
  if (hasPercent)
    return !Number.isInteger(rule.percent) || (rule.percent as number) < 1 || (rule.percent as number) > 100
  return !Number.isInteger(rule.amount) || (rule.amount as number) < 1 || (rule.amount as number) > MAX_AMOUNT
}

/**
 * The stored conditions of a rule of `kind`, with the defaults filled in; a custom rule without persons is refused
 * (422 `discount_conditions_invalid`, returned as null).
 */
export function normalizeConditions(kind: DiscountKind, input: Partial<DiscountConditions> | null | undefined) {
  const feePeriods = FEE_PERIODS.filter((period) =>
    (input?.feePeriods ?? DEFAULT_SIBLING_CONDITIONS.feePeriods).includes(period),
  )
  if (feePeriods.length === 0) return null
  if (kind === 'sibling') return { feePeriods, fullRate: input?.fullRate ?? 'oldest' } satisfies DiscountConditions
  const personIds = [...new Set(input?.personIds ?? [])]
  if (personIds.length === 0) return null
  return { feePeriods, personIds } satisfies DiscountConditions
}

/** The discount a rule grants on an amount: the percent rounded to the grosz, or the fixed amount capped at it. */
export function discountOn(amount: number, rule: { percent: number | null; amount: number | null }): number {
  if (rule.percent !== null) return Math.round((amount * rule.percent) / 100)
  return Math.min(amount, rule.amount ?? 0)
}

// --- Billing periods ---

const PERIOD_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/

/** True for a billing period `YYYY-MM`. */
export function isBillingPeriod(value: unknown): value is string {
  return typeof value === 'string' && PERIOD_PATTERN.test(value)
}

function monthIndex(period: string): number {
  return Number(period.slice(0, 4)) * 12 + Number(period.slice(5, 7)) - 1
}

function periodOfIndex(index: number): string {
  const year = Math.floor(index / 12)
  const month = (index % 12) + 1
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`
}

/** The billing period a calendar date falls in. */
export function periodOfDate(date: CalendarDate): string {
  return date.slice(0, 7)
}

/** The period `offset` months after `period` (negative: before). */
export function shiftPeriod(period: string, offset: number): string {
  return periodOfIndex(monthIndex(period) + offset)
}

/** The first and last day of a billing period (both inclusive). */
export function periodWindow(period: string): { from: CalendarDate; to: CalendarDate } {
  const year = Number(period.slice(0, 4))
  const month = Number(period.slice(5, 7))
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return { from: `${period}-01`, to: `${period}-${String(lastDay).padStart(2, '0')}` }
}

/** True when `period` lies from 12 months before to 12 months after the club's current month. */
export function periodInGenerationRange(period: string, today: CalendarDate): boolean {
  const offset = monthIndex(period) - monthIndex(periodOfDate(today))
  return offset >= -GENERATION_MONTHS_BACK && offset <= GENERATION_MONTHS_AHEAD
}

/**
 * The day memberships, guardianships and ages are read on when a period is generated: today inside the current month,
 * the first day of a future month and the last day of a past one.
 */
export function referenceDate(period: string, today: CalendarDate): CalendarDate {
  const window = periodWindow(period)
  if (today < window.from) return window.from
  if (today > window.to) return window.to
  return today
}

/** The due date of a fee's charge in a period: its payment day in that month. */
export function dueDateIn(period: string, dueDay: number): CalendarDate {
  return `${period}-${String(dueDay).padStart(2, '0')}`
}

/** True when a validity (`validFrom`–`validTo`, null = open) overlaps the billing period. */
export function activeInPeriod(validity: { validFrom: CalendarDate; validTo: CalendarDate | null }, period: string) {
  const window = periodWindow(period)
  return periodsOverlap(validity, { validFrom: window.from, validTo: window.to })
}

/** The `period_label` of a fee's charge: the period for monthly and per-session fees, `one_off` otherwise. */
export function periodLabelOf(feePeriod: FeePeriod, period: string): string {
  return feePeriod === 'one_off' ? ONE_OFF_PERIOD_LABEL : period
}

/**
 * The sessions a per-session fee charges in a period: the sessions that are not cancelled of its activity, or of every
 * activity of its group.
 */
export function countSessions(
  sessions: readonly { activityId: string; groupId: string; status: string }[],
  target: { groupId?: string | null; activityId?: string | null },
): number {
  return sessions.filter(
    (session) =>
      session.status !== 'cancelled' &&
      (target.activityId ? session.activityId === target.activityId : session.groupId === target.groupId),
  ).length
}
