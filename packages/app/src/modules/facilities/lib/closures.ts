// Pure rules of the closures (facilities spec glossary *Closure*, DD-22; REQ-013; #121): a period on a place with a
// reason, entered by the administrator on behalf of the owner. A closure blocks new bookings; existing sessions and
// bookings in it get the reschedule flag, which the save reports as counts.
export const CLOSURE_REASONS = ['snow', 'maintenance', 'municipal_event', 'school', 'other'] as const
export type ClosureReason = (typeof CLOSURE_REASONS)[number]

/** Why a closure's period is not valid, or null (422 `closure_period_invalid`). */
export function closurePeriodProblem(startsAt: Date, endsAt: Date): string | null {
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) return 'malformed'
  return endsAt.getTime() > startsAt.getTime() ? null : 'inverted'
}

/** What a closure save flagged for rescheduling: the toast "Marked to be moved: n sessions, n rentals". */
export type RescheduleCounts = { readonly sessions: number; readonly rentals: number }

/** True when two periods move the reschedule window (a changed start or end flags again). */
export function closureWindowChanged(
  before: { startsAt: Date; endsAt: Date; placeId: string },
  after: { startsAt: Date; endsAt: Date; placeId: string },
): boolean {
  return (
    before.placeId !== after.placeId ||
    before.startsAt.getTime() !== after.startsAt.getTime() ||
    before.endsAt.getTime() !== after.endsAt.getTime()
  )
}
