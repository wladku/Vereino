// P-25 assert service (foundation II DD-G04, DD-G14): a command asks its module's transition table before it writes a
// status and answers 409 `invalid_transition` naming both states when the table refuses the move. (`advanceWhere`,
// the job-driven conditional UPDATE of the same primitive, is built with its first consumer — the expiry of guardian
// confirmations, #32/#33.)
import type { Transitions } from '@vereino/core'
import { foundationErrors } from '../api/errors'

export async function assertTransition<TState extends string>(
  transitions: Transitions<TState>,
  from: string,
  to: string,
): Promise<void> {
  if (!transitions.canTransition(from, to)) await foundationErrors.throw('invalid_transition', { from, to })
}
