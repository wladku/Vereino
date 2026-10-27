// P-06 Validity: a period `valid_from`–`valid_to` shared by role assignments, memberships, consents and
// seasons. Dates are calendar dates in the club time zone, computed by the caller (S3.5).
import { isCalendarDate, type CalendarDate } from '#src/calendar-date'

/** A validity period: `validFrom` is required, an empty `validTo` means open-ended; both ends are inclusive. */
export type Validity = {
  readonly validFrom: CalendarDate
  readonly validTo: CalendarDate | null
}

/** Why a value is not a validity period: `malformed` input or a period that ends before it starts. */
export type ValidityProblem = 'malformed' | 'inverted'

export type ValidityParseResult =
  { readonly ok: true; readonly value: Validity } | { readonly ok: false; readonly problem: ValidityProblem }

/** True when `validTo` is set and lies before `validFrom` (the `validity_inverted` rule). */
export function isInvertedPeriod(validFrom: CalendarDate, validTo: CalendarDate | null | undefined): boolean {
  return typeof validTo === 'string' && validTo < validFrom
}

/**
 * Parses untrusted input `{ validFrom, validTo? }` into a `Validity`. `@vereino/core` has no Zod dependency,
 * so this returns a typed result; module schemas use the foundation's Zod refine, which maps `inverted`
 * to the 422 `validity_inverted` error.
 */
function parse(input: unknown): ValidityParseResult {
  if (input === null || typeof input !== 'object') return { ok: false, problem: 'malformed' }
  const { validFrom, validTo } = input as { validFrom?: unknown; validTo?: unknown }
  if (!isCalendarDate(validFrom)) return { ok: false, problem: 'malformed' }
  if (validTo !== undefined && validTo !== null && !isCalendarDate(validTo)) return { ok: false, problem: 'malformed' }
  const end = validTo ?? null
  if (isInvertedPeriod(validFrom, end)) return { ok: false, problem: 'inverted' }
  return { ok: true, value: { validFrom, validTo: end } }
}

/** Active on `today` when `validFrom ≤ today` and (`validTo` is empty or `today ≤ validTo`). */
export function isActiveAt(validity: Validity, today: CalendarDate): boolean {
  return validity.validFrom <= today && (validity.validTo === null || today <= validity.validTo)
}

/** True when the period has ended before `today` (its last day is earlier than `today`). */
export function endsBefore(validity: Validity, today: CalendarDate): boolean {
  return validity.validTo !== null && validity.validTo < today
}

export const Validity = { parse, isActiveAt, endsBefore } as const
