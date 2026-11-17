// What a session change announces (groups and activities parity spec REQ-A09, glossary *Announced change* and *Series
// change notice*; D-031 §7; #271): a committed change of the start, the end, the place or typed venue, or the gathering
// time of a `planned` session whose old or new start is later than the change, and a restore. A change of the coach or
// of the deadline alone is not announced. Pure (S3.5): the commands compute the `change` and `scheduleChange` payloads
// of `activities.occurrence.updated` and `activities.activity.updated` with it, the subscribers only read them.
import type { OccurrenceStatus } from './activities-rules'

export const SESSION_CHANGE_KINDS = ['time', 'place', 'gathering', 'restored'] as const
export type SessionChangeKind = (typeof SESSION_CHANGE_KINDS)[number]

/** The facts of a session a notice compares: its status, instants, place or typed venue and gathering offset. */
export type SessionFacts = {
  status: OccurrenceStatus
  startAt: Date
  endAt: Date
  placeId: string | null
  venueName?: string | null
  venueAddress?: string | null
  gatheringMinutesBefore?: number | null
}

/** The values before the change, as the event carries them (ISO instants). */
export type SessionChangeBefore = {
  startAt: string
  endAt: string
  placeId: string | null
  venueName: string | null
  gatheringMinutesBefore: number | null
}

/** The `change` of `activities.occurrence.updated`: what changed and the values before it. */
export type SessionChange = { kinds: SessionChangeKind[]; before: SessionChangeBefore }

function beforeOf(facts: SessionFacts): SessionChangeBefore {
  return {
    startAt: facts.startAt.toISOString(),
    endAt: facts.endAt.toISOString(),
    placeId: facts.placeId,
    venueName: facts.venueName ?? null,
    gatheringMinutesBefore: facts.gatheringMinutesBefore ?? null,
  }
}

/** Whether the session moved to another club place or typed venue. */
function placeChanged(before: SessionFacts, after: SessionFacts): boolean {
  return (
    before.placeId !== after.placeId ||
    (before.venueName ?? null) !== (after.venueName ?? null) ||
    (before.venueAddress ?? null) !== (after.venueAddress ?? null)
  )
}

/** The kinds of a move of a planned session (empty when only the coach or the deadline changed). */
export function movedKinds(before: SessionFacts, after: SessionFacts): SessionChangeKind[] {
  const kinds: SessionChangeKind[] = []
  if (before.startAt.getTime() !== after.startAt.getTime() || before.endAt.getTime() !== after.endAt.getTime()) {
    kinds.push('time')
  }
  if (placeChanged(before, after)) kinds.push('place')
  if ((before.gatheringMinutesBefore ?? null) !== (after.gatheringMinutesBefore ?? null)) kinds.push('gathering')
  return kinds
}

/**
 * The announced change between two states of one session written at `now`, or null when nothing is announced: the
 * session is not planned afterwards, neither its old nor its new start is later than `now`, or (for a planned session
 * that stays planned) only the coach or the deadline changed. A cancelled session that becomes planned is `restored`.
 */
export function sessionChangeOf(before: SessionFacts, after: SessionFacts, now: Date): SessionChange | null {
  if (after.status !== 'planned') return null
  if (before.startAt.getTime() <= now.getTime() && after.startAt.getTime() <= now.getTime()) return null
  if (before.status === 'cancelled') return { kinds: ['restored'], before: beforeOf(before) }
  if (before.status !== 'planned') return null
  const kinds = movedKinds(before, after)
  return kinds.length > 0 ? { kinds, before: beforeOf(before) } : null
}

/** One session a series write moved: its date and its state before and after. */
export type SeriesSessionMove = { occurrenceDate: string; before: SessionFacts; after: SessionFacts }

/** The rule of a series as a notice names it: its times, place or venue and gathering offset. */
export type SeriesRule = {
  startTime: string
  endTime: string
  placeId: string | null
  venueName: string | null
  gatheringMinutesBefore: number | null
}

/**
 * The `scheduleChange` of `activities.activity.updated` (DD-A08): the first changed date, the number of changed
 * sessions and the rule before and after — or null when no future session's time, place or gathering changed (a
 * description, a coach or a deadline alone). Detached sessions never reach it: the planner does not move them.
 */
export function scheduleChangeOf(
  moves: readonly SeriesSessionMove[],
  rules: { before: SeriesRule; after: SeriesRule },
  now: Date,
): { from: string; movedCount: number; before: SeriesRule; after: SeriesRule } | null {
  const moved = moves
    .filter((move) => sessionChangeOf(move.before, move.after, now) !== null)
    .map((move) => move.occurrenceDate)
    .sort()
  const from = moved[0]
  if (from === undefined) return null
  return { from, movedCount: moved.length, before: rules.before, after: rules.after }
}
