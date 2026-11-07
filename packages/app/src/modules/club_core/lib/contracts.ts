// Contracts (club spec *Data Models* → `club_core_contracts`, DD-09, REQ-021; README B-07; #96): who the club has a
// contract with, of which kind, for which period, and — for a coach — the rates of the club's settlement model (R14).
// Rates are whole grosz. Pure: the commands check a write with these rules, and the coach units report of
// `activities` picks the contract that prices a session with `contractOn`.
import { periodsOverlap, type CalendarDate } from '@vereino/core'
import type { COACH_SETTLEMENT_MODELS } from './settings'

export const CONTRACT_KINDS = ['coach', 'facility_management', 'rental', 'grant', 'other'] as const
export type ContractKind = (typeof CONTRACT_KINDS)[number]

export const CONTRACT_PARTY_TYPES = ['person', 'institution'] as const
export type ContractPartyType = (typeof CONTRACT_PARTY_TYPES)[number]

export type CoachSettlementModel = (typeof COACH_SETTLEMENT_MODELS)[number]

/** Every rate a coach contract may carry, in grosz; each model reads its own subset (`COACH_TERMS_BY_MODEL`). */
export const COACH_TERM_FIELDS = [
  'baseMonthly',
  'unitRate',
  'matchRate',
  'travelRate',
  'sessionAmount',
  'tripAmount',
] as const
export type CoachTermField = (typeof COACH_TERM_FIELDS)[number]
export type CoachTerms = Partial<Record<CoachTermField, number>>

/**
 * The rates each model needs (R14, glossary *Coach settlement*): `units_per_contract` — base + units × unit rate +
 * matches × match rate + away trips × trip rate; `fixed_base_adjusted` — a base, minus a session amount for every own
 * session another coach led, plus it for every session led as a substitute, plus a trip amount per away trip.
 */
export const COACH_TERMS_BY_MODEL: Readonly<Record<CoachSettlementModel, readonly CoachTermField[]>> = {
  units_per_contract: ['baseMonthly', 'unitRate', 'matchRate', 'travelRate'],
  fixed_base_adjusted: ['baseMonthly', 'sessionAmount', 'tripAmount'],
}

/** The highest rate a form accepts: 1 000 000 zł in grosz. */
export const MAX_RATE_GROSZ = 100_000_000

function isRate(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_RATE_GROSZ
}

/** The coach rates stored in `terms` (decrypted JSON text); anything that is not a valid rate is dropped. */
export function parseCoachTerms(value: unknown): CoachTerms {
  let parsed: unknown = value
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value) as unknown
    } catch {
      return {}
    }
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
  const terms: CoachTerms = {}
  for (const field of COACH_TERM_FIELDS) {
    const rate = (parsed as Record<string, unknown>)[field]
    if (isRate(rate)) terms[field] = rate
  }
  return terms
}

/** The model's rates a contract lacks; empty when it can price a month in that model. */
export function missingCoachTerms(terms: CoachTerms, model: CoachSettlementModel): CoachTermField[] {
  return COACH_TERMS_BY_MODEL[model].filter((field) => terms[field] === undefined)
}

/** Only the model's rates, in a fixed order: what a coach contract stores. */
export function coachTermsForModel(terms: CoachTerms, model: CoachSettlementModel): CoachTerms {
  const kept: CoachTerms = {}
  for (const field of COACH_TERMS_BY_MODEL[model]) {
    const rate = terms[field]
    if (rate !== undefined) kept[field] = rate
  }
  return kept
}

/** A coach contract is with a person; every other kind may name a person or an institution. */
export function partyAllowed(kind: ContractKind, partyType: ContractPartyType): boolean {
  return kind !== 'coach' || partyType === 'person'
}

export type ContractPeriod = { id: string; validFrom: CalendarDate; validTo: CalendarDate | null }

/** The first other contract whose period shares a day with `candidate` (409 `contract_overlap`), or null. */
export function overlappingContract<T extends ContractPeriod>(
  candidate: ContractPeriod,
  others: readonly T[],
): T | null {
  return others.find((other) => other.id !== candidate.id && periodsOverlap(candidate, other)) ?? null
}

/**
 * The contract in force on `date` (both ends inclusive). Contracts of one kind for one party never overlap, so at
 * most one matches: a session is priced by the contract in force on its own day, so a contract that ends mid-month
 * prices the sessions up to its last day and the next one prices the rest.
 */
export function contractOn<T extends ContractPeriod>(contracts: readonly T[], date: CalendarDate): T | null {
  return contracts.find((row) => row.validFrom <= date && (row.validTo === null || date <= row.validTo)) ?? null
}
