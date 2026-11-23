// `foundation:club-job-sweep` (many-clubs spec DD-M04, DD-M07 (a); #629): the worker behind the system-scope sweep
// schedule of every job type. The schedule's payload names the job type (`jobKey`); the run claims the clubs whose
// run of it is due and enqueues one job per club on the module's own queue (`services/club-jobs.ts`). The scheduler
// injects a null scope: a sweep has no club; every club it finds is narrowed to at once.
import { z } from 'zod'
import type { QueuedJob, WorkerMeta } from '@open-mercato/queue'
import { createRequestContainer } from '@open-mercato/shared/lib/di/container'
import { createLogger } from '@open-mercato/shared/lib/logger'
import { CLUB_JOB_SWEEP_QUEUE, CLUB_JOB_SWEEP_WORKER, sweepClubJobType } from '../services/club-jobs'

const logger = createLogger('foundation').child({ component: 'club-job-sweep-worker' })

export const metadata: WorkerMeta = {
  queue: CLUB_JOB_SWEEP_QUEUE,
  id: CLUB_JOB_SWEEP_WORKER,
  concurrency: 1,
}

const payloadSchema = z.object({ jobKey: z.string().min(1).max(200) })

export default async function handle(job: QueuedJob<Record<string, unknown>>): Promise<void> {
  const parsed = payloadSchema.safeParse(job.payload)
  if (!parsed.success) {
    logger.warn('foundation:club-job-sweep received a payload without a job type; skipped')
    return
  }
  await sweepClubJobType(await createRequestContainer(), parsed.data.jobKey)
}
