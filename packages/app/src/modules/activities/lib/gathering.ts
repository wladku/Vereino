// The gathering time of a session (club spec DD-43, #136): the activity holds the default offset in minutes before
// the start, each session its own (copied by the planner, overridden by a session edit); the instant shown is the
// start minus the offset, so moving a session moves its gathering. Pure (S3.5).

/** The earliest gathering: twelve hours before the start (away trips, REQ-039, are out of scope). */
export const MAX_GATHERING_MINUTES = 720

const MINUTE_MS = 60_000

/** The gathering instant of a session starting at `startAt`, or null when it has no gathering time. */
export function gatheringAt(startAt: Date, minutesBefore: number | null | undefined): Date | null {
  if (minutesBefore === null || minutesBefore === undefined || minutesBefore <= 0) return null
  return new Date(startAt.getTime() - minutesBefore * MINUTE_MS)
}

/** `gatheringAt(...)` as an ISO string, or null. */
export function gatheringIso(startAt: Date, minutesBefore: number | null | undefined): string | null {
  return gatheringAt(startAt, minutesBefore)?.toISOString() ?? null
}

export type GatheringOffset =
  | { ok: true; minutes: number }
  | { ok: false; code: 'occurrence_gathering_after_start' | 'occurrence_gathering_too_early' }

/**
 * The offset a submitted gathering instant stores for a session starting at `startAt`, in whole minutes: a gathering
 * less than a minute before the start (or after it) and one more than `MAX_GATHERING_MINUTES` before it are refused.
 */
export function gatheringOffset(startAt: Date, gathering: Date): GatheringOffset {
  const minutes = Math.floor((startAt.getTime() - gathering.getTime()) / MINUTE_MS)
  if (minutes < 1) return { ok: false, code: 'occurrence_gathering_after_start' }
  if (minutes > MAX_GATHERING_MINUTES) return { ok: false, code: 'occurrence_gathering_too_early' }
  return { ok: true, minutes }
}
