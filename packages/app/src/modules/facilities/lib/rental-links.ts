// Pure rules of the renter's e-mails and cancellation link (facilities parity spec REQ-R17, DD-R13, *Business rules*
// row "Renter cancellation link"; #286): what a link is for, until when it works, which rentals it may cancel, the
// outcome a cancellation e-mail states, the dispatch idempotency keys (DD-46) and the page path. Nothing here reads
// the database or the clock (S3.5).
import { OCCUPYING_RENTAL_STATUSES, UNPAID_EXPIRY_REASON, cancellationDeadline, cancellationOutcome } from './rentals'
import type { RentalStatus } from './rentals'

export const RENTAL_LINK_PURPOSES = ['cancel'] as const
export type RentalLinkPurpose = (typeof RENTAL_LINK_PURPOSES)[number]

/**
 * The longest a cancellation link may live: the foundation service refuses an expiry past its time to live, and a
 * rental further ahead gets its e-mails without a link (the club's phone instead).
 */
export const RENTAL_LINK_TTL_MS = 2 * 366 * 24 * 60 * 60 * 1000

/** The expiry of a new cancellation link: the rental's start; null when it has started or lies beyond the TTL. */
export function rentalLinkExpiry(startsAt: Date, now: Date): Date | null {
  const start = startsAt.getTime()
  if (start <= now.getTime() || start > now.getTime() + RENTAL_LINK_TTL_MS) return null
  return startsAt
}

/** True while the link may cancel the rental: it still holds its slot (`requested` or `confirmed`). */
export function rentalCancellable(status: RentalStatus): boolean {
  return OCCUPYING_RENTAL_STATUSES.includes(status)
}

/** True when cancelling at `now` is free: up to the rental's cancellation deadline (24 h before the start). */
export function cancelsFree(startsAt: Date, deadline: Date | null, now: Date): boolean {
  return cancellationOutcome(now, deadline ?? cancellationDeadline(startsAt)) === 'cancelled_free'
}

export type CancelledOutcome = 'free' | 'late' | 'unpaid'

/**
 * What the cancellation e-mail states: free, late (the charge forfeited) or unpaid after the payment deadline (the
 * automatic expiry, DD-R11); null for a rental that is not cancelled.
 */
export function cancelledOutcome(status: RentalStatus, reason: string | null): CancelledOutcome | null {
  if (status === 'cancelled_late') return 'late'
  if (status !== 'cancelled_free') return null
  return reason === UNPAID_EXPIRY_REASON ? 'unpaid' : 'free'
}

/** The dispatch key of the summary of a staff-entered rental (DD-46): once per rental. */
export function rentalSummaryKey(rentalId: string): string {
  return `facilities:rental:${rentalId}:summary`
}

/** The dispatch key of a "moved" e-mail: once per move (the move's id rides on `facilities.rental.moved`). */
export function rentalMovedKey(moveId: string): string {
  return `facilities:rental-moved:${moveId}`
}

/** The dispatch key of a cancellation e-mail: once per rental and cancelled status. */
export function rentalCancelledKey(rentalId: string, status: RentalStatus): string {
  return `facilities:rental:${rentalId}:${status}`
}

/** The path of the renter's cancellation page (the token in the page path, posted in the body of the API calls). */
export function rentalCancelPath(clubSlug: string, token: string): string {
  return `/p/${encodeURIComponent(clubSlug)}/rentals/cancel/${encodeURIComponent(token)}`
}
