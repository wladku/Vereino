// `foundationClubJobs` (many-clubs spec DD-M04…DD-M07, BR-M2; E22-S03 #629): one sweep schedule per job type instead
// of one schedule per club and job type. Modules declare their per-club jobs (`declareClubJobs`, from their `di.ts`);
// each club has one `foundation_club_jobs` row per job type with its next due time. The system-scope sweep schedule of
// a job type (`foundation:club-job-sweep`, payload `{ jobKey }`) claims the due rows and enqueues one job per club on
// the module's own `<module>-<name>` queue, with the club's `tenantId`/`organizationId` and the claim; the module's
// worker, wrapped in `clubJobWorker`, starts only while the claim holds and stores the next due time when it ends.
//
// Rollout (spec *Rollout*, expand/contract): a job type runs per club through its old schedules until the operator
// runs `foundation retire-club-schedules --job <key>`, which registers the job type's sweep schedule and removes the
// per-club ones; `restore-club-schedules --job <key>` is the rollback. While a job type's sweep schedule exists, a
// new club's setup registers no per-club schedule for it. `foundation:dispatch-sweep` is retired the same way, onto
// one system-scope dispatch sweep (DD-M07 (b), `workers/dispatch-sweep.ts`).
import type { EntityManager } from '@mikro-orm/postgresql'
import type { AwilixContainer } from 'awilix'
import { createModuleQueue, type QueuedJob, type Queue } from '@open-mercato/queue'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { z } from 'zod'
import {
  claimDueClubJobs,
  clubJobCounts,
  clubJobsOf,
  clubsWithJobState,
  deleteClubJobs,
  finishClubJobRun,
  insertClubJob,
  perClubSchedules,
  rescheduleClubJob,
  startClubJobRun,
  wakeClubJob,
  type ClaimedClubJob,
  type ClubJobScope,
} from '../data/queries'
import {
  ENQUEUE_LEASE_MS,
  SWEEP_BATCH_SIZE,
  assertClubJobDeclaration,
  clubJobQueue,
  dueAfterFailure,
  dueAfterRun,
  nextClubJobDue,
  parseClubJobKey,
  perClubScheduleSpec,
  runLeaseMs,
  type ClubJobDeclaration,
} from '../lib/club-job-due'
import {
  CLUB_JOB_CLAIM_KEY,
  clubJobErrorCode,
  parseClubJobClaim,
  runClaimedClubJob,
  serializeClubJobClaim,
  sweepClubJobs,
  type ClaimedRunOutcome,
} from '../lib/club-job-run'
import { registerModuleSchedule, stableScheduleUuid, type SchedulerServiceLike } from './register-module-schedule'

const logger = createLogger('foundation').child({ component: 'club-jobs' })

/** The queue and worker of the job sweeps (one worker; each job type's schedule names its key in the payload). */
export const CLUB_JOB_SWEEP_QUEUE = 'foundation-club-job-sweep'
export const CLUB_JOB_SWEEP_WORKER = 'foundation:club-job-sweep'
/** How often a job type's sweep runs: every 5 minutes (a club's run starts at most this late). */
export const CLUB_JOB_SWEEP_INTERVAL = '5m' as const

/** The per-club dispatch sweeper of the old setup and its system-scope replacement (DD-M07 (b)), every 2 minutes. */
export const DISPATCH_SWEEP_KEY = 'foundation:dispatch-sweep'
export const DISPATCH_SWEEP_QUEUE = 'foundation-dispatch-sweep'
export const DISPATCH_SWEEP_INTERVAL = '2m' as const

/** At most this many passes per sweep run (200 clubs each); the next tick continues. */
const MAX_SWEEP_PASSES = 25

/** The club zone when `club_core` is absent (club spec DD-37 default). */
const FALLBACK_TIME_ZONE = 'Europe/Warsaw'
const CLUB_CORE_SETTINGS = 'clubCoreSettings'

// --- Declarations ---

// One registry per process: a bundler may load this file more than once (route chunks, workers, the CLI).
const REGISTRY_KEY = Symbol.for('vereino.foundation.clubJobDeclarations')
const registryHost = globalThis as typeof globalThis & { [REGISTRY_KEY]?: Map<string, ClubJobDeclaration> }
const declarations: Map<string, ClubJobDeclaration> = (registryHost[REGISTRY_KEY] ??= new Map<
  string,
  ClubJobDeclaration
>())

/** Declares a module's per-club jobs (from its `di.ts`; idempotent, the last declaration of a key wins). */
export function declareClubJobs(jobs: readonly ClubJobDeclaration[]): void {
  for (const job of jobs) {
    assertClubJobDeclaration(job)
    declarations.set(job.key, job)
  }
}

/** Every declared job type, by key. */
export function clubJobDeclarations(): ClubJobDeclaration[] {
  return [...declarations.values()].sort((a, b) => a.key.localeCompare(b.key))
}

/** A declared job type, or null for an unknown key (the sweep logs and skips it). */
export function clubJobDeclaration(key: string): ClubJobDeclaration | null {
  return declarations.get(key) ?? null
}

// --- Context ---

function forkEm(container: AwilixContainer): EntityManager {
  return container.resolve<EntityManager>('em').fork()
}

function scheduler(container: AwilixContainer): SchedulerServiceLike | null {
  return container.hasRegistration('schedulerService')
    ? container.resolve<SchedulerServiceLike>('schedulerService')
    : null
}

/** The club's time zone from `club_core` (optional DI), else the default zone. */
export async function clubJobTimeZone(container: AwilixContainer, scope: ClubJobScope): Promise<string> {
  if (!container.hasRegistration(CLUB_CORE_SETTINGS)) return FALLBACK_TIME_ZONE
  const settings = container.resolve<{ get(scope: ClubJobScope): Promise<{ values: { timezone: string } }> }>(
    CLUB_CORE_SETTINGS,
  )
  return (await settings.get(scope)).values.timezone
}

async function clockOf(container: AwilixContainer, scope: ClubJobScope, now: Date) {
  return { now, timeZone: await clubJobTimeZone(container, scope), organizationId: scope.organizationId }
}

function requireDeclaration(key: string): ClubJobDeclaration {
  const declaration = clubJobDeclaration(key)
  if (!declaration) throw new RangeError(`[internal] unknown club job ${JSON.stringify(key)}`)
  return declaration
}

// --- Sweep schedules ---

/** The stable id of a job type's system-scope sweep schedule. */
export function sweepScheduleId(key: string): string {
  return stableScheduleUuid(`${CLUB_JOB_SWEEP_WORKER}:${key}`)
}

/** The stable id of the system-scope dispatch sweep schedule. */
export function dispatchSweepScheduleId(): string {
  return stableScheduleUuid(`${DISPATCH_SWEEP_KEY}:system`)
}

/** Whether the job type runs on its sweep (its sweep schedule exists); false without the scheduler. */
export async function sweepEnabled(container: AwilixContainer, key: string): Promise<boolean> {
  const service = scheduler(container)
  if (!service) return false
  return service.exists(key === DISPATCH_SWEEP_KEY ? dispatchSweepScheduleId() : sweepScheduleId(key))
}

async function registerSweepSchedule(service: SchedulerServiceLike, key: string): Promise<void> {
  if (key === DISPATCH_SWEEP_KEY) {
    await service.register({
      id: dispatchSweepScheduleId(),
      name: DISPATCH_SWEEP_KEY,
      scopeType: 'system',
      scheduleType: 'interval',
      scheduleValue: DISPATCH_SWEEP_INTERVAL,
      timezone: 'UTC',
      targetType: 'queue',
      targetQueue: DISPATCH_SWEEP_QUEUE,
      sourceType: 'module',
      sourceModule: 'foundation',
      description: 'Resume the queued message deliveries of every club that are due or whose worker stopped.',
    })
    return
  }
  await service.register({
    id: sweepScheduleId(key),
    name: `${CLUB_JOB_SWEEP_WORKER} ${key}`,
    scopeType: 'system',
    scheduleType: 'interval',
    scheduleValue: CLUB_JOB_SWEEP_INTERVAL,
    timezone: 'UTC',
    targetType: 'queue',
    targetQueue: CLUB_JOB_SWEEP_QUEUE,
    targetPayload: { jobKey: key },
    sourceType: 'module',
    sourceModule: 'foundation',
    description: `Enqueue ${key} for every club whose run is due.`,
  })
}

// --- Per-club state ---

/**
 * A club's job of one declared type, at club setup: creates the club's job-state row (once) and — while the job type
 * has no sweep schedule yet — registers the per-club schedule of the old setup, as before. Never throws: returns
 * false when a step failed (logged), so a club's setup goes on.
 */
export async function setUpClubJob(
  container: AwilixContainer,
  scope: ClubJobScope,
  key: string,
  now: Date = new Date(),
): Promise<boolean> {
  try {
    const declaration = requireDeclaration(key)
    const clock = await clockOf(container, scope, now)
    await insertClubJob(forkEm(container), scope, key, nextClubJobDue(declaration.schedule, clock))
    if (await sweepEnabled(container, key)) return true
    const { module, name } = parseClubJobKey(key)
    return await registerModuleSchedule(container, {
      module,
      name,
      schedule: perClubScheduleSpec(declaration.schedule, clock.timeZone),
      scope,
      description: declaration.description,
    })
  } catch (error: unknown) {
    // Like `registerModuleSchedule`: a club's setup goes on; the caller reports `false` (`schedules` entry).
    logger.warn('Club job setup failed', { jobKey: key, organizationId: scope.organizationId, err: error })
    return false
  }
}

/** `initClub`: every declared job type (or the listed ones) for a club; returns the registration result per key. */
export async function initClub(
  container: AwilixContainer,
  scope: ClubJobScope,
  keys: readonly string[] = clubJobDeclarations().map((job) => job.key),
): Promise<Record<string, boolean>> {
  const result: Record<string, boolean> = {}
  for (const key of keys) result[key] = await setUpClubJob(container, scope, key)
  return result
}

/** `removeClub`: deletes the club's job-state rows (a deleted club, phase 4). */
export async function removeClub(container: AwilixContainer, scope: ClubJobScope): Promise<number> {
  return deleteClubJobs(forkEm(container), scope)
}

/** `wake`: the club's next run of a job type comes no later than `at` (DD-M06); never moves it later. */
export async function wake(container: AwilixContainer, scope: ClubJobScope, key: string, at: Date): Promise<boolean> {
  requireDeclaration(key)
  return wakeClubJob(forkEm(container), scope, key, at)
}

/**
 * The club's time zone changed (`club_core.settings.updated`): every time-of-day job's next run moves to the next
 * local run in the new zone (DD-M05), unless a run holds the lease. Returns the keys that moved.
 */
export async function rescheduleTimeOfDayJobs(
  container: AwilixContainer,
  scope: ClubJobScope,
  now: Date = new Date(),
): Promise<string[]> {
  const em = forkEm(container)
  const clock = await clockOf(container, scope, now)
  const moved: string[] = []
  for (const row of await clubJobsOf(em, scope)) {
    const declaration = clubJobDeclaration(row.jobKey)
    if (!declaration || !('dailyAt' in declaration.schedule)) continue
    const next = nextClubJobDue(declaration.schedule, clock)
    if (row.nextDueAt?.getTime() === next.getTime()) continue
    if (await rescheduleClubJob(em, scope, row.jobKey, next, now)) moved.push(row.jobKey)
  }
  return moved
}

// --- The sweep ---

const queues = new Map<string, Queue<Record<string, unknown>>>()

function queueOf(name: string): Queue<Record<string, unknown>> {
  let queue = queues.get(name)
  if (!queue) {
    queue = createModuleQueue<Record<string, unknown>>(name, { concurrency: 1 })
    queues.set(name, queue)
  }
  return queue
}

export type ClubJobSweepResult = {
  job: string
  passes: number
  claimed: number
  enqueued: Array<ClubJobScope & { dueAt: string }>
  failed: Array<ClubJobScope & { dueAt: string }>
}

const listed = (rows: ClaimedClubJob[]) =>
  rows.map((row) => ({
    tenantId: row.tenantId,
    organizationId: row.organizationId,
    dueAt: row.nextDueAt.toISOString(),
  }))

/**
 * One sweep of a job type: claims the clubs whose run is due (DD-M07 (a), 200 at a time) and enqueues one job per
 * club with its scope and claim. An unknown key is logged and skipped. `now` is a parameter for operators and tests.
 */
export async function sweepClubJobType(
  container: AwilixContainer,
  key: string,
  now: Date = new Date(),
): Promise<ClubJobSweepResult> {
  if (!clubJobDeclaration(key)) {
    logger.warn('Club job sweep for an undeclared job type; skipped', { jobKey: key })
    return { job: key, passes: 0, claimed: 0, enqueued: [], failed: [] }
  }
  const em = forkEm(container)
  const leaseUntil = new Date(now.getTime() + ENQUEUE_LEASE_MS)
  const queue = queueOf(clubJobQueue(key))
  const outcome = await sweepClubJobs<ClaimedClubJob>(
    {
      claim: (limit) => claimDueClubJobs(em, key, now, leaseUntil, limit),
      enqueue: async (row) => {
        await queue.enqueue({
          tenantId: row.tenantId,
          organizationId: row.organizationId,
          [CLUB_JOB_CLAIM_KEY]: serializeClubJobClaim({ dueAt: row.nextDueAt, leaseUntil }),
        })
      },
      onEnqueueError: (row, error) => {
        logger.warn('Club job enqueue failed; retried after the lease', {
          jobKey: key,
          organizationId: row.organizationId,
          err: error,
        })
      },
    },
    { batchSize: SWEEP_BATCH_SIZE, maxPasses: MAX_SWEEP_PASSES },
  )
  const result = {
    job: key,
    passes: outcome.passes,
    claimed: outcome.claimed,
    enqueued: listed(outcome.enqueued),
    failed: listed(outcome.failed),
  }
  // Counts only (no club names); the ids are in the operator's CLI output.
  logger.info('Club job sweep finished', {
    jobKey: key,
    claimed: result.claimed,
    enqueued: result.enqueued.length,
    failed: result.failed.length,
  })
  return result
}

// --- The run ---

/** What a wrapped worker may return (anything else counts as nothing): its own next due time, capped (DD-M06). */
export type ClubJobRunResult = { nextDueAt?: Date | null }

/** The `nextDueAt` a handler returned, or null. */
function requestedNextDue(result: unknown): Date | null {
  if (!result || typeof result !== 'object') return null
  const { nextDueAt } = result as ClubJobRunResult
  return nextDueAt instanceof Date ? nextDueAt : null
}

const scopeSchema = z.object({ tenantId: z.uuid(), organizationId: z.uuid() })

/**
 * Wraps a per-club worker's handler. A job the sweep enqueued carries its claim: the run starts only while the claim
 * holds (a duplicate or stale copy is skipped), and at its end the club's next due time is stored — or, when the
 * handler throws, the error code and a retry time, without failing the queue job, so one club's failure stays its
 * own. A job without a claim (a per-club schedule of the old setup, an operator's run) runs the handler as before.
 */
export function clubJobWorker(
  key: string,
  handle: (job: QueuedJob<Record<string, unknown>>) => Promise<unknown>,
): (job: QueuedJob<Record<string, unknown>>) => Promise<void> {
  return async function clubJobHandler(job) {
    const claim = parseClubJobClaim(job.payload)
    const scope = scopeSchema.safeParse(job.payload)
    if (!claim || !scope.success) {
      await handle(job)
      return
    }
    await runClubJobClaim(await createRequestContainer(), scope.data, key, claim, () => handle(job))
  }
}

/** One claimed run of a club's job (the body of `clubJobWorker`). */
export async function runClubJobClaim(
  container: AwilixContainer,
  scope: ClubJobScope,
  key: string,
  claim: { dueAt: Date; leaseUntil: Date },
  run: () => Promise<unknown>,
): Promise<ClaimedRunOutcome> {
  const declaration = clubJobDeclaration(key)
  if (!declaration) {
    logger.warn('Claimed run of an undeclared club job; skipped', { jobKey: key })
    return 'skipped'
  }
  const em = forkEm(container)
  const startedAt = new Date()
  const runLeaseUntil = new Date(startedAt.getTime() + runLeaseMs(declaration))
  const outcome = await runClaimedClubJob<unknown>({
    start: () => startClubJobRun(em, scope, key, claim, runLeaseUntil, startedAt),
    run,
    finish: async (result) => {
      const now = new Date()
      // The next run comes after the one that was due, even when this process's clock lags the sweep's.
      const clock = await clockOf(container, scope, new Date(Math.max(now.getTime(), claim.dueAt.getTime())))
      const requested = requestedNextDue(result)
      await finishClubJobRun(
        em,
        scope,
        key,
        runLeaseUntil,
        { nextDueAt: dueAfterRun(declaration.schedule, clock, requested), error: null },
        now,
      )
    },
    fail: async (error) => {
      const now = new Date()
      logger.error('Club job run failed; retried later', {
        jobKey: key,
        organizationId: scope.organizationId,
        err: error,
      })
      await finishClubJobRun(
        em,
        scope,
        key,
        runLeaseUntil,
        { nextDueAt: dueAfterFailure(declaration.schedule, now), error: clubJobErrorCode(error) },
        now,
      )
    },
  })
  if (outcome === 'skipped') logger.info('Club job run skipped: its claim no longer holds', { jobKey: key })
  return outcome
}

// --- Operator commands ---

/** Every job type the operator commands accept: the declared ones and the dispatch sweep. */
export function retirableJobKeys(): string[] {
  return [DISPATCH_SWEEP_KEY, ...clubJobDeclarations().map((job) => job.key)]
}

export type RetireResult = {
  job: string
  /** Clubs that still had a per-club schedule of the job type. */
  clubs: number
  /** Per-club schedules removed (0 on a dry run). */
  retired: number
  /** Job-state rows created for those clubs. */
  rowsCreated: number
  sweepRegistered: boolean
}

/**
 * `retire-club-schedules --job <key>`: for every club with a per-club schedule of the job type, creates its job-state
 * row, then registers the job type's sweep schedule, then removes the per-club schedules. Idempotent; a dry run only
 * counts. The order keeps a club covered at every step: a run may happen twice around the switch, never not at all.
 */
export async function retireClubSchedules(
  container: AwilixContainer,
  key: string,
  options: { dryRun?: boolean; now?: Date } = {},
): Promise<RetireResult> {
  const service = scheduler(container)
  if (!service) throw new Error('[internal] the scheduler module is not enabled')
  const em = forkEm(container)
  const schedules = await perClubSchedules(em, key)
  const declaration = key === DISPATCH_SWEEP_KEY ? null : requireDeclaration(key)
  const result: RetireResult = { job: key, clubs: schedules.length, retired: 0, rowsCreated: 0, sweepRegistered: false }
  if (options.dryRun) {
    result.sweepRegistered = await sweepEnabled(container, key)
    return result
  }
  if (declaration) {
    for (const schedule of schedules) {
      const clock = await clockOf(container, schedule, options.now ?? new Date())
      if (await insertClubJob(em, schedule, key, nextClubJobDue(declaration.schedule, clock))) result.rowsCreated += 1
    }
  }
  await registerSweepSchedule(service, key)
  result.sweepRegistered = true
  for (const schedule of schedules) {
    await service.unregister(schedule.scheduleId)
    result.retired += 1
  }
  return result
}

export type RestoreResult = { job: string; clubs: number; restored: number; sweepRemoved: boolean }

/**
 * `restore-club-schedules --job <key>`, the rollback of one job type: re-registers the per-club schedule of the old
 * setup for every club with a job-state row (any row, for the dispatch sweep), then removes the sweep schedule.
 */
export async function restoreClubSchedules(container: AwilixContainer, key: string): Promise<RestoreResult> {
  const service = scheduler(container)
  if (!service) throw new Error('[internal] the scheduler module is not enabled')
  const em = forkEm(container)
  const dispatch = key === DISPATCH_SWEEP_KEY
  const declaration = dispatch ? null : requireDeclaration(key)
  const clubs = await clubsWithJobState(em, dispatch ? null : key)
  let restored = 0
  for (const scope of clubs) {
    const timeZone = await clubJobTimeZone(container, scope)
    const { module, name } = parseClubJobKey(key)
    const registered = await registerModuleSchedule(container, {
      module,
      name,
      schedule: declaration
        ? perClubScheduleSpec(declaration.schedule, timeZone)
        : { interval: DISPATCH_SWEEP_INTERVAL },
      scope,
      description: declaration?.description ?? 'Resume queued message deliveries that are due or whose worker stopped.',
    })
    if (registered) restored += 1
  }
  await service.unregister(dispatch ? dispatchSweepScheduleId() : sweepScheduleId(key))
  return { job: key, clubs: clubs.length, restored, sweepRemoved: true }
}

export type ClubJobStatus = {
  job: string
  sweep: boolean
  perClubSchedules: number
  clubs: number
  due: number
  leased: number
  failing: number
}

/** `club-jobs status`: per job type, whether its sweep runs, the per-club schedules left and the job-state counts. */
export async function clubJobsStatus(
  container: AwilixContainer,
  options: { job?: string; now?: Date } = {},
): Promise<ClubJobStatus[]> {
  const em = forkEm(container)
  const counts = new Map((await clubJobCounts(em, options.now ?? new Date())).map((row) => [row.jobKey, row]))
  const keys = options.job ? [options.job] : retirableJobKeys()
  const status: ClubJobStatus[] = []
  for (const key of keys) {
    const row = counts.get(key)
    status.push({
      job: key,
      sweep: await sweepEnabled(container, key),
      perClubSchedules: (await perClubSchedules(em, key)).length,
      clubs: row?.clubs ?? 0,
      due: row?.due ?? 0,
      leased: row?.leased ?? 0,
      failing: row?.failing ?? 0,
    })
  }
  return status
}
