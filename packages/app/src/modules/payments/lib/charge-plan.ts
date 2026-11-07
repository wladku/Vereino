// The period generator's plan (payments spec *Domain Vocabulary* → Charge, Payer, Sibling discount; REQ-011, REQ-018,
// TEST-018, TEST-048; issue #108). Given the fees valid in a period, their participants, the persons' birth dates,
// the primary payers and the discount rules, it returns the charges to create and the summary "created X, skipped Y
// (already existed), without payer Z". Pure: the command loads the inputs and persists the result.
import { isAdultOn, type CalendarDate } from '@vereino/core'
import {
  discountOn,
  dueDateIn,
  MAX_AMOUNT,
  periodLabelOf,
  type DiscountConditions,
  type DiscountKind,
  type FeePeriod,
} from './payments-rules'

export type PlanFee = {
  id: string
  name: string
  amount: number
  period: FeePeriod
  dueDay: number
  /** Per-session fees: the sessions of the period that are not cancelled; the charge is `amount × sessionCount`. */
  sessionCount?: number
}

export type PlanRule = {
  id: string
  name: string
  kind: DiscountKind
  percent: number | null
  amount: number | null
  conditions: DiscountConditions
}

/** A live (not cancelled) charge of one of the fees that already exists for the period's label. */
export type ExistingCharge = { feeId: string; personId: string; payerPersonId: string | null }

export type PlanInput = {
  /** `YYYY-MM`. */
  period: string
  /** The day ages are read on (`referenceDate`). */
  referenceDate: CalendarDate
  fees: readonly PlanFee[]
  /** The participants of each fee (from its group or its activity's group), by fee id. */
  participants: ReadonlyMap<string, readonly string[]>
  /** Birth dates by person id (null when unknown; an unknown person is treated as a minor). */
  birthDates: ReadonlyMap<string, CalendarDate | null>
  /** The active primary payer of each ward that has one. */
  primaryPayers: ReadonlyMap<string, string>
  rules: readonly PlanRule[]
  existing: readonly ExistingCharge[]
}

export type PlannedCharge = {
  feeId: string
  personId: string
  payerPersonId: string | null
  payerMissing: boolean
  periodLabel: string
  description: string
  amount: number
  discountAmount: number
  discountRuleId: string | null
  dueDate: CalendarDate
}

export type ChargePlan = {
  charges: PlannedCharge[]
  /** Charges that already existed (idempotency: a second run skips every charge of the first). */
  skipped: number
  /** Created charges without a payer (a minor without a primary payer). */
  payerMissing: number
  /**
   * The names of the per-session fees whose charge (`amount × sessionCount`) would exceed `MAX_AMOUNT`; no charge of
   * them is planned and the generation is refused (issue #185: the product would overflow the `int` amount column).
   */
  overLimitFees: string[]
}

/** The payer of a debtor: the primary-payer guardian; an adult without one pays for themselves; else nobody. */
export function payerOf(
  personId: string,
  input: Pick<PlanInput, 'primaryPayers' | 'birthDates' | 'referenceDate'>,
): string | null {
  const guardian = input.primaryPayers.get(personId)
  if (guardian) return guardian
  const birthDate = input.birthDates.get(personId)
  return birthDate && isAdultOn(birthDate, input.referenceDate) ? personId : null
}

/** Oldest first; an unknown birth date last; ties by id, so the order is stable. */
export function compareByAge(a: { id: string; birthDate: CalendarDate | null }, b: typeof a): number {
  if (a.birthDate !== b.birthDate) {
    if (a.birthDate === null) return 1
    if (b.birthDate === null) return -1
    return a.birthDate < b.birthDate ? -1 : 1
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

type Candidate = { feeId: string; personId: string; payerPersonId: string | null; period: FeePeriod }

/**
 * The persons of each sibling rule who are discounted: per payer, the debtors with a charge of a covered fee period
 * (existing or planned) are ranked by age; everyone but the full-rate child (the oldest or the youngest) is
 * discounted. Returns `ruleId → discounted person ids`.
 */
export function siblingDiscounted(
  rules: readonly PlanRule[],
  candidates: readonly Candidate[],
  birthDates: ReadonlyMap<string, CalendarDate | null>,
): Map<string, Set<string>> {
  const result = new Map<string, Set<string>>()
  for (const rule of rules) {
    if (rule.kind !== 'sibling') continue
    const byPayer = new Map<string, Set<string>>()
    for (const candidate of candidates) {
      if (!candidate.payerPersonId || !rule.conditions.feePeriods.includes(candidate.period)) continue
      // Only wards are siblings: an adult paying their own fee is not ranked among the children they pay for.
      if (candidate.personId === candidate.payerPersonId) continue
      const persons = byPayer.get(candidate.payerPersonId) ?? new Set<string>()
      persons.add(candidate.personId)
      byPayer.set(candidate.payerPersonId, persons)
    }
    const discounted = new Set<string>()
    for (const persons of byPayer.values()) {
      if (persons.size < 2) continue
      const ranked = [...persons].map((id) => ({ id, birthDate: birthDates.get(id) ?? null })).sort(compareByAge)
      const fullRate = rule.conditions.fullRate === 'youngest' ? ranked[ranked.length - 1] : ranked[0]
      for (const person of ranked) if (person.id !== fullRate.id) discounted.add(person.id)
    }
    result.set(rule.id, discounted)
  }
  return result
}

/**
 * The most favorable discount for a charge (payments spec: several matching rules → the most favorable one for the
 * payer); ties go to the rule that sorts first by name, then id. Null when no rule matches or every discount is 0.
 */
export function bestDiscount(
  charge: { personId: string; period: FeePeriod; amount: number },
  rules: readonly PlanRule[],
  siblings: ReadonlyMap<string, ReadonlySet<string>>,
): { ruleId: string; amount: number } | null {
  let best: { ruleId: string; amount: number; name: string } | null = null
  for (const rule of rules) {
    if (!rule.conditions.feePeriods.includes(charge.period)) continue
    const applies =
      rule.kind === 'sibling'
        ? (siblings.get(rule.id)?.has(charge.personId) ?? false)
        : (rule.conditions.personIds ?? []).includes(charge.personId)
    if (!applies) continue
    const amount = discountOn(charge.amount, rule)
    if (amount <= 0) continue
    const better =
      !best ||
      amount > best.amount ||
      (amount === best.amount && (rule.name < best.name || (rule.name === best.name && rule.id < best.ruleId)))
    if (better) best = { ruleId: rule.id, amount, name: rule.name }
  }
  return best ? { ruleId: best.ruleId, amount: best.amount } : null
}

/** The charges a period generation creates, and its summary. */
export function planCharges(input: PlanInput): ChargePlan {
  const existingKeys = new Set(input.existing.map((charge) => `${charge.feeId}:${charge.personId}`))
  const feesById = new Map(input.fees.map((fee) => [fee.id, fee]))
  const fresh: Array<Candidate & { fee: PlanFee; amount: number }> = []
  const seen = new Set<string>()
  const overLimit = new Set<string>()
  let skipped = 0
  for (const fee of input.fees) {
    const amount = fee.period === 'per_occurrence' ? fee.amount * (fee.sessionCount ?? 0) : fee.amount
    for (const personId of input.participants.get(fee.id) ?? []) {
      const key = `${fee.id}:${personId}`
      if (seen.has(key)) continue
      seen.add(key)
      if (existingKeys.has(key)) {
        skipped += 1
        continue
      }
      // A per-session fee without sessions in the period owes nothing, so no charge is created or counted.
      if (amount <= 0) continue
      if (amount > MAX_AMOUNT) {
        overLimit.add(fee.name)
        continue
      }
      fresh.push({ feeId: fee.id, personId, payerPersonId: payerOf(personId, input), period: fee.period, fee, amount })
    }
  }

  // Existing charges take part in the sibling ranking (a child added later is ranked against them) but never change.
  const existingCandidates: Candidate[] = input.existing.flatMap((charge) => {
    const fee = feesById.get(charge.feeId)
    return fee ? [{ ...charge, period: fee.period }] : []
  })
  const siblings = siblingDiscounted(input.rules, [...existingCandidates, ...fresh], input.birthDates)

  const charges = fresh.map((candidate): PlannedCharge => {
    const discount = bestDiscount(candidate, input.rules, siblings)
    return {
      feeId: candidate.feeId,
      personId: candidate.personId,
      payerPersonId: candidate.payerPersonId,
      payerMissing: candidate.payerPersonId === null,
      periodLabel: periodLabelOf(candidate.period, input.period),
      description: candidate.fee.name,
      amount: candidate.amount,
      discountAmount: discount?.amount ?? 0,
      discountRuleId: discount?.ruleId ?? null,
      dueDate: dueDateIn(input.period, candidate.fee.dueDay),
    }
  })
  return {
    charges,
    skipped,
    payerMissing: charges.filter((charge) => charge.payerMissing).length,
    overLimitFees: [...overLimit],
  }
}
