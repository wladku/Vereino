// The round of one sweep run (many-clubs spec *Observability*; #852): a job type that wants one outcome per run of
// its sweep — the payments invariants heartbeat, "one ping after all clubs, with the count of failing clubs" — gets a
// round check. The sweep hands it the clubs it enqueued (the scope the DD-M07 (a) claim returned; nothing else is read
// in system scope); the check reads each of those clubs' own job-state row in that club's scope until every run has
// finished, or until the run's leases are over, and then reports the counts. Pure: the caller passes rows and instants.

/** How long the round check waits before it looks at the runs again (the queued check is delayed by this). */
export const ROUND_CHECK_DELAY_MS = 60_000

/** At most this many clubs per round payload; a sweep run claims at most 25 × 200 (`MAX_SWEEP_PASSES`). */
export const ROUND_MAX_CLUBS = 5_000

export type ClubJobRoundClub = { readonly tenantId: string; readonly organizationId: string }

/** The clubs one sweep run enqueued, when it enqueued them (real time, not the sweep's `--now`), and the deadline. */
export type ClubJobRound = {
  readonly jobKey: string
  readonly enqueuedAt: Date
  /** After this instant the check stops waiting: a run not finished by then counts as failing. */
  readonly deadline: Date
  readonly clubs: readonly ClubJobRoundClub[]
  /** Clubs whose enqueue failed in this sweep run: failing, they were not checked. */
  readonly enqueueFailed: number
}

/** The state of one club's job-state row the check needs; null when the row is gone (a deleted club). */
export type ClubJobRunState = {
  readonly leaseUntil: Date | null
  readonly lastFinishedAt: Date | null
  readonly lastError: string | null
} | null

/** What a round reports: the clubs it covered, how many failed (an error or problem code, no result, or no enqueue). */
export type ClubJobRoundOutcome = {
  readonly jobKey: string
  readonly clubs: number
  readonly failing: number
  /** Clubs whose run had not finished by the deadline (included in `failing`). */
  readonly unfinished: number
}

/** The instant after which the round stops waiting: the enqueue lease plus the run lease of the job type. */
export function clubJobRoundDeadline(enqueuedAt: Date, enqueueLeaseMs: number, runLeaseMs: number): Date {
  return new Date(enqueuedAt.getTime() + enqueueLeaseMs + runLeaseMs)
}

/** The round as JSON for the queue payload. */
export function serializeClubJobRound(round: ClubJobRound): Record<string, unknown> {
  return {
    jobKey: round.jobKey,
    enqueuedAt: round.enqueuedAt.toISOString(),
    deadline: round.deadline.toISOString(),
    clubs: round.clubs.map((club) => [club.tenantId, club.organizationId]),
    enqueueFailed: round.enqueueFailed,
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function instant(value: unknown): Date | null {
  if (typeof value !== 'string') return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function club(value: unknown): ClubJobRoundClub | null {
  if (!Array.isArray(value) || value.length !== 2) return null
  const [tenantId, organizationId] = value as unknown[]
  if (typeof tenantId !== 'string' || typeof organizationId !== 'string') return null
  return UUID.test(tenantId) && UUID.test(organizationId) ? { tenantId, organizationId } : null
}

/** The round of a queue payload, or null when anything in it is malformed. */
export function parseClubJobRound(payload: unknown): ClubJobRound | null {
  if (!payload || typeof payload !== 'object') return null
  const raw = payload as Record<string, unknown>
  const enqueuedAt = instant(raw.enqueuedAt)
  const deadline = instant(raw.deadline)
  const { jobKey, enqueueFailed } = raw
  if (typeof jobKey !== 'string' || jobKey.length === 0 || jobKey.length > 200) return null
  if (!enqueuedAt || !deadline) return null
  if (!Number.isInteger(enqueueFailed) || (enqueueFailed as number) < 0) return null
  if (!Array.isArray(raw.clubs) || raw.clubs.length > ROUND_MAX_CLUBS) return null
  const clubs: ClubJobRoundClub[] = []
  for (const entry of raw.clubs) {
    const parsed = club(entry)
    if (!parsed) return null
    clubs.push(parsed)
  }
  return { jobKey, enqueuedAt, deadline, clubs, enqueueFailed: enqueueFailed as number }
}

/** A run of this round finished: its row records a finish at or after the enqueue and holds no live lease. */
function finished(state: NonNullable<ClubJobRunState>, enqueuedAt: Date, now: Date): boolean {
  if (!state.lastFinishedAt || state.lastFinishedAt.getTime() < enqueuedAt.getTime()) return false
  return !state.leaseUntil || state.leaseUntil.getTime() < now.getTime()
}

/**
 * Judges the round from its clubs' rows (in the order of `round.clubs`): `wait` while a run is unfinished and the
 * deadline has not passed, else the outcome. A club whose row is gone (deleted meanwhile) is left out.
 */
export function judgeClubJobRound(
  round: ClubJobRound,
  states: readonly ClubJobRunState[],
  now: Date,
): { done: false } | { done: true; outcome: ClubJobRoundOutcome } {
  let clubs = round.enqueueFailed
  let failing = round.enqueueFailed
  let unfinished = 0
  for (const state of states) {
    if (state === null) continue
    clubs += 1
    if (!finished(state, round.enqueuedAt, now)) unfinished += 1
    else if (state.lastError !== null) failing += 1
  }
  if (unfinished > 0 && now.getTime() < round.deadline.getTime()) return { done: false }
  return { done: true, outcome: { jobKey: round.jobKey, clubs, failing: failing + unfinished, unfinished } }
}
