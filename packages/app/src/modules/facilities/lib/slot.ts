// The slot dialog's rules (facilities parity spec DD-R04, the *Slot dialog kinds* row of the glossary, REQ-R02; #277),
// pure: which kinds a user may save from a free hour, the times prefilled from the tapped hour, the zone of the hour
// and how many held requests a club booking of the slot supersedes. The routes and commands decide; the dialog only
// prefills and offers.
import { RENTAL_UNIT_MINUTES } from './rentals'
import type { Zone } from './zones'

/** The kinds of the slot dialog, in the order DD-R04 preselects them. */
export const SLOT_KINDS = ['rental', 'group', 'general'] as const
export type SlotKind = (typeof SLOT_KINDS)[number]

/** The minutes a club booking lasts by default (the tapped hour plus 90 minutes). */
export const SLOT_DEFAULT_MINUTES = 90

export type SlotKindAccess = {
  /** `facilities.rentals.manage`. */
  rentals: boolean
  /** `activities.events.create`. */
  groupEvents: boolean
  /** How many groups the user may create an event for (their own groups). */
  ownGroups: number
  /** `facilities.bookings.create`. */
  bookings: boolean
}

/**
 * The kinds a user may save (DD-R04): rental with `facilities.rentals.manage`, for a group with
 * `activities.events.create` and at least one own group, general purpose with `facilities.bookings.create`; the first
 * is preselected. None → the hour is not a button.
 */
export function slotKinds(access: SlotKindAccess): SlotKind[] {
  return SLOT_KINDS.filter((kind) => {
    if (kind === 'rental') return access.rentals
    if (kind === 'group') return access.groupEvents && access.ownGroups > 0
    return access.bookings
  })
}

/**
 * The kind the slot dialog shows (DD-R04, #366): the user's pick while it is still offered, else the first offered
 * kind. The offered kinds can grow after the dialog opens (a coach's groups load later), so the preselection follows
 * them until the user picks one. No kind offered → `rental`, the B-24 "New rental" kind.
 */
export function selectedSlotKind(kinds: readonly SlotKind[], picked: SlotKind | null): SlotKind {
  if (picked !== null && kinds.includes(picked)) return picked
  return kinds[0] ?? 'rental'
}

export type MinuteSpan = { from: number; to: number }

/**
 * The minute the opening window holding `start` closes at, or null when the day has no opening-hours limit or no
 * window holds `start`.
 */
export function closingAfter(opening: readonly MinuteSpan[] | null, start: number): number | null {
  if (!opening) return null
  return opening.find((window) => window.from <= start && window.to > start)?.to ?? null
}

/** A club booking's default end: 90 minutes after the start, clipped to the closing time (glossary *Slot dialog kinds*). */
export function defaultSlotEnd(start: number, closing: number | null): number {
  const end = start + SLOT_DEFAULT_MINUTES
  return closing !== null && closing > start ? Math.min(end, closing) : end
}

/** A rental's end: the start plus the units of 90 minutes. */
export function rentalSlotEnd(start: number, units: number): number {
  return start + units * RENTAL_UNIT_MINUTES
}

/** The zone the minute `at` falls in (the dialog's zone line), or null between zones. */
export function zoneAtMinute(zones: ReadonlyArray<MinuteSpan & { zone: Zone }>, at: number): Zone | null {
  return zones.find((zone) => zone.from <= at && zone.to > at)?.zone ?? null
}

/** How many held requests overlap the slot `[start, end)`; instants as epoch milliseconds. */
export function overlappingRequests(
  requests: ReadonlyArray<{ start: number; end: number }>,
  start: number,
  end: number,
): number {
  return requests.filter((request) => request.start < end && request.end > start).length
}
