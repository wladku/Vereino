// The order of a sweep pass and of one club's run (many-clubs spec DD-M04, DD-M06, BR-M2; #629), with the database
// and the queue passed in: a pass claims due clubs in batches until a batch comes back short, and one club whose
// enqueue fails never stops the others; a run starts only when its claim still holds, and a failed run is recorded
// for its club and retried later instead of failing the queue job.

/** The claim a sweep puts into a per-club job's payload (`clubJob`), so the run can prove it is the claimed one. */
export type ClubJobClaim = { readonly dueAt: Date; readonly leaseUntil: Date }

/** The payload key carrying the claim; a run without it (an old per-club schedule, a manual run) has no job state. */
export const CLUB_JOB_CLAIM_KEY = 'clubJob'

/** The claim as JSON for the queue payload. */
export function serializeClubJobClaim(claim: ClubJobClaim): { dueAt: string; leaseUntil: string } {
  return { dueAt: claim.dueAt.toISOString(), leaseUntil: claim.leaseUntil.toISOString() }
}

function instant(value: unknown): Date | null {
  if (typeof value !== 'string') return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

/** The claim of a queue payload, or null when it carries none or a malformed one. */
export function parseClubJobClaim(payload: unknown): ClubJobClaim | null {
  if (!payload || typeof payload !== 'object') return null
  const claim = (payload as Record<string, unknown>)[CLUB_JOB_CLAIM_KEY]
  if (!claim || typeof claim !== 'object') return null
  const dueAt = instant((claim as Record<string, unknown>).dueAt)
  const leaseUntil = instant((claim as Record<string, unknown>).leaseUntil)
  return dueAt && leaseUntil ? { dueAt, leaseUntil } : null
}

const ERROR_CODE = /^[a-z][a-z0-9_.:-]{0,99}$/i

/**
 * The code stored as `last_error`: the error's own `code` when it is a short identifier (a business error code),
 * else `failed`. Never the message, which may name a person.
 */
export function clubJobErrorCode(error: unknown): string {
  const code = error && typeof error === 'object' ? (error as { code?: unknown }).code : undefined
  return typeof code === 'string' && ERROR_CODE.test(code) ? code : 'failed'
}

export type SweepPassDeps<Row> = {
  /** Claims at most `limit` due rows (the DD-M07 (a) statement). */
  claim(limit: number): Promise<readonly Row[]>
  /** Enqueues one claimed club's job. */
  enqueue(row: Row): Promise<void>
  /** Told about a club whose enqueue failed; its row stays leased and is claimed again after the lease. */
  onEnqueueError(row: Row, error: unknown): void
}

export type SweepOutcome<Row> = { passes: number; claimed: number; enqueued: Row[]; failed: Row[] }

/**
 * Claims and enqueues batch after batch until a batch is shorter than `batchSize` or `maxPasses` ran (the next tick
 * of the schedule continues). Every club is enqueued on its own, so one failure does not stop the rest.
 */
export async function sweepClubJobs<Row>(
  deps: SweepPassDeps<Row>,
  options: { batchSize: number; maxPasses: number },
): Promise<SweepOutcome<Row>> {
  const outcome: SweepOutcome<Row> = { passes: 0, claimed: 0, enqueued: [], failed: [] }
  while (outcome.passes < options.maxPasses) {
    const rows = await deps.claim(options.batchSize)
    outcome.passes += 1
    outcome.claimed += rows.length
    for (const row of rows) {
      try {
        await deps.enqueue(row)
        outcome.enqueued.push(row)
      } catch (error: unknown) {
        outcome.failed.push(row)
        deps.onEnqueueError(row, error)
      }
    }
    if (rows.length < options.batchSize) break
  }
  return outcome
}

export type ClaimedRunDeps<Result> = {
  /** Takes the run lease when the claim still holds; false: another run took over or the due time was done. */
  start(): Promise<boolean>
  run(): Promise<Result>
  /** Stores the next due time from the run's result and clears the lease. */
  finish(result: Result): Promise<void>
  /** Stores the error code and a retry time and clears the lease. */
  fail(error: unknown): Promise<void>
}

export type ClaimedRunOutcome = 'skipped' | 'finished' | 'failed'

/** One club's claimed run: start, run, finish — or record the failure without throwing it into the queue. */
export async function runClaimedClubJob<Result>(deps: ClaimedRunDeps<Result>): Promise<ClaimedRunOutcome> {
  if (!(await deps.start())) return 'skipped'
  let result: Result
  try {
    result = await deps.run()
  } catch (error: unknown) {
    await deps.fail(error)
    return 'failed'
  }
  await deps.finish(result)
  return 'finished'
}
