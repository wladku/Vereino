// The progress job of the people import commit (foundation spec REQ-F08, AC-F08, TEST-F08; #585). The commit writes
// its rows inside a platform `ProgressService` job: created and started once the commit is authorized and no row waits
// for a decision, advanced per row while the commit's transaction runs, completed after that transaction commits.
// `ProgressService` writes through the request container's EntityManager, on its own connection, so the job's
// progress is visible while the commit's transaction (a fork with its own `begin`) is still open, and a rolled-back
// commit does not roll the job back: the job ends `failed` instead. A progress service that does not answer (not
// registered, or failing) refuses the commit with 503 `import_progress_unavailable` before anything is written, or
// rolls back what the transaction wrote so far: the import stays `previewed`. The job carries counts and the import's
// id only, never a cell value; a failure records the error code, never its message.
import type { AwilixContainer } from 'awilix'
import { getTelemetryRuntime } from '@open-mercato/shared/lib/telemetry/runtime'
import { peopleErrors } from '../api/errors'
import type { ClubScope } from './club-clock'

export const IMPORT_COMMIT_JOB_TYPE = 'people.imports.commit'

/** The job's state as the import view shows it while the commit runs and shortly after. */
export type ImportCommitProgressView = {
  jobId: string
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled'
  processedCount: number
  totalCount: number | null
  progressPercent: number
}

type ProgressContext = { tenantId: string; organizationId: string; userId?: string | null }

type ProgressJobLike = {
  id: string
  jobType: string
  status: ImportCommitProgressView['status']
  processedCount: number
  totalCount?: number | null
  progressPercent: number
  meta?: Record<string, unknown> | null
}

/** The part of the platform `ProgressService` (`progressService` in DI) the commit uses, declared structurally. */
type ProgressServiceLike = {
  createJob(input: Record<string, unknown>, ctx: ProgressContext): Promise<{ id: string }>
  startJob(jobId: string, ctx: ProgressContext): Promise<unknown>
  incrementProgress(jobId: string, delta: number, ctx: ProgressContext): Promise<unknown>
  completeJob(jobId: string, input: Record<string, unknown> | undefined, ctx: ProgressContext): Promise<unknown>
  failJob(jobId: string, input: Record<string, unknown>, ctx: ProgressContext): Promise<unknown>
  getActiveJobs(ctx: ProgressContext): Promise<ProgressJobLike[]>
  getRecentlyCompletedJobs(ctx: ProgressContext, sinceSeconds?: number): Promise<ProgressJobLike[]>
}

const PROGRESS_SERVICE = 'progressService'
/** How long a finished commit job still shows on the import (seconds). */
const RECENT_SECONDS = 120

function progressService(container: AwilixContainer): ProgressServiceLike | null {
  if (!container.hasRegistration(PROGRESS_SERVICE)) return null
  return container.resolve<ProgressServiceLike>(PROGRESS_SERVICE)
}

/** Reports a progress failure without its message (it may quote a value) and answers 503 `import_progress_unavailable`. */
async function unavailable(error: unknown): Promise<never> {
  getTelemetryRuntime()?.reportError(error, { module: 'people', code: 'people.imports.progress_unavailable' })
  return peopleErrors.throw('import_progress_unavailable')
}

/** The running commit job: advance it per row, then complete or fail it once the transaction has ended. */
export type ImportCommitJob = {
  readonly id: string
  advance(): Promise<void>
  complete(summary: Record<string, number | undefined>): Promise<void>
  fail(error: unknown): Promise<void>
}

/**
 * Creates and starts the commit's job for `totalCount` rows. Throws 503 `import_progress_unavailable` when the
 * progress service is not registered or does not answer; nothing is written to the import then.
 */
export async function startImportCommitJob(
  container: AwilixContainer,
  scope: ClubScope,
  input: { importId: string; totalCount: number; userId?: string | null },
): Promise<ImportCommitJob> {
  const service = progressService(container)
  if (!service) return unavailable(new Error('[internal] the progress service is not registered'))
  const ctx: ProgressContext = { ...scope, userId: input.userId ?? null }
  let jobId: string
  try {
    const job = await service.createJob(
      {
        jobType: IMPORT_COMMIT_JOB_TYPE,
        name: 'People import',
        ...(input.totalCount > 0 ? { totalCount: input.totalCount } : {}),
        cancellable: false,
        meta: { importId: input.importId },
      },
      ctx,
    )
    jobId = job.id
    await service.startJob(jobId, ctx)
  } catch (error: unknown) {
    return unavailable(error)
  }
  return {
    id: jobId,
    async advance() {
      try {
        await service.incrementProgress(jobId, 1, ctx)
      } catch (error: unknown) {
        await unavailable(error)
      }
    },
    async complete(summary) {
      // The import is committed: a job that cannot be completed is reported and left to the stale sweep.
      try {
        await service.completeJob(jobId, { resultSummary: summary }, ctx)
      } catch (error: unknown) {
        getTelemetryRuntime()?.reportError(error, { module: 'people', code: 'people.imports.progress_complete_failed' })
      }
    },
    async fail(error) {
      const body =
        typeof error === 'object' && error !== null ? (error as { body?: { code?: unknown } }).body : undefined
      const code = typeof body?.code === 'string' ? body.code : 'internal'
      try {
        await service.failJob(jobId, { errorMessage: `The commit was rolled back: ${code}` }, ctx)
      } catch (failError: unknown) {
        getTelemetryRuntime()?.reportError(failError, { module: 'people', code: 'people.imports.progress_fail_failed' })
      }
    },
  }
}

/**
 * The latest commit job of an import, running or finished in the last two minutes; null when there is none or the
 * progress service does not answer (the import view still loads then).
 */
export async function findImportCommitProgress(
  container: AwilixContainer,
  scope: ClubScope,
  importId: string,
): Promise<ImportCommitProgressView | null> {
  const service = progressService(container)
  if (!service) return null
  try {
    const ctx: ProgressContext = { ...scope }
    const ofImport = (job: ProgressJobLike) => job.jobType === IMPORT_COMMIT_JOB_TYPE && job.meta?.importId === importId
    const job =
      (await service.getActiveJobs(ctx)).find(ofImport) ??
      (await service.getRecentlyCompletedJobs(ctx, RECENT_SECONDS)).find(ofImport)
    if (!job) return null
    return {
      jobId: job.id,
      status: job.status,
      processedCount: job.processedCount,
      totalCount: job.totalCount ?? null,
      progressPercent: job.progressPercent,
    }
  } catch (error: unknown) {
    getTelemetryRuntime()?.reportError(error, { module: 'people', code: 'people.imports.progress_read_failed' })
    return null
  }
}
