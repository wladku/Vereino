// The steps of the "Staff setup" checklist on the person record (people life-cycle spec REQ-L09, J-L07, DD-L02;
// #312): account, role, groups as coach and contract, each `done`, `pending` (started, not finished: an invitation
// not yet accepted, a period that starts later) or `missing`. Shared by `people` (account and role rows) and the rows
// `groups` and `club_core` inject, so all four read alike. Pure; `today` is the club's calendar day.
import type { CalendarDate } from '#src/calendar-date'
import { isActiveAt, type Validity } from '#src/validity'

export const STAFF_STEPS = ['done', 'pending', 'missing'] as const
export type StaffStep = (typeof STAFF_STEPS)[number]

/** The status badge variant of a step: success, warning or neutral (never `brand`, which fails contrast). */
export const STAFF_STEP_VARIANT: Readonly<Record<StaffStep, 'success' | 'warning' | 'neutral'>> = {
  done: 'success',
  pending: 'warning',
  missing: 'neutral',
}

/** A step read from periods: `done` when one is active today, `pending` when one starts later, else `missing`. */
export function periodStep(periods: readonly Validity[], today: CalendarDate): StaffStep {
  if (periods.some((period) => isActiveAt(period, today))) return 'done'
  if (periods.some((period) => period.validFrom > today)) return 'pending'
  return 'missing'
}

/** The account step from the account state (DD-L02): active is done, invited or blocked needs a look, none is missing. */
export function accountStep(state: 'none' | 'invited' | 'active' | 'blocked'): StaffStep {
  if (state === 'active') return 'done'
  return state === 'none' ? 'missing' : 'pending'
}
