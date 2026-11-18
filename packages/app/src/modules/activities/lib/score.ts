// The score of a match or sparring (groups and activities parity spec REQ-A15, Q-A21, glossary *Score*; E10-S07 #272):
// which sessions take one, when it may be recorded, and how a read shows it. `scoreHome` is the club's team unless the
// activity is away, so the page lists the club's team first either way. Pure; callers pass "now".

/** The activity types that are played against an opponent and so take a score. */
export const SCORE_TYPES = ['match', 'sparring'] as const

/** The highest number of goals or points one side may have (the check `activities_occurrences_score_pair`). */
export const SCORE_MAX = 99

/** The longest note on a result. */
export const RESULT_NOTE_MAX = 500

export type ScoreProblem = 'not_applicable' | 'before_start' | 'cancelled'

/**
 * Why a score cannot be recorded, or null: only on a match or sparring (422 `score_not_applicable`), not on a cancelled
 * session (409 `occurrence_not_planned`) and only once it started (409 `score_before_start`) — also after it is closed.
 */
export function scoreProblem(
  activityType: string,
  occurrence: { readonly status: string; readonly startAt: Date },
  now: Date,
): ScoreProblem | null {
  if (!(SCORE_TYPES as readonly string[]).includes(activityType)) return 'not_applicable'
  if (occurrence.status === 'cancelled') return 'cancelled'
  return occurrence.startAt.getTime() <= now.getTime() ? null : 'before_start'
}

export type ScoreView = { home: number; away: number; note: string | null }

/** The score a read returns: null when none was recorded. */
export function scoreView(row: {
  readonly scoreHome?: number | null
  readonly scoreAway?: number | null
  readonly resultNote?: string | null
}): ScoreView | null {
  if (row.scoreHome == null || row.scoreAway == null) return null
  return { home: row.scoreHome, away: row.scoreAway, note: row.resultNote ?? null }
}

/** The score as the club reads it: its own team first ("3:1"), whether it played at home or away. */
export function clubFirstScore(score: Pick<ScoreView, 'home' | 'away'>, isAway: boolean): string {
  return isAway ? `${String(score.away)}:${String(score.home)}` : `${String(score.home)}:${String(score.away)}`
}

/** A trimmed note, or null for a blank one. */
export function resultNoteOrNull(note: string | null | undefined): string | null {
  const trimmed = (note ?? '').trim()
  return trimmed.length > 0 ? trimmed : null
}

/** A session a score block is shown for: a match or sparring that has started and was not cancelled. */
export function showsScore(
  activityType: string | null | undefined,
  occurrence: { readonly status: string; readonly startAt: string },
  now: Date,
): boolean {
  if (!activityType) return false
  return scoreProblem(activityType, { status: occurrence.status, startAt: new Date(occurrence.startAt) }, now) === null
}
