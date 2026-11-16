// P-07 account-age policy (V-2): a pure check the `people` command applies before it creates an account; the
// threshold is the club setting `own_account_min_age` (D-022). Dates are calendar dates in the club zone.
import { assertCalendarDate, type CalendarDate } from '#src/calendar-date'

export type AccountAgeDecision = 'ok' | 'below_threshold'

export const ADULT_AGE = 18

/**
 * Completed years between `birthDate` and `today`. A person born on 29 February completes a year on
 * 1 March in a common year, because the age counts only once the birthday's month and day are reached.
 */
export function ageOn(birthDate: CalendarDate, today: CalendarDate): number {
  assertCalendarDate(birthDate, 'birthDate')
  assertCalendarDate(today, 'today')
  const years = Number(today.slice(0, 4)) - Number(birthDate.slice(0, 4))
  return today.slice(5) < birthDate.slice(5) ? years - 1 : years
}

/** True from the 18th birthday on (the `vereino_payer` rule for guardians and participants). */
export function isAdultOn(birthDate: CalendarDate, today: CalendarDate): boolean {
  return ageOn(birthDate, today) >= ADULT_AGE
}

export type AccountAgePolicyInput = {
  readonly birthDate: CalendarDate
  /** Minimum age in completed years (`own_account_min_age`). */
  readonly threshold: number
  readonly today: CalendarDate
}

export function accountAgePolicy(input: AccountAgePolicyInput): AccountAgeDecision {
  if (!Number.isInteger(input.threshold) || input.threshold < 0) {
    throw new RangeError('[internal] threshold must be a non-negative integer')
  }
  return ageOn(input.birthDate, input.today) >= input.threshold ? 'ok' : 'below_threshold'
}

/** The state of a person's account (people life-cycle spec DD-L02): read from the platform user, never stored. */
export type AccountState = 'none' | 'invited' | 'active' | 'blocked'

/** The facts of the platform user the state is read from; null when the person has no user in the club's scope. */
export type AccountStateInput = {
  readonly hasPassword: boolean
  readonly lastSignInAt: Date | null
  readonly isConfirmed: boolean
} | null

/**
 * `blocked` while the user is not confirmed (the reversible block of REQ-L02); `invited` while it has no password and
 * never signed in; `active` otherwise — a Google sign-in without a password counts as signed in (D-027).
 */
export function accountState(user: AccountStateInput): AccountState {
  if (!user) return 'none'
  if (!user.isConfirmed) return 'blocked'
  if (!user.hasPassword && !user.lastSignInAt) return 'invited'
  return 'active'
}
